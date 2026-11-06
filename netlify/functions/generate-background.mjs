import {getStore} from '@netlify/blobs';
import {createHostedWorker} from '../../lib/hosted.mjs';
import {hostedSecret} from '../../lib/hosted-runtime.mjs';

export default async request=>createHostedWorker({
  getStore:()=>getStore({name:'scene-studio-'+(Netlify.env.get('CONTEXT')||'production'),consistency:'strong'}),
  secret:await hostedSecret(getStore({name:'scene-studio-private-'+(Netlify.env.get('CONTEXT')||'production'),consistency:'strong'}))
})(request);
export const config={background:true};
