import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateGraph,prepareGraph,selectOutput} from '../lib/workflow.mjs';
const presets=JSON.parse(await readFile(new URL('../public/workflow-presets.json',import.meta.url),'utf8'));
test('installed fusion has a concrete SDXL model, real bindings, and size restoration',()=>{
  const f=presets.fusion;validateGraph(f.graph);assert.equal(f.graph['1'].inputs.ckpt_name,'sd_xl_base_1.0.safetensors');
  const result=prepareGraph(f.graph,f.bindings,{composite:'a.png',mask:'b.png',denoise:0.18,prompt:'preserve clothing'});
  assert.equal(result['2'].inputs.image,'a.png');assert.equal(result['3'].inputs.image,'b.png');assert.equal(result['9'].inputs.denoise,0.18);
  assert.deepEqual(result['12'].inputs.width,['11',0]);assert.deepEqual(result['12'].inputs.height,['11',1]);
  assert.equal(selectOutput({outputs:[{id:'output',content_type:'image/png',node_id:'13'}]},f.output).id,'output');
});
test('preset graphs contain no missing links or invented identity-reference bindings',()=>{
  for(const c of Object.values(presets)){validateGraph(c.graph);for(const n of Object.values(c.graph))for(const v of Object.values(n.inputs))if(Array.isArray(v))assert.ok(c.graph[v[0]],'missing link '+v[0]);}
  assert.equal(presets.fusion.bindings.subject,undefined);
  assert.equal(presets.cutout.graph['2'].class_type,'RecraftRemoveBackgroundNode');
});
