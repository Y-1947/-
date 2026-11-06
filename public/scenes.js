// Add future templates here; camera, preview and API share the same registry.
export const scenes = [{
  id:'haichuang', legacy:true, name:'粤美海幢 · 古寺新潮', tag:'报刊封面 · 半身人像',
  w:1060, h:1484, image:'assets/haichuang.png',
  photoBox:{x:50/1060,y:462/1484,w:960/1060,h:612/1484},
  personBox:{x:155/1060,y:550/1484,w:535/1060,h:524/1484},
  reference:'assets/haichuang-pixar-reference.png',
}];

const editions = [
  ['red','明星快报 · 红版',[101,592,1256,1239], '暖阳下的骑楼街', '保留骑楼柱廊、沿街立面与道路消失点，匹配街道暖色日光。'],
  ['green','明星报 · 绿版',[101,579,1256,1225], '海幢寺山门', '保留海幢寺的绿瓦屋檐、红柱、灯笼和石狮，匹配树荫下柔和的自然光。'],
  ['blue','I ♥ HAICHUANG · 蓝版',[95,444,1249,1340], '潘氏大院', '保留黄色洋楼的拱廊、主入口与蓝天，匹配晴天光线和暖色墙面反光。'],
];
for(const [id,name,[l,t,r,b],setting,lighting] of editions){
  const w=2552,h=3580;
  const photoBox={x:l/1344,y:t/1885,w:(r-l)/1344,h:(b-t)/1885};
  const personBox={x:photoBox.x+photoBox.w*.19,y:photoBox.y+photoBox.h*.12,w:photoBox.w*.48,h:photoBox.h*.88};
  // The green edition's printed camera overlaps the lower left of its photograph.
  const photoClip=id==='green'?[[101,579],[1256,579],[1256,1225],[264,1225],[246,1081],[239,1071],[207,1071],[205,1079],[101,1091]].map(([x,y])=>[(x-l)/(r-l),(y-t)/(b-t)]):null;
  scenes.push({id,name,w,h,photoBox,personBox,photoClip,setting,lighting,image:'assets/edition-'+id+'.jpg',thumbnail:'assets/edition-'+id+'-thumb.jpg',reference:'assets/haichuang-pixar-reference.png'});
}
