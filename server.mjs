import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, buildRequest, generateImage } from './lib/ark.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const configFile = path.join(root,'..','.runtime','ark.json');
const hostedOrigin = process.env.RENDER_EXTERNAL_URL || process.env.SCENE_PUBLIC_ORIGIN;
const hosted = Boolean(hostedOrigin);
let key = process.env.ARK_API_KEY || '';
let model = process.env.ARK_IMAGE_MODEL || DEFAULT_MODEL;
const persist = !hosted && process.env.SCENE_PERSIST_CONFIG !== '0';
if(persist && !process.env.ARK_IMAGE_MODEL){
  try { const saved=JSON.parse(await readFile(configFile,'utf8'));if(validModel(saved.model))model=saved.model; }
  catch(e){if(e.code!=='ENOENT')console.warn('方舟模型配置无法加载，请在网页重新保存。');}
}
function validModel(value){return typeof value==='string' && /^[a-zA-Z0-9_.-]{1,160}$/.test(value);}
const jobs=new Map();
const terminal = job=>['succeeded','failed','canceled'].includes(job.status);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)throw new Error('单次上传不能超过 32 MB。');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString());}
function clean(error,secret=key){return String(error.message || error).replaceAll(secret || '\u0000','[redacted]');}
function prune(){for(const [id,job] of jobs)if(terminal(job)&&Date.now()-job.finished>30*60*1000)jobs.delete(id);}
async function execute(job,payload,secret){
  const timeout=setTimeout(()=>{job.timedOut=true;job.controller.abort();},5*60*1000);
  try{
    job.status='running';
    const result=await generateImage(payload,secret,job.controller.signal);
    if(job.status!=='canceled'){job.result=result;job.status='succeeded';}
  }catch(e){if(job.status!=='canceled'){job.status='failed';job.error=job.timedOut?'等待超过 5 分钟，方舟可能仍在处理，请先检查控制台记录，避免重复付费。':clean(e,secret);}}
  finally{clearTimeout(timeout);job.finished=Date.now();}
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const allowedOrigins=hosted?[hostedOrigin]:['http://localhost:'+server.address().port,'http://127.0.0.1:'+server.address().port];
    if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))return json(res,403,{error:'不允许跨站请求。'});
    if(url.pathname.startsWith('/api/')){
      const session=hosted?req.headers.cookie?.match(/(?:^|;\s*)__Host-scene=([a-f0-9-]{36})(?:;|$)/)?.[1]:undefined;
      const ownedJob=id=>{
        const job=jobs.get(id);
        return job?.session===session?job:undefined;
      };
      prune();
      if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{provider:'ark',hasKey:!!key,model,...(hosted?{managed:true}:{})});
      if(req.method==='POST'&&url.pathname==='/api/config'){
        if(hosted)return json(res,403,{error:'方舟配置由站点管理员管理。'});
        const input=await body(req);
        const next=typeof input.model==='string'?input.model.trim():model;
        if(!validModel(next))throw new Error('请填写控制台提供的图片模型 ID 或接入点 ID。');
        if(input.key!==undefined&&(typeof input.key!=='string'||/[\r\n]/.test(input.key)||input.key.length>4096))throw new Error('API Key 格式不正确。');
        if([...jobs.values()].some(job=>!terminal(job)))throw new Error('请等待当前生成结束后再修改配置。');
        if(persist){await mkdir(path.dirname(configFile),{recursive:true});await writeFile(configFile+'.tmp',JSON.stringify({model:next},null,2));await rename(configFile+'.tmp',configFile);}
        model=next;if(input.key?.trim())key=input.key.trim();
        return json(res,200,{ok:true});
      }
      if(req.method==='POST'&&url.pathname==='/api/test'){
        if(!key)throw new Error('请先配置火山方舟 API Key。');
        return json(res,200,{ok:true,message:'本地配置已完整；密钥、模型权限和额度需首次生成验证。此检查不调用收费接口。'});
      }
      if(req.method==='POST'&&url.pathname==='/api/generate'){
        if(!key)throw new Error('请先配置火山方舟 API Key 和图片模型。');
        const input=await body(req);
        const payload=buildRequest({...input,model});
        if([...jobs.values()].some(job=>!terminal(job)))throw new Error('已有生成任务正在运行，请等待完成。');
        // Keep result images only in memory, bounded to five completed generations.
        const completed=[...jobs.entries()].filter(([,job])=>terminal(job));
        while(completed.length>=5)jobs.delete(completed.shift()[0]);
        const jobSession=hosted?(session||randomUUID()):undefined;
        if(hosted&&!session)res.setHeader('Set-Cookie',`__Host-scene=${jobSession}; Path=/; Secure; HttpOnly; SameSite=Strict`);
        const id=randomUUID();const job={id,session:jobSession,stage:input.stage||'fusion',status:'queued',controller:new AbortController()};jobs.set(id,job);
        json(res,202,{id,status:job.status});void execute(job,payload,key);return;
      }
      const match=/^\/api\/jobs\/([a-zA-Z0-9-]+)(\/cancel)?$/.exec(url.pathname);
      const job=match&&ownedJob(match[1]);
      if(job){
        if(req.method==='POST'&&match[2]){
          if(!terminal(job)){job.status='canceled';job.finished=Date.now();job.controller.abort();}
          return json(res,200,{ok:true,message:'已停止本地等待；方舟服务端可能继续执行并计费。'});
        }
        if(req.method==='GET'&&!match[2])return json(res,200,{id:job.id,status:job.status,error:job.error,image:job.result?'/api/assets/'+job.id:undefined});
      }
      const asset=/^\/api\/assets\/([a-zA-Z0-9-]+)$/.exec(url.pathname);
      const result=asset&&ownedJob(asset[1])?.result;
      if(req.method==='GET'&&result){res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'no-store'});res.end(result.bytes);return;}
      return json(res,404,{error:'任务或图片已过期，或后端已重启。请在方舟控制台检查调用记录。'});
    }
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
    const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!filename.startsWith(root+path.sep))return json(res,403,{error:'Forbidden'});
    const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png'};
    const bytes=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
  }catch(e){json(res,e.code==='ENOENT'?404:400,{error:clean(e)});}
});
server.listen(Number(process.env.PORT)||4317,hosted?'0.0.0.0':'127.0.0.1',()=>console.log(`Scene Studio (Ark): http://localhost:${server.address().port}`));
