import {getStore} from '@netlify/blobs';
import {cleanHostedJobs} from '../../lib/hosted.mjs';
export default async()=>{
  await cleanHostedJobs(getStore({name:'scene-studio-'+(Netlify.env.get('CONTEXT')||'production'),consistency:'strong'}));
};
export const config={schedule:'15 * * * *'};
