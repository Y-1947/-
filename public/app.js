import {cameraErrorMessage,createCameraRequest,stopTracks,fitCameraFrame} from './camera.js';
import {alphaBounds,fitPerson} from './placement.js';
import {scenes} from './scenes.js';
const $ = id => document.getElementById(id);
document.addEventListener('gesturestart',event=>event.preventDefault(),{passive:false});
document.addEventListener('touchmove',event=>{
  if(event.touches.length>1)event.preventDefault();
},{passive:false});
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const editions = scenes.filter(item => !item.legacy);
const templateButtons = editions.map(item => {
  const button = document.createElement('button');
  button.className = 'template';
  const image = new Image();
  image.src = item.thumbnail;
  image.alt = '';
  const label = document.createElement('span');
  label.textContent = item.name;
  button.append(image, label);
  button.onclick = () => selectScene(item);
  $('templates').append(button);
  return button;
});
let scene = editions[0], source, cutout, composite, fused, activeJob, busy = false, stream, showingOriginal = false;
let imageVersion = 0;
const backgrounds = {};
function loadImage(url) { return new Promise((resolve,reject)=>{const img = new Image(); img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('图片加载失败。'));img.src=url;}); }
function status(message, error = false) {
  const notice = $('status');
  const target = source || busy || error || fused ? $('actionStatus') : $('initialStatus');
  if (notice.parentElement !== target) target.append(notice);
  notice.textContent = message;
  notice.classList.toggle('error', error);
}
async function api(url,data) { const r=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error || '请求失败');return result; }
function setBusy(value) { busy=value;for(const el of document.querySelectorAll('#file,#uploadBtn,#cameraBtn,#quality,#generate,#settingsBtn,.template'))el.disabled=value || (el.id==='generate'&&!source);$('cancel').hidden=!value;$('download').disabled=value||!fused;$('compare').disabled=value||!fused; }
function setProgress(value, stage) {
  $('progressPanel').hidden = false;
  $('progress').value = value;
  $('progressPercent').textContent = value + '%';
  $('progressStage').textContent = stage;
}
function render() {
  const preview = showingOriginal ? composite : fused || composite || backgrounds[scene.id];
  if (preview) {
    canvas.width=scene.w;canvas.height=scene.h;
    ctx.drawImage(preview, 0, 0, scene.w, scene.h);
  }
  $('zoomPoster').hidden = !preview;
  $('zoomPoster').disabled = !fused || showingOriginal;
  $('previewLabel').hidden = !preview;
  $('generate').hidden = !source;
  $('download').hidden = !fused;
  $('compare').hidden = !fused || !composite;
  templateButtons.forEach((button, index) => {
    button.setAttribute('aria-pressed', String(scene === editions[index]));
  });
  $('previewLabel').textContent=fused?(showingOriginal?'人物定位预览 · 光影融合前':'AI 融合结果'):composite?'人物定位预览 · 光影融合前':scene.name+' · 模板预览';
}
function clearResults() { $('progressPanel').hidden=true;composite=fused=null;$('compare').textContent='查看 AI 处理前';showingOriginal=false;$('download').disabled=true;$('compare').disabled=true;for(let i=1;i<=3;i++)$('step'+i).className=''; }
async function useFile(file) {
  if(busy||!file)return;
  const version=++imageVersion;
  try {
    const type=file.type.toLowerCase();
    if(!['image/png','image/jpeg','image/webp','image/heic','image/heif'].includes(type))throw new Error('请选择相机照片，或 PNG、JPEG、WebP 图片。');
    if(file.size>12*1024*1024)throw new Error('照片不能超过 12 MB。');
    const url=URL.createObjectURL(file);let img;try{img=await loadImage(url);}catch{throw new Error('浏览器无法读取这张照片。请使用兼容 JPEG 的相机格式，或转换为 JPEG / PNG 后上传。');}finally{URL.revokeObjectURL(url);}
    if (version !== imageVersion || busy) return;
    if(img.width/img.height>16||img.height/img.width>16)throw new Error('照片画幅过长，请裁掉多余背景，保留完整人物。');
    if(img.width*img.height>32000000)throw new Error('图片分辨率过大，请缩小到 3200 万像素以内。');
    const c=document.createElement('canvas');const s=Math.min(1600/Math.max(img.width,img.height),Math.max(1,512/Math.min(img.width,img.height)));c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let hasAlpha=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<250){hasAlpha=true;break;}
    source=c.toDataURL(hasAlpha?'image/png':'image/jpeg',0.9);cutout=null;clearResults();render();setBusy(false);status('照片已就绪。点击「开始 AI 入景」后，系统会按所选模式自动生成。');
  }catch(e){status(e.message,true);}
}
$('uploadBtn').onclick = () => $('file').click();
$('file').onchange = e => {
  void useFile(e.target.files[0]);
  e.target.value = '';
};
for(const event of ['dragover','drop'])$('drop').addEventListener(event,e=>{e.preventDefault();if(event==='drop')useFile(e.dataTransfer.files[0]);});
function selectScene(item){
  if(busy || scene === item)return;scene=item;clearResults();
  render();updateCameraScene();status(source ? '已切换到'+scene.name+'，可以开始入景。' : '→ 已选'+scene.name+'，请拍摄或上传照片');
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function run(images){
  const result=await api('/api/generate',images);activeJob=result.id;
  sessionStorage.setItem('scene-ark-job',JSON.stringify({id:activeJob,scene:scene.id,stage:images.stage,photoOnly:true}));
  const label=images.stage==='cutout'?'提取透明人物':images.composite?'匹配现场光线与人物边缘':'生成人像与现场光影';
  const isCutout=images.stage==='cutout';
  const start=isCutout||!images.composite?5:45, end=isCutout?35:95;
  const started=Date.now();
  setProgress(start,label+' · 预计进度');
  status('方舟正在'+label+'…');
  const deadline=Date.now()+6*60*1000;
  while(Date.now()<deadline){
    const job=await api('/api/jobs/'+activeJob);
    if(job.status==='succeeded'){activeJob=null;sessionStorage.removeItem('scene-ark-job');return loadImage(job.image);}
    if(['failed','canceled'].includes(job.status)){activeJob=null;sessionStorage.removeItem('scene-ark-job');throw new Error(job.error||'已停止本地等待。方舟可能仍继续执行并计费，请检查控制台。');}
    const elapsed=(Date.now()-started)/1000;
    setProgress(start+Math.floor((end-start)*(1-Math.exp(-elapsed/30))),label+' · 预计进度');
    status('方舟正在'+label+' · 已等待 '+Math.floor(elapsed)+' 秒');await delay(800);
  }
  throw new Error('等待超时，请先在方舟控制台检查调用记录，避免重复付费。');
}
function requestPhoto(image) {
  const {x,y,w,h}=scene.photoBox;
  const c=document.createElement('canvas');
  c.width=Math.round(w*scene.w);
  c.height=Math.round(h*scene.h);
  c.getContext('2d').drawImage(image,x*scene.w,y*scene.h,w*scene.w,h*scene.h,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',0.9);
}
function clipPhoto(context) {
  const { x, y, w, h } = scene.photoBox;
  context.beginPath();
  if (scene.photoClip) {
    for (const [u, v] of scene.photoClip) {
      context.lineTo((x + u * w) * scene.w, (y + v * h) * scene.h);
    }
    context.closePath();
  } else {
    context.rect(x * scene.w, y * scene.h, w * scene.w, h * scene.h);
  }
  context.clip();
}
function makeComposite(image){
  const subjectCanvas=document.createElement('canvas');subjectCanvas.width=image.width;subjectCanvas.height=image.height;
  const subjectCtx=subjectCanvas.getContext('2d',{willReadFrequently:true});subjectCtx.drawImage(image,0,0);
  const bounds=alphaBounds(subjectCtx.getImageData(0,0,image.width,image.height).data,image.width,image.height);
  const fit=fitPerson(bounds,scene.w,scene.h,scene.personBox);
  const c=document.createElement('canvas');c.width=scene.w;c.height=scene.h;
  const cc=c.getContext('2d');cc.drawImage(backgrounds[scene.id],0,0);
  cc.save();clipPhoto(cc);
  cc.drawImage(image,bounds.x,bounds.y,bounds.w,bounds.h,fit.x,fit.y,fit.w,fit.h);
  cc.restore();
  return c;
}
function finishImage(image,photoOnly=true){
  const area=scene.photoBox;
  const ratio=image.width/image.height;
  const expected=photoOnly?(area.w*scene.w)/(area.h*scene.h):scene.w/scene.h;
  if(Math.abs(ratio/expected-1)>0.03)throw new Error('模型返回的画幅比例不正确，请检查模型是否支持指定尺寸。');
  const c=document.createElement('canvas');c.width=scene.w;c.height=scene.h;
  // Restore the exact original newspaper outside the photographic window.
  const cc=c.getContext('2d');
  cc.drawImage(backgrounds[scene.id],0,0,scene.w,scene.h);
  clipPhoto(cc);
  const sourceBox=photoOnly?[0,0,image.width,image.height]:
    [area.x*image.width,area.y*image.height,area.w*image.width,area.h*image.height];
  cc.drawImage(image,...sourceBox,area.x*scene.w,area.y*scene.h,area.w*scene.w,area.h*scene.h);
  return loadImage(c.toDataURL('image/png'));
}
$('generate').onclick=async()=>{
  if(busy||activeJob||!source)return;
  const generationStarted=Date.now();
  setBusy(true);
  status('正在准备 AI 入景…');
  try{
    const c=await api('/api/config');if(!c.hasKey){$('settings').showModal();throw new Error(c.managed?'站点管理员尚未配置火山方舟。':'请先填写火山方舟 API Key 和图片模型 ID。');}
    clearResults();render();
    const quality=$('quality').value;
    if(quality==='detail'){
      setProgress(5,'准备抠图 · 预计进度');$('step1').className='active';
      if(!cutout){cutout=await run({stage:'cutout',subject:source,quality});}
      $('step1').className='done';$('step2').className='active';
      setProgress(40,'人物入框 · 预计进度');
      composite=makeComposite(cutout);render();
      $('step2').className='done';
      status('人物已入框，正在自动进行光影融合…');
    }else{
      setProgress(5,'快速入景 · 预计进度');
    }
    $('step3').className='active';
    const image=await run({stage:'fusion',quality,subject:source,background:requestPhoto(backgrounds[scene.id]),composite:composite?requestPhoto(composite):undefined,scene:scene.id});
    setProgress(98,'正在合成海报');
    fused=await finishImage(image);
    setProgress(100,'生成完成');
    $('step3').className='done';render();status('入景完成 · 用时 '+Math.round((Date.now()-generationStarted)/1000)+' 秒。请对照检查人物与现场光线的融合效果。');
  }catch(e){$('progressPanel').hidden=true;status(e.message,true);}finally{setBusy(false);if(activeJob){$('cancel').hidden=false;$('generate').disabled=true;}}
};
$('cancel').onclick=async()=>{
  if(!activeJob){status('正在提交请求，请等待任务 ID。');return;}
  try{await api('/api/jobs/'+activeJob+'/cancel',{});if(!busy){activeJob=null;sessionStorage.removeItem('scene-ark-job');setBusy(false);}status('已停止本地等待；方舟可能继续执行并计费，请检查控制台。');}catch(e){status(e.message,true);}
};
$('zoomPoster').onclick=()=>{
  if(!fused || showingOriginal)return;
  $('posterImage').src=fused.src;
  $('posterDialog').showModal();
  const viewport=$('posterViewport');
  viewport.scrollTop=0;
  viewport.scrollLeft=(viewport.scrollWidth-viewport.clientWidth)/2;
};
$('closePoster').onclick=()=>$('posterDialog').close();
$('posterDialog').onclick=event=>{if(event.target===$('posterDialog'))$('posterDialog').close();};
$('posterDialog').addEventListener('close',()=>$('posterImage').removeAttribute('src'));
$('download').onclick=()=>{if(!fused)return;const a=document.createElement('a');a.href=fused.src;a.download=`入景-${scene.name}.png`;a.click();};
$('compare').onclick=()=>{if(!composite){status('刷新后未保留 AI 处理前的合成图，请直接检查恢复的结果。');return;}showingOriginal=!showingOriginal;render();$('compare').textContent=showingOriginal?'返回 AI 融合结果':'查看 AI 处理前';};
$('settingsBtn').onclick=()=>{if(!busy)$('settings').showModal();};$('closeSettings').onclick=()=>$('settings').close();
async function refreshConfig(){
  const c=await api('/api/config');
  $('connection').textContent=c.hasKey?'已配置':'待配置';
  $('model').value=c.model;
  if(c.managed){
    $('key').disabled=true;
    $('model').disabled=true;
    $('configForm').querySelector('[type=submit]').disabled=true;
    $('keyStorageHint').textContent='方舟配置由站点管理员管理。生成结果临时保存在服务器，请及时下载。';
  }else if(c.shared)$('keyStorageHint').textContent='站点已提供默认方舟配置，可直接生成。也可以填写自己的密钥和模型。照片和结果会临时上传云端，结果保留 1 小时。';
  else if(c.hosted)$('keyStorageHint').textContent='密钥通过加密的 HttpOnly 会话保存，仅当前浏览器可用，有效期 24 小时。人物照片和生成结果会临时上传云端，结果保留 1 小时，请及时下载。停止等待不保证云端取消或免除计费。';
  $('presetStatus').textContent=c.managed?(c.hasKey?'火山方舟 · 站点已配置':'火山方舟 · 等待站点管理员配置'):'火山方舟 · 密钥'+(c.hasKey?'已保存':'待填写')+' · 实际权限需生成验证';
}
$('configForm').onsubmit=async e=>{e.preventDefault();try{
  await api('/api/config',{key:$('key').value,model:$('model').value});$('key').value='';await refreshConfig();$('configStatus').textContent='已保存。关闭设置即可生成；每次生成会消耗方舟额度。';
}catch(e){$('configStatus').textContent=e.message;}};
$('testConnection').onclick=async()=>{try{const result=await api('/api/test',{});$('configStatus').textContent=result.message;}catch(e){$('configStatus').textContent=e.message;}};
const cameraRequest=createCameraRequest(navigator.mediaDevices);
let cameraOpening=false,permissionTimer,previewTimer,cameraEpoch=0,facingMode='environment';
function layoutCamera(){
  if(!$('camera').open)return;
  const video=$('video');
  // Portrait phones use the full width; allow scrolling rather than cropping the poster.
  const well=$('cameraWell');
  well.style.setProperty('--camera-scene-ratio',scene.w+'/'+scene.h);
  const fullWidth=window.matchMedia('(max-width:650px) and (orientation:portrait)').matches;
  const fit=fullWidth?{width:well.clientWidth,height:well.clientWidth*scene.h/scene.w}:fitCameraFrame(Math.max(1,well.clientWidth-24),Math.max(1,well.clientHeight-8),scene.w,scene.h);
  Object.assign($('cameraFrame').style,{width:fit.width+'px',height:fit.height+'px'});
  const ready=!!(stream&&video.videoWidth&&video.videoHeight);
  $('cameraTarget').hidden=!ready;
  if(!ready)return;
  const target=scene.photoBox;
  Object.assign($('cameraTarget').style,{left:target.x*100+'%',top:target.y*100+'%',width:target.w*100+'%',height:target.h*100+'%'});
}
function updateCameraScene(){
  $('cameraBackground').src=scene.image;$('cameraBackground').alt=scene.name+'拍摄背景';
  $('cameraSceneName').textContent=scene.name;$('cameraSceneCount').textContent=(editions.indexOf(scene)+1)+' / '+editions.length;
  layoutCamera();
}
if(window.ResizeObserver)new ResizeObserver(layoutCamera).observe($('cameraWell'));
window.addEventListener('resize',layoutCamera);
function stopCamera(){
  cameraEpoch++;cameraRequest.cancel();clearTimeout(permissionTimer);clearTimeout(previewTimer);stopTracks(stream);stream=null;
  $('video').srcObject=null;$('video').hidden=true;cameraOpening=false;$('capture').disabled=true;$('retryCamera').disabled=false;$('flipCamera').disabled=false;
}
async function openCamera(){
  if(busy||cameraOpening)return;
  stopCamera();const epoch=cameraEpoch;cameraOpening=true;
  if(!$('camera').open)$('camera').showModal();document.body.classList.add('camera-open');$('camera').scrollTop=0;
  updateCameraScene();$('capture').disabled=true;$('retryCamera').disabled=true;$('flipCamera').disabled=true;
  $('cameraStatus').textContent='正在请求相机权限，请选择允许；也可使用系统相机。';
  permissionTimer=setTimeout(()=>{$('cameraStatus').textContent='仍在等待授权，可允许浏览器相机权限，或使用下方系统相机。';},8000);
  try{
    if(!window.isSecureContext)throw Object.assign(new Error('Secure context required'),{name:'InsecureContextError'});
    const result=await cameraRequest.open(facingMode);if(!result||epoch!==cameraEpoch)return;
    clearTimeout(permissionTimer);stream=result;$('video').srcObject=stream;$('video').hidden=false;
    const actual=result.getVideoTracks()[0]?.getSettings?.().facingMode||facingMode;
    $('video').classList.toggle('mirrored',actual==='user');
    $('cameraStatus').textContent='正在加载画面…';
    previewTimer=setTimeout(()=>{$('cameraStatus').textContent='尚未收到画面，请重试取景或使用系统相机。';},10000);
    await $('video').play();
  }catch(error){
    if(!$('camera').open||epoch!==cameraEpoch)return;
    stopCamera();const message=cameraErrorMessage(error);$('cameraStatus').textContent=message;status(message,true);
  }finally{if(epoch===cameraEpoch){cameraOpening=false;$('retryCamera').disabled=false;$('flipCamera').disabled=false;}}
}
$('video').addEventListener('loadeddata',()=>{
  if(!stream||!$('camera').open||!$('video').videoWidth)return;
  layoutCamera();clearTimeout(previewTimer);$('capture').disabled=false;$('cameraStatus').textContent='人物在背景框内、脸部清晰即可，大小和半身构图交给 AI。';
});
$('video').addEventListener('resize',layoutCamera);
$('cameraBtn').onclick=openCamera;$('retryCamera').onclick=openCamera;
$('flipCamera').onclick=()=>{facingMode=facingMode==='user'?'environment':'user';$('cameraUpload').setAttribute('capture',facingMode);stopCamera();void openCamera();};
$('cameraPrev').onclick=()=>selectScene(editions[(editions.indexOf(scene)+editions.length-1)%editions.length]);
$('cameraNext').onclick=()=>selectScene(editions[(editions.indexOf(scene)+1)%editions.length]);
for(const id of ['cameraUpload','cameraAlbum']){
  $(id).addEventListener('click',()=>{stopCamera();$('cameraStatus').textContent='返回后可使用照片，或点击重试取景。';});
  $(id).onchange=e=>{const file=e.target.files[0];if(!file)return;void useFile(file);$('camera').close();e.target.value='';};
}
$('copyCameraUrl').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+'/');$('cameraStatus').textContent='地址已复制。上线后请通过 HTTPS 打开并允许相机。';}catch{$('cameraStatus').textContent='请手动复制网站地址。';}};
$('cameraUrl').value=location.origin+'/';$('closeCamera').onclick=()=>$('camera').close();
$('camera').addEventListener('close',()=>{stopCamera();document.body.classList.remove('camera-open');});
$('capture').onclick=()=>{
  const v=$('video');if(!v.videoWidth||v.readyState<2){$('cameraStatus').textContent='画面尚未就绪，请稍候。';return;}
  const c=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(v.videoWidth,v.videoHeight));
  c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
  // Capture the complete original frame, never the overlay, mirror or target-box crop.
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  c.toBlob(blob=>{if(!blob){status('拍摄失败，请重试。',true);return;}void useFile(new File([blob],'camera.jpg',{type:'image/jpeg'}));$('camera').close();},'image/jpeg',0.92);
};
window.addEventListener('beforeunload',stopCamera);
// Mobile users can open the camera before remote scene images finish loading.
// Keep scene actions disabled until every background is available to the canvas.
render();
setBusy(true);
try{
  await Promise.all(editions.map(async item => { backgrounds[item.id] = await loadImage(item.image); }));
  render();await refreshConfig();setBusy(false);sessionStorage.removeItem('scene-job');
  const old=sessionStorage.getItem('scene-ark-job');
  if(old){
    const saved=JSON.parse(old);activeJob=saved.id;setBusy(true);status('正在恢复上次方舟任务…');
    try{
      const deadline=Date.now()+6*60*1000;
      while(true){
        const job=await api('/api/jobs/'+saved.id);
        if(job.status==='succeeded'){
          if(saved.stage==='cutout'){cutout=await loadImage(job.image);status('已恢复透明人物。请重新上传原照片后开始完整流程。');break;}
          scene=scenes.find(item=>item.id===saved.scene)||scene;
          backgrounds[scene.id] ||= await loadImage(scene.image);
          composite=null;fused=await finishImage(await loadImage(job.image),saved.photoOnly===true);render();status('已恢复上次结果，可以下载。');break;
        }
        if(['failed','canceled'].includes(job.status))throw new Error(job.error||'上次本地等待已停止，请在方舟控制台检查计费记录。');
        if(Date.now()>deadline)throw new Error('等待超时，请在方舟控制台检查调用记录。');
        await delay(1500);
      }
    }catch(e){status(e.message,true);}finally{activeJob=null;sessionStorage.removeItem('scene-ark-job');setBusy(false);}
  }
}catch(e){if(editions.every(item=>backgrounds[item.id]))setBusy(false);status(e.message,true);}
