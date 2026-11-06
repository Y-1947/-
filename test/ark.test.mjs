import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,generateImage,selectImage,DEFAULT_MODEL,ARK_BASE} from '../lib/ark.mjs';
const image='data:image/png;base64,iVBORw0KGgo=';
const input={model:DEFAULT_MODEL,subject:image,background:image,composite:image,scene:'haichuang',quality:'detail'};
test('Ark multi-reference request preserves aspect ratio and asks for one base64 result',()=>{
  const request=buildRequest(input);
  assert.deepEqual(request.image,[image,image,image]);
  assert.equal(request.size,'2256x1440');
  assert.equal(request.response_format,'b64_json');
  assert.equal(buildRequest({...input,scene:'haichuang'}).size,'2256x1440');
  assert.match(request.prompt,/图2.*人物/);
  assert.throws(()=>buildRequest({...input,scene:'unknown'}),/场景/);
  assert.throws(()=>buildRequest({...input,subject:'https://example.com/image'}),/图片/);
});
test('fast profile reduces output pixels while retaining scene ratio and enables Pro fast processing',()=>{
  for(const scene of ['haichuang','red','green','blue']){
    const fast=buildRequest({...input,scene,quality:'fast'}),detail=buildRequest({...input,scene,quality:'detail'});
    const [w,h]=fast.size.split('x').map(Number),[dw,dh]=detail.size.split('x').map(Number);
    assert.ok(w*h<dw*dh*0.4);assert.ok(w*h>=921600);assert.ok(Math.abs((w/h)/(dw/dh)-1)<0.01);
    assert.equal(fast.optimize_prompt_options.mode,'fast');assert.equal(detail.optimize_prompt_options.mode,'standard');
  }
  assert.equal(buildRequest({model:DEFAULT_MODEL,stage:'cutout',subject:image,quality:'fast'}).size,'1K');
  assert.equal(buildRequest({...input,model:'ep-custom-model',quality:'fast'}).optimize_prompt_options,undefined);
  assert.throws(()=>buildRequest({...input,quality:'bad'}),/出图模式/);
});
test('cutout requests a single complete transparent person layer, never chooses the background',()=>{
  const request=buildRequest({model:DEFAULT_MODEL,stage:'cutout',subject:image});
  assert.equal(request.layer_decomposition,true);assert.equal(request.image,image);
  assert.equal(request.output_format,'png');assert.match(request.prompt,/同一个人物图层/);
  const person={z_index:1,b64_json:'iVBORw0KGgo='};
  assert.equal(selectImage([{z_index:0,b64_json:'background'},person],true),person);
  assert.throws(()=>selectImage([{z_index:0}],true),/无法确认完整人物/);
  assert.throws(()=>selectImage([person,{z_index:2}],true),/无法确认完整人物/);
});
test('fusion sends the already positioned composite as primary reference',()=>{
  const background='data:image/png;base64,Yg==',subject='data:image/png;base64,Yw==';
  const request=buildRequest({...input,background,subject});
  assert.deepEqual(request.image,[image,subject,background]);
  assert.match(request.prompt,/姿势、尺度、位置与裁切/);assert.match(request.prompt,/主光方向/);
  assert.equal(request.layer_decomposition,undefined);
});
test('fusion uses photographic references without adding a style image',()=>{
  const request=buildRequest({...input,reference:image});
  assert.equal(request.image.length,3);
  assert.match(request.prompt,/图2仅供核对人物身份/);
  assert.match(request.prompt,/柔和的现场光/);
  assert.match(request.prompt,/保留画面中已有的招牌、文字和图形/);
  assert.equal(request.watermark,false);
  for(const scene of ['cafe','street','park'])assert.throws(()=>buildRequest({...input,scene}),/场景/);
});
test('Ark image request uses Bearer authentication and returns decoded bytes',async()=>{
  let calls=0;
  const result=await generateImage(buildRequest(input),'secret',undefined,async(url,options)=>{
    calls++;assert.equal(url,ARK_BASE+'/images/generations');
    assert.equal(options.headers.Authorization,'Bearer secret');
    assert.equal(JSON.parse(options.body).model,DEFAULT_MODEL);
    return Response.json({data:[{b64_json:'iVBORw0KGgo='}]});
  });
  assert.equal(calls,1);assert.equal(result.type,'image/png');assert.equal(result.bytes.length,8);
});
test('Ark failures redact keys and never retry paid requests or report partial errors as success',async()=>{
  let calls=0;
  await assert.rejects(generateImage({},'secret',undefined,async()=>{calls++;return Response.json({error:{message:'invalid secret'}},{status:401});}),/invalid \[redacted\]/);
  assert.equal(calls,1);
  await assert.rejects(generateImage({},'secret',undefined,async()=>Response.json({data:[{error:{message:'image rejected'}}]})),/image rejected/);
  await assert.rejects(generateImage({},'secret',undefined,async()=>Response.json({data:[{b64_json:'aGVsbG8='}]})),/格式/);
});

test('fast fusion can place the original portrait without a separate cutout',()=>{
  const background='data:image/png;base64,Yg==';
  const request=buildRequest({...input,quality:'fast',background,composite:undefined});
  assert.deepEqual(request.image,[background,image]);
  assert.match(request.prompt,/仅提取图2的人物/);
  assert.equal(request.optimize_prompt_options.mode,'fast');
  assert.throws(()=>buildRequest({...input,composite:undefined}),/图片/);
});
