import {scenes} from './scenes.js';
export const placementBox=scenes[0].personBox;

export function alphaBounds(data,width,height,threshold=16){
  let left=width,top=height,right=-1,bottom=-1,transparent=false;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const alpha=data[(y*width+x)*4+3];
    if(alpha<250)transparent=true;
    if(alpha>threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  if(!transparent||right<left)throw new Error('未获得有效透明人物，已停止融合，避免把人物背景一起贴入。');
  return {x:left,y:top,w:right-left+1,h:bottom-top+1};
}

export function fitPerson(bounds,width,height,box=placementBox){
  if(![bounds.w,bounds.h,width,height].every(v=>Number.isFinite(v)&&v>0))throw new Error('人物尺寸无效。');
  const target={x:box.x*width,y:box.y*height,w:box.w*width,h:box.h*height};
  // Leave breathing room around hair, hands and feet; contain instead of cover.
  const inset=Math.min(target.w,target.h)*0.045;
  const scale=Math.min((target.w-2*inset)/bounds.w,(target.h-2*inset)/bounds.h);
  const w=bounds.w*scale,h=bounds.h*scale;
  return {x:target.x+(target.w-w)/2,y:target.y+target.h-h,w,h};
}
