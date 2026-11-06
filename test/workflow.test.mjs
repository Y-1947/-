import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGraph,validateGraph,selectOutput} from '../lib/workflow.mjs';
const graph={'12':{class_type:'LoadImage',inputs:{image:'original.png'}},'3':{class_type:'KSampler',inputs:{denoise:1}}};
test('bindings preserve types and leave original graph unchanged',()=>{const result=prepareGraph(graph,{subject:'12.image',denoise:'3.denoise'},{subject:'person.png',denoise:0.18});assert.equal(result['12'].inputs.image,'person.png');assert.equal(result['3'].inputs.denoise,0.18);assert.equal(graph['12'].inputs.image,'original.png');});
test('UI exports and invalid bindings fail before submission',()=>{assert.throws(()=>validateGraph({nodes:[],links:[]}));assert.throws(()=>prepareGraph(graph,{subject:'99.image'},{subject:'a.png'}));assert.throws(()=>prepareGraph(graph,{subject:'12.other'},{subject:'a.png'}));});
test('select only configured image output and reject ambiguous outputs',()=>{const a={id:'a',node_id:'20',content_type:'image/png'},b={id:'b',node_id:'21',content_type:'image/png'};assert.equal(selectOutput({outputs:[a,b]},'20'),a);assert.throws(()=>selectOutput({outputs:[a,b]}));assert.throws(()=>selectOutput({outputs:[]},'20'));});
