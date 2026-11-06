import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetForm} from '../lib/cloud-upload.mjs';
test('Cloud asset metadata precedes streaming file and preserves bytes',async()=>{
  const bytes=Buffer.from([137,80,78,71]);
  const form=createAssetForm(bytes,'image/png','portrait.png');
  assert.deepEqual([...form.keys()],['content_type','file_path','file']);
  assert.equal(form.get('content_type'),'image/png');
  assert.equal(form.get('file_path'),'portrait.png');
  assert.equal(form.get('file').name,'portrait.png');
  assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()),bytes);
});
