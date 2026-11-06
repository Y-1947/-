import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedApi,createHostedWorker,cleanHostedJobs} from '../lib/hosted.mjs';
import {seal,unseal} from '../lib/hosted-session.mjs';
import {hostedSecret} from '../lib/hosted-runtime.mjs';
const secret='test-only-session-secret-with-at-least-32-characters';
const subject='data:image/png;base64,iVBORw0KGgo=';
function fixture(generate){
  const data=new Map();let dispatch,cookie='';
  const store={
    async get(k,o){const v=data.get(k);return v===undefined?null:o?.type==='stream'?new Blob([v]).stream():structuredClone(v);},
    async setJSON(k,v,o){if(o?.onlyIfNew&&data.has(k))return {modified:false};data.set(k,structuredClone(v));return {modified:true};},
    async set(k,v){data.set(k,v);},async delete(k){data.delete(k);},
    async list({prefix}){return {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  };
  const api=createHostedApi({getStore:()=>store,secret,fetchImpl:async(url,options)=>{dispatch=new Request(url,options);return new Response(null,{status:202});}});
  const worker=createHostedWorker({getStore:()=>store,secret,generate});
  async function request(path,body,otherCookie){
    const r=await api(new Request('https://example.test'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:otherCookie??cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    if(otherCookie===undefined&&r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  }
  return {data,store,api,worker,request,get dispatch(){return dispatch;}};
}
test('encrypted sessions reject tampering and expiry',()=>{
  const value=seal({key:'private-key',expiresAt:Date.now()+10000},secret);
  assert.equal(unseal(value,secret).key,'private-key');
  assert.equal(unseal(value.slice(0,-4)+'xxxx',secret),null);
  assert.equal(unseal(seal({expiresAt:0},secret),secret),null);
});
test('hosted tasks isolate browsers, return private images and run paid call once',async()=>{
  let calls=0;
  const f=fixture(async()=>{calls++;return {bytes:Buffer.from('image'),type:'image/png'};});
  await f.request('/api/config');await f.request('/api/config',{key:'private-key'});
  const config=await (await f.request('/api/config')).json();assert.equal(config.hasKey,true);assert.equal(config.key,undefined);
  assert.equal((await (await f.request('/api/config',undefined,'')).json()).hasKey,false);
  const response=await f.request('/api/generate',{stage:'cutout',subject});assert.equal(response.status,202);
  const {id}=await response.json();
  assert.equal((await f.request('/api/jobs/'+id,undefined,'')).status,404);
  const dispatch=f.dispatch.clone();await f.worker(f.dispatch);await f.worker(dispatch);
  assert.equal(calls,1);assert.equal(f.data.has('inputs/'+id),false);
  assert.equal((await (await f.request('/api/jobs/'+id)).json()).status,'succeeded');
  const image=await f.request('/api/assets/'+id);assert.equal(await image.text(),'image');assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.equal((await f.request('/api/assets/'+id,undefined,'')).status,404);
  assert.equal((await f.worker(new Request('https://example.test/worker',{method:'POST',body:JSON.stringify({id})}))).status,403);
  f.data.get('jobs/'+id).expiresAt=0;await cleanHostedJobs(f.store);assert.equal(f.data.size,0);
});
test('canceling a queued task prevents inference; errors do not retry or expose keys',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;throw new Error('bad private-key');});
  await f.request('/api/config',{key:'private-key'});
  const canceled=await (await f.request('/api/generate',{stage:'cutout',subject})).json();
  await f.request('/api/jobs/'+canceled.id+'/cancel',{});await f.worker(f.dispatch);assert.equal(calls,0);
  const failed=await (await f.request('/api/generate',{stage:'cutout',subject})).json();
  const duplicate=f.dispatch.clone();await f.worker(f.dispatch);await f.worker(duplicate);assert.equal(calls,1);
  const state=await (await f.request('/api/jobs/'+failed.id)).json();assert.equal(state.status,'failed');assert.equal(state.error.includes('private-key'),false);
});
test('cross-site API requests are rejected',async()=>{
  const f=fixture();const r=await f.api(new Request('https://example.test/api/config',{headers:{Origin:'https://elsewhere.test'}}));assert.equal(r.status,403);
});
test('concurrent server starts share one private session encryption key',async()=>{
  const f=fixture();
  const values=await Promise.all(Array.from({length:12},()=>hostedSecret(f.store)));
  assert.equal(new Set(values).size,1);assert.ok(values[0].length>=32);
  assert.equal(await hostedSecret(f.store),values[0]);
});
