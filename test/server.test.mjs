import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('local HTTP serves templates, rejects missing config and cross-site requests',async()=>{
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14317',ARK_API_KEY:'',ARK_IMAGE_MODEL:'doubao-seedream-5-0-pro-260628',SCENE_PERSIST_CONFIG:'0'},stdio:['ignore','pipe','pipe']});
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited early');}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Server startup timed out')),5000);t.unref();})]);
    const base='http://127.0.0.1:14317';
    const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/入景/);
    for(const asset of ['haichuang.png','haichuang-pixar-reference.png','haichuang-reference.png','haichuang-framing.jpg']){const r=await fetch(base+'/assets/'+asset);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),asset.endsWith('.png')?'image/png':'image/jpeg');assert.ok((await r.arrayBuffer()).byteLength>1000);}
    for(const asset of ['cafe','street','park'])assert.equal((await fetch(base+'/assets/'+asset+'.png')).status,404);
    assert.deepEqual(await (await fetch(base+'/api/config')).json(),{provider:'ark',hasKey:false,model:'doubao-seedream-5-0-pro-260628'});
    const rejected=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({stage:'cutout'})});assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/配置/);
    const crossSite=await fetch(base+'/api/config',{headers:{Origin:'https://other.example'}});assert.equal(crossSite.status,403);
    const save=await fetch(base+'/api/config',{method:'POST',body:JSON.stringify({key:'test-only-secret',model:'ep-test-image-model'})});assert.equal(save.status,200);
    const config=await (await fetch(base+'/api/config')).json();assert.equal(config.hasKey,true);assert.equal(config.model,'ep-test-image-model');assert.ok(!JSON.stringify(config).includes('test-only-secret'));
    const check=await (await fetch(base+'/api/test',{method:'POST'})).json();assert.match(check.message,/需首次生成验证/);
    const invalid=await fetch(base+'/api/generate',{method:'POST',body:JSON.stringify({scene:'unknown',strength:0.18})});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/场景/);
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/api/assets/unknown')).status,404);
  }finally{child.kill();await once(child,'exit');}
});
