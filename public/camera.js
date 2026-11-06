export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError:'摄像头权限未获允许。请在浏览器的网站权限及手机或电脑的隐私设置中允许相机，也可以使用下方系统相机入口。',
    SecurityError:'当前页面或浏览器限制了摄像头访问。请把本地网站地址复制到 Edge 或 Chrome 中打开。',
    NotFoundError:'没有找到可用摄像头。请检查摄像头连接、笔记本隐私开关或设备是否被禁用。',
    NotReadableError:'摄像头无法读取，可能被其他软件占用或被系统阻止。请关闭正在使用摄像头的软件后重试。',
    AbortError:'摄像头启动被中断，请检查设备后重试。',
    OverconstrainedError:'摄像头不支持请求的参数，请更换设备或使用照片上传。',
    UnsupportedError:'当前浏览器没有提供摄像头接口。请把本地网站地址复制到 Edge 或 Chrome 中打开。',
    InsecureContextError:'浏览器取景需要 HTTPS 或本机地址。手机通过局域网 HTTP 打开时，请使用系统相机；上线后使用 HTTPS。',
  };
  return messages[error?.name] || `摄像头启动失败：${error?.message || '未知错误'}`;
}
export function stopTracks(stream) { stream?.getTracks().forEach(track=>track.stop()); }
export function createCameraRequest(mediaDevices) {
  let generation = 0;
  return {
    cancel(){generation++;},
    async open(facingMode='environment'){
      const current=++generation;
      if(!mediaDevices?.getUserMedia)throw Object.assign(new Error('Unsupported'),{name:'UnsupportedError'});
      let stream;
      const video={facingMode:{ideal:facingMode}};
      // Do not select a manufactured aspect ratio or enable crop-and-scale.
      if(mediaDevices.getSupportedConstraints?.().resizeMode)video.resizeMode={exact:'none'};
      try{stream=await mediaDevices.getUserMedia({video,audio:false});}
      catch(error){
        if(current!==generation)return null;
        if(error.name!=='OverconstrainedError')throw error;
        stream=await mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode}},audio:false});
      }
      // A user may close the dialog while the native permission prompt is pending.
      if(current!==generation){stopTracks(stream);return null;}
      return stream;
    }
  };
}

export function fitCameraFrame(width,height,sceneWidth,sceneHeight){
  const scale=Math.min(width/sceneWidth,height/sceneHeight);
  return {width:Math.max(0,sceneWidth*scale),height:Math.max(0,sceneHeight*scale)};
}

export function fitCameraTarget(sceneWidth,sceneHeight,box,videoWidth,videoHeight){
  const fit=fitCameraFrame(sceneWidth*box.w,sceneHeight*box.h,videoWidth,videoHeight);
  return {x:box.x+(box.w-fit.width/sceneWidth)/2,y:box.y+box.h-fit.height/sceneHeight,w:fit.width/sceneWidth,h:fit.height/sceneHeight};
}
