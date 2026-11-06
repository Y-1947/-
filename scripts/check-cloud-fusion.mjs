// Technical smoke test with a supplied BACKGROUND and a synthetic rectangular mask.
// No portrait is fabricated. This tests API execution, not identity preservation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const base='http://127.0.0.1:4317';
const root=new URL('../',import.meta.url);
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
function maskPNG(w,h){const raw=Buffer.alloc((1+w*3)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const white=x>=268&&x<466&&y>=302&&y<688;const i=y*(1+w*3)+1+x*3;raw[i]=raw[i+1]=raw[i+2]=white?255:0;}const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
async function request(route,data){const r=await fetch(base+route,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
const recordFile=new URL('.runtime/fusion-smoke-test.json',root);
await mkdir(new URL('.runtime/',root),{recursive:true});
let record;
try{record=JSON.parse(await readFile(recordFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(record?.status==='succeeded'){console.log(JSON.stringify(record));process.exit(0);}
if(!record){
  const composite='data:image/jpeg;base64,'+(await readFile(new URL('public/assets/cafe.jpg',root))).toString('base64');
  const mask='data:image/png;base64,'+maskPNG(736,736).toString('base64');
  const job=await request('/api/generate',{stage:'fusion',composite,mask,denoise:0.05});
  record={id:job.id,status:job.status,test:'background-and-mask-only',created:new Date().toISOString()};
  await writeFile(recordFile,JSON.stringify(record,null,2));console.log('Submitted technical test: '+job.id);
}
for(let count=0;count<180;count++){
  const job=await request('/api/jobs/'+record.id);
  const changed=record.status!==job.status;record={...record,...job};
  await writeFile(recordFile,JSON.stringify(record,null,2));
  if(changed)console.log('Cloud status: '+job.status);
  if(job.status==='succeeded'){
    const response=await fetch(base+job.image);if(!response.ok)throw new Error('Output download failed');const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.subarray(1,4).toString()!=='PNG')throw new Error('Expected PNG output');
    record.width=bytes.readUInt32BE(16);record.height=bytes.readUInt32BE(20);record.bytes=bytes.length;
    if(record.width!==736||record.height!==736)throw new Error('Output size mismatch');
    await writeFile(recordFile,JSON.stringify(record,null,2));console.log(JSON.stringify(record));process.exit(0);
  }
  if(['failed','canceled','expired'].includes(job.status))throw new Error('Cloud test '+job.status+': '+(job.error||'unknown'));
  await new Promise(resolve=>setTimeout(resolve,3000));
}
throw new Error('Still running; rerun this script to poll the saved job without submitting again.');
