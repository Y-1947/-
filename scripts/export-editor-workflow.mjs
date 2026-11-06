import {readFile,writeFile} from 'node:fs/promises';
const graph=JSON.parse(await readFile(new URL('../workflows/fusion-api.json',import.meta.url),'utf8'));
const outputs={CheckpointLoaderSimple:['MODEL','CLIP','VAE'],LoadImage:['IMAGE','MASK'],ImageToMask:['MASK'],VAEEncode:['LATENT'],SetLatentNoiseMask:['LATENT'],CLIPTextEncode:['CONDITIONING'],KSampler:['LATENT'],VAEDecode:['IMAGE'],GetImageSize:['INT','INT','INT'],ImageScale:['IMAGE'],SaveImage:[]};
const positions={1:[30,30],2:[30,380],3:[30,770],4:[380,790],5:[380,390],6:[650,500],7:[380,30],8:[730,30],9:[1000,370],10:[1320,400],11:[380,1060],12:[1620,440],13:[1950,440]};
const widgetValues={1:[graph['1'].inputs.ckpt_name],2:['composite.png','image'],3:['mask.png','image'],4:['red'],5:[],6:[],7:[graph['7'].inputs.text],8:[graph['8'].inputs.text],9:[1234567,'fixed',24,5,'dpmpp_2m','karras',0.18],10:[],11:[],12:['lanczos',736,736,'disabled'],13:['scene_fusion']};
const nodes=Object.entries(graph).map(([id,node],index)=>({id:Number(id),type:node.class_type,pos:positions[id],size:[300,node.class_type==='CLIPTextEncode'?230:node.class_type==='LoadImage'?300:220],flags:{},order:index,mode:0,inputs:[],outputs:outputs[node.class_type].map((type,slot_index)=>({name:type,type,links:null,slot_index})),properties:{'Node name for S&R':node.class_type},widgets_values:widgetValues[id],...(node._meta?.title?{title:node._meta.title}:{})}));
let linkId=0;const links=[];const byId=new Map(nodes.map(n=>[String(n.id),n]));
for(const [id,entry] of Object.entries(graph))for(const [name,value] of Object.entries(entry.inputs))if(Array.isArray(value)){
  const from=byId.get(value[0]),to=byId.get(id),output=from.outputs[value[1]];
  if(!output)throw new Error('Missing output slot');
  const slot=to.inputs.length;to.inputs.push({name,type:output.type,link:++linkId,...(entry.class_type==='ImageScale'&&['width','height'].includes(name)?{widget:{name}}:{})});
  (output.links??=[]).push(linkId);links.push([linkId,from.id,value[1],to.id,slot,output.type]);
}
const editor={last_node_id:13,last_link_id:linkId,nodes,links,groups:[],config:{},extra:{ds:{scale:0.55,offset:[50,50]}},version:0.4};
await writeFile(new URL('../workflows/fusion-editor.json',import.meta.url),JSON.stringify(editor,null,2));
console.log(`Exported editable workflow: ${nodes.length} nodes, ${links.length} links. Cloud import not browser-tested.`);
