import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCloudKey} from '../lib/cloud-auth.mjs';

test('connection test uses authenticated user endpoint and returns no account data',async()=>{
  const result = await verifyCloudKey('test-key',async(url,options)=>{
    assert.equal(url,'https://cloud.comfy.org/api/user');
    assert.equal(options.headers['X-API-Key'],'test-key');
    return Response.json({id:'private-account',email:'private@example.test'});
  });
  assert.deepEqual(result,{ok:true});
});
test('missing and invalid keys are rejected, not reported as connected',async()=>{
  await assert.rejects(verifyCloudKey('',()=>{throw new Error('must not fetch');}),/先保存/);
  await assert.rejects(verifyCloudKey('invalid',async()=>new Response('',{status:401})),/401/);
  await assert.rejects(verifyCloudKey('forbidden',async()=>new Response('',{status:403})),/403/);
});
test('upstream errors remain failures and redact credentials',async()=>{
  await assert.rejects(verifyCloudKey('private-key',async()=>new Response('failure private-key',{status:501})),e=>e.message.includes('501')&&!e.message.includes('private-key'));
});
