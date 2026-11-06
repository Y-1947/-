import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4317;
const url = `http://127.0.0.1:${port}`;
const foreground = process.argv.includes('--foreground');
async function ready() {
  try {
    const response = await fetch(`${url}/api/config`, {signal:AbortSignal.timeout(800)});
    const config = await response.json();
    return response.ok && typeof config.hasKey === 'boolean' && config.provider === 'ark';
  } catch { return false; }
}
try {
  if (!await ready()) {
    mkdirSync(path.join(directory,'.runtime'),{recursive:true});
    const log = foreground ? undefined : openSync(path.join(directory,'.runtime','server.log'),'a');
    const child = spawn(process.execPath,['--env-file-if-exists=.env','server.mjs'],{
      cwd:directory, detached:!foreground, windowsHide:!foreground,
      stdio:foreground ? 'inherit' : ['ignore',log,log]
    });
    const startupError = new Promise((_,reject)=>child.once('error',reject));
    if(log !== undefined) closeSync(log);
    if(!foreground) child.unref();
    else console.log('Keep this window open while using the website.');
    await Promise.race([startupError,(async()=>{
      for(let count=0;count<40;count++) {
        if(await ready()) return;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw new Error('Server did not start. Check .runtime/server.log for details.');
    })()]);
  }
  console.log(`Scene Studio is ready: ${url}`);
  if(!process.argv.includes('--no-open')) {
    const browser = spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
    browser.on('error',()=>console.log(`Open ${url} in your browser.`));
    browser.unref();
  }
} catch(error) { console.error(error.message); process.exitCode=1; }
