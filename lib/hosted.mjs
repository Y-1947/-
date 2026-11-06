import {randomUUID} from 'node:crypto';
import {DEFAULT_MODEL,buildRequest,generateImage} from './ark.mjs';
import {readSession,sessionCookie,seal,unseal,dispatchToken,validDispatch} from './hosted-session.mjs';

export const RETENTION=60*60*1000;
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const jobKey=id=>'jobs/'+id;
const assetKey=id=>'images/'+id;
const canceledKey=id=>'canceled/'+id;
const inputKey=id=>'inputs/'+id;
const safeError=(error,key)=>String(error.message||error).replaceAll(key||'\u0000','[redacted]').slice(0,1200);

async function parseBody(request){
  if(Number(request.headers.get('content-length'))>5*1024*1024)throw new Error('线上单次传图限 5 MB，请缩小照片后重试。');
  const text=await request.text();
  if(Buffer.byteLength(text)>5*1024*1024)throw new Error('线上单次传图限 5 MB，请缩小照片后重试。');
  return JSON.parse(text);
}

export function createHostedApi({getStore,secret,sharedKey,sharedModel=DEFAULT_MODEL,fetchImpl=fetch}){
  return async request=>{
    let session,key;
    try{
      const url=new URL(request.url);
      if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'不允许跨站请求。'},403);
      session=readSession(request,secret)||{id:randomUUID(),model:DEFAULT_MODEL,expiresAt:Date.now()+86400000};
      key=session.key||sharedKey;
      const model=sharedKey&&!session.key?sharedModel:session.model;
      const reply=(data,status=200)=>json(data,status,{'Set-Cookie':sessionCookie(session,secret)});
      if(url.pathname==='/api/config'&&request.method==='GET')return reply({provider:'ark',hosted:true,hasKey:!!key,model,...(sharedKey?{shared:true}:{})});
      if(url.pathname==='/api/config'&&request.method==='POST'){
        const input=await parseBody(request),model=(input.model||session.model).trim();
        if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(model))throw new Error('图片模型 ID 格式不正确。');
        if(input.key!==undefined&&(typeof input.key!=='string'||/[\r\n]/.test(input.key)||input.key.length>1024))throw new Error('API Key 格式不正确。');
        session={...session,model,key:input.key?.trim()||session.key,expiresAt:Date.now()+86400000};
        return reply({ok:true});
      }
      if(url.pathname==='/api/test'&&request.method==='POST'){
        if(!key)throw new Error('请先在当前浏览器配置火山方舟 API Key。');
        return reply({ok:true,message:'当前浏览器配置已完整；模型权限与额度需首次生成验证。'});
      }
      const store=getStore();
      if(url.pathname==='/api/generate'&&request.method==='POST'){
        if(!key)throw new Error('请先在当前浏览器配置火山方舟 API Key。');
        const input=await parseBody(request),payload=buildRequest({...input,model});
        const id=randomUUID(),expiresAt=Date.now()+RETENTION;
        // Only encrypted credentials are temporarily stored with the task.
        await store.setJSON(inputKey(id),{payload,credentials:seal({key,expiresAt},secret),expiresAt});
        await store.setJSON(jobKey(id),{id,owner:session.id,status:'queued',stage:input.stage||'fusion',expiresAt});
        try{
          const dispatch=await fetchImpl(new URL('/.netlify/functions/generate-background',url),{
            method:'POST',headers:{'Content-Type':'application/json','X-Scene-Dispatch':dispatchToken(id,secret)},body:JSON.stringify({id})
          });
          if(dispatch.status!==202)throw new Error('后台任务未能启动，请稍后重试。');
        }catch(error){
          await store.delete(inputKey(id));
          await store.setJSON(jobKey(id),{id,owner:session.id,status:'failed',error:'后台任务启动失败；请检查控制台记录后再重试。',expiresAt});
          throw error;
        }
        return reply({id,status:'queued'},202);
      }
      const match=/^\/api\/(jobs|assets)\/([a-f0-9-]{36})(\/cancel)?$/.exec(url.pathname);
      if(match){
        const [,kind,id,cancel]=match,job=await store.get(jobKey(id),{type:'json'});
        if(!job||job.owner!==session.id)return json({error:'任务不存在或不属于当前浏览器。'},404);
        if(job.expiresAt<Date.now())return json({error:'结果已过期，请及时下载生成图片。'},410);
        const canceled=await store.get(canceledKey(id),{type:'json'});
        if(kind==='jobs'&&cancel&&request.method==='POST'){
          if(!['failed','succeeded'].includes(job.status))await store.setJSON(canceledKey(id),{expiresAt:job.expiresAt});
          return reply({ok:true,message:'已停止本地等待，云端可能继续执行并计费。'});
        }
        if(kind==='jobs'&&!cancel&&request.method==='GET'){
          // A worker crash must not turn into an automatic paid re-submission.
          const stalled=job.status==='running'&&job.startedAt&&Date.now()-job.startedAt>6*60*1000;
          return reply({id,status:canceled?'canceled':stalled?'failed':job.status,error:stalled?'云端等待超时，请检查方舟调用记录后再试。':job.error,image:!canceled&&job.status==='succeeded'?'/api/assets/'+id:undefined});
        }
        if(kind==='assets'&&!cancel&&request.method==='GET'&&job.status==='succeeded'&&!canceled){
          const bytes=await store.get(assetKey(id),{type:'stream'});
          if(!bytes)return json({error:'结果图片不存在。'},404);
          return new Response(bytes,{headers:{'Content-Type':job.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
        }
      }
      return json({error:'接口或任务不存在。'},404);
    }catch(error){return json({error:safeError(error,key)},400);}
  };
}

export function createHostedWorker({getStore,secret,generate=generateImage}){
  return async request=>{
    let id,job,store,key,ownClaim=false;
    try{
      ({id}=await request.json());
      if(!/^[a-f0-9-]{36}$/.test(id||'')||!validDispatch(id,request.headers.get('x-scene-dispatch'),secret))return new Response(null,{status:403});
      store=getStore();job=await store.get(jobKey(id),{type:'json'});
      if(!job||job.status!=='queued'||job.expiresAt<Date.now())return new Response(null,{status:200});
      // Atomic one-shot claim prevents platform retries from repeating a paid call.
      const claimed=await store.setJSON('claims/'+id,{expiresAt:job.expiresAt},{onlyIfNew:true});
      if(!claimed.modified)return new Response(null,{status:200});
      ownClaim=true;
      if(await store.get(canceledKey(id),{type:'json'}))return new Response(null,{status:200});
      const input=await store.get(inputKey(id),{type:'json'}),credentials=unseal(input?.credentials||'',secret);
      if(!credentials?.key)throw new Error('任务凭证已过期，请重新开始。');
      key=credentials.key;
      await store.setJSON(jobKey(id),{...job,status:'running',startedAt:Date.now()});
      const result=await generate(input.payload,key,AbortSignal.timeout(5*60*1000));
      if(!await store.get(canceledKey(id),{type:'json'})){
        if(result.bytes.length>18*1024*1024)throw new Error('结果图片过大，请改用快速模式。');
        await store.set(assetKey(id),new Uint8Array(result.bytes),{metadata:{expiresAt:job.expiresAt}});
        await store.setJSON(jobKey(id),{...job,status:'succeeded',type:result.type});
      }
    }catch(error){
      if(job&&store)await store.setJSON(jobKey(id),{...job,status:'failed',error:safeError(error,key)}).catch(()=>{});
      // Do not throw: background functions retry errors, but paid inference must not retry.
    }finally{
      if(store&&id&&ownClaim)await store.delete(inputKey(id)).catch(()=>{});
    }
    return new Response(null,{status:200});
  };
}

export async function cleanHostedJobs(store){
  const {blobs}=await store.list({prefix:'jobs/'});
  for(const blob of blobs){
    const job=await store.get(blob.key,{type:'json'});
    if(!job||job.expiresAt>=Date.now())continue;
    for(const name of [jobKey(job.id),inputKey(job.id),assetKey(job.id),canceledKey(job.id),'claims/'+job.id])await store.delete(name);
  }
}
