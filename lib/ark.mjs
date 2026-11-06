export const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
export const DEFAULT_MODEL = 'doubao-seedream-5-0-pro-260628';
import {scenes as templates} from '../public/scenes.js';
export const scenes=Object.fromEntries(templates.map(scene=>[scene.id,scene]));

export function validateImage(data) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data || '');
  if (!match) throw new Error('图片格式应为 PNG、JPEG 或 WebP。');
  if (Buffer.from(match[2],'base64').length > 10*1024*1024) throw new Error('处理后单张图片不能超过 10 MB，请缩小照片。');
  return data;
}

export function buildRequest({model,stage='fusion',subject,composite,background,scene,quality='fast'}) {
  if(!['fast','detail'].includes(quality))throw new Error('请选择快速或精细出图模式。');
  const fast=quality==='fast';
  if(stage==='cutout')return {
    model,image:validateImage(subject),layer_decomposition:true,size:fast?'1K':'2K',
    output_format:'png',response_format:'b64_json',watermark:false,
    prompt:'只分离照片中主要人物，输出一个完整人物透明图层。头发、脸部、身体、双手、双脚、服装和随身配饰全部合并在同一个人物图层，不要拆分身体或衣物。保留原人物姿态、五官和全部可见部分，不裁掉任何可见肢体，不重绘人物。其余环境归入底图。'
  };
  if(stage!=='fusion')throw new Error('生成阶段不存在。');
  const template=Object.hasOwn(scenes,scene)?scenes[scene]:null;
  if (!template) throw new Error('场景不存在。');
  const {w,h}=template.photoBox;
  const ratio=(w*template.w)/(h*template.h);
  const height=fast?856:1440;
  const width=Math.round(height*ratio/8)*8;
  const direct=fast&&composite===undefined;
  const prompt=(direct?[
    `将图2的主要人物融入图1的${template.setting||'海幢寺'}背景，呈现真实的现场摄影。输出与图1同比例的单张照片。`,
    '仅提取图2的人物，保留五官、肤色、表情、发型与衣物细节。人物在画面中间偏左，保持头部完整，大小和视角符合场景透视。',
    `按图1的主光方向、色温和景深自然融合人物，使用柔和光线与自然阴影，保持发丝和衣物边缘真实。保留背景的建筑、招牌、文字和图形，不新增物件、水印或边框。${template.lighting||''}`
  ]:[
    `将图1调整为一张在${template.setting||'海幢寺'}现场拍摄的真实人像照片。输出与图1同构图、同比例的单张照片。`,
    '图1是已初步定位的人景合成图，以它为编辑底图。图2仅供核对人物身份、脸型、五官、肤色、发型、表情和衣物纹理。图3是原始背景，用于恢复场景和判断现场光照。',
    '仅调整人物与景物的融合关系。优先保持图1人物的姿势、尺度、位置与裁切，保留真实皮肤、头发和织物细节，不重塑五官，不磨皮，不做卡通化或插画化。',
    `按照图3判断主光方向、色温和明暗层次。用柔和的现场光与自然环境反光协调脸部和衣物，保留细腻的阴影过渡；在确实接触的地方补充轻微接触阴影，处理发丝和肩缘的白边、硬边与不自然光晕。${template.lighting||''}`,
    '保持原背景的机位、透视、景深、建筑和可见物件。只处理融合所需的局部遮挡和光影，保留画面中已有的招牌、文字和图形，不新增文字、物件、边框或其他人物。'
  ]).join('\n');
  return {
    model,
    image:direct?[validateImage(background),validateImage(subject)]:[validateImage(composite),validateImage(subject),validateImage(background)],
    prompt,
    size:`${width}x${height}`,
    ...(model.includes('seedream-5-0-pro')?{optimize_prompt_options:{mode:fast?'fast':'standard'}}:{}),
    response_format:'b64_json',watermark:false
  };
}

export async function generateImage(payload,key,signal,fetchImpl=fetch) {
  const response=await fetchImpl(ARK_BASE+'/images/generations',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
    body:JSON.stringify(payload),signal
  });
  const result=await response.json();
  if(!response.ok || result.error) throw new Error(`火山方舟 ${response.status}：${String(result.error?.message || '请求失败，请检查模型权限与额度。').slice(0,1000).replaceAll(key,'[redacted]')}`);
  const item=selectImage(result.data,payload.layer_decomposition);
  if(item?.error) throw new Error(String(item.error.message || '图片生成失败。'));
  if(!item?.b64_json || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) throw new Error('方舟未返回有效图片，请确认模型支持 b64_json 图片输出。');
  const bytes=Buffer.from(item.b64_json,'base64');
  const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':null;
  if(!type || bytes.length>32*1024*1024) throw new Error('方舟返回的图片格式或大小不受支持。');
  return {bytes,type};
}

export function selectImage(data,cutout=false){
  if(!Array.isArray(data))throw new Error('方舟没有返回图片。');
  if(!cutout)return data[0];
  const layers=data.filter(item=>Number.isInteger(item.z_index)&&item.z_index>0);
  // Never silently pick a face/clothing layer and discard the rest of the body.
  if(layers.length!==1)throw new Error(`抠图返回了 ${layers.length} 个人物候选图层，无法确认完整人物，已停止后续融合。请使用单人照片重试。`);
  return layers[0];
}
