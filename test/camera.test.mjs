import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraErrorMessage,createCameraRequest,fitCameraFrame,fitCameraTarget} from '../public/camera.js';
import {placementBox} from '../public/placement.js';
test('permission denial remains explicit and does not repeatedly request access',async()=>{
  let calls=0;const request=createCameraRequest({async getUserMedia(){calls++;throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}});
  await assert.rejects(request.open(),{name:'NotAllowedError'});assert.equal(calls,1);assert.match(cameraErrorMessage({name:'NotAllowedError'}),/权限/);
});
test('rear camera uses its native mode without size or aspect ratio constraints',async()=>{
  let constraints;
  const request=createCameraRequest({getSupportedConstraints:()=>({resizeMode:true}),async getUserMedia(options){constraints=options;return {getTracks:()=>[]};}});
  await request.open('environment');assert.equal(constraints.video.facingMode.ideal,'environment');assert.equal(constraints.audio,false);
  for(const name of ['width','height','aspectRatio'])assert.equal(constraints.video[name],undefined);
  assert.equal(constraints.video.resizeMode.exact,'none');
});
test('camera background fits fully inside small phone and landscape viewfinders',()=>{
  for(const [width,height] of [[351,380],[296,180],[500,190]])for(const [sw,sh] of [[736,736],[736,1313]]){
    const fit=fitCameraFrame(width,height,sw,sh);assert.ok(fit.width<=width+1e-8);assert.ok(fit.height<=height+1e-8);
    assert.ok(Math.abs(fit.width/fit.height-sw/sh)<1e-8);
  }
});

test('portrait camera retains its entire native frame in phone viewfinders',()=>{
  for(const [width,height] of [[359,450],[304,220],[500,190]]){
    const fit=fitCameraFrame(width,height,1080,1440);
    assert.ok(fit.height>fit.width);
    assert.ok(fit.width<=width+1e-8&&fit.height<=height+1e-8);
    assert.ok(Math.abs(fit.width/fit.height-3/4)<1e-8);
  }
});

test('camera inset follows native video ratio inside unchanged scene placement area',()=>{
  for(const [sw,sh] of [[736,736],[736,1313]])for(const [vw,vh] of [[1080,1440],[1080,1920],[720,1600],[1920,1080]]){
    const fit=fitCameraTarget(sw,sh,placementBox,vw,vh);
    assert.ok(Math.abs(fit.w*sw/(fit.h*sh)-vw/vh)<1e-8);
    assert.ok(fit.x>=placementBox.x&&fit.y>=placementBox.y-1e-8);
    assert.ok(fit.x+fit.w<=placementBox.x+placementBox.w+1e-8);
    assert.ok(Math.abs(fit.y+fit.h-placementBox.y-placementBox.h)<1e-8);
    assert.ok(fit.w*fit.h<=placementBox.w*placementBox.h+1e-8);
  }
});
test('closing dialog while permission is pending releases the late camera stream',async()=>{
  let resolve,stopped=0;const request=createCameraRequest({getUserMedia:()=>new Promise(r=>resolve=r)});
  const pending=request.open();request.cancel();resolve({getTracks:()=>[{stop(){stopped++;}}]});assert.equal(await pending,null);assert.equal(stopped,1);
});
test('unsupported preferred constraints fall back to any available camera',async()=>{
  const calls=[];const stream={getTracks:()=>[]};const request=createCameraRequest({async getUserMedia(options){calls.push(options);if(calls.length===1)throw Object.assign(new Error('size'),{name:'OverconstrainedError'});return stream;}});
  assert.equal(await request.open(),stream);assert.deepEqual(calls[1],{video:{facingMode:{ideal:'environment'}},audio:false});
});
test('unavailable browser camera API provides actionable external-browser guidance',async()=>{
  await assert.rejects(createCameraRequest(undefined).open(),{name:'UnsupportedError'});assert.match(cameraErrorMessage({name:'UnsupportedError'}),/Edge/);
});
