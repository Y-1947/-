import {getStore} from '@netlify/blobs';
import {createHostedApi} from '../../lib/hosted.mjs';
import {hostedSecret} from '../../lib/hosted-runtime.mjs';

export default async request=>createHostedApi({
  sharedKey:Netlify.env.get('ARK_API_KEY'),
  sharedModel:Netlify.env.get('ARK_IMAGE_MODEL')||undefined,
  getStore:()=>getStore({name:'scene-studio-'+(Netlify.env.get('CONTEXT')||'production'),consistency:'strong'}),
  secret:await hostedSecret(getStore({name:'scene-studio-private-'+(Netlify.env.get('CONTEXT')||'production'),consistency:'strong'}))
})(request);
export const config={path:'/api/*'};
