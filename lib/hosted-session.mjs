import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

function key(secret){
  if(!secret||secret.length<32)throw new Error('线上会话服务未配置，请联系站点管理员。');
  return createHash('sha256').update(secret).digest();
}
export function seal(value,secret){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function unseal(value,secret){
  try{
    const data=Buffer.from(value,'base64url');
    const decipher=createDecipheriv('aes-256-gcm',key(secret),data.subarray(0,12));
    decipher.setAuthTag(data.subarray(12,28));
    const result=JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString());
    if(result.expiresAt<=Date.now())return null;
    return result;
  }catch{return null;}
}
export function dispatchToken(id,secret){return createHmac('sha256',key(secret)).update(id).digest('base64url');}
export function validDispatch(id,token,secret){
  const expected=Buffer.from(dispatchToken(id,secret)),actual=Buffer.from(token||'');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export const COOKIE='scene_session';
export function readSession(request,secret){
  const cookie=request.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='));
  return cookie?unseal(cookie.slice(COOKIE.length+1),secret):null;
}
export function sessionCookie(session,secret){return `${COOKIE}=${seal(session,secret)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`;}
