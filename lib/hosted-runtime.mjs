import {randomBytes} from 'node:crypto';
// Site-wide private Blobs are accessible only to authenticated server runtimes.
// Atomic creation keeps all concurrent workers on the same session key.
export async function hostedSecret(store){
  const existing=await store.get('session-encryption',{type:'json'});
  if(existing?.secret)return existing.secret;
  await store.setJSON('session-encryption',{secret:randomBytes(32).toString('base64url')},{onlyIfNew:true});
  const saved=await store.get('session-encryption',{type:'json'});
  if(!saved?.secret)throw new Error('线上会话服务暂不可用，请稍后重试。');
  return saved.secret;
}
