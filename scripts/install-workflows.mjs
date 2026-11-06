import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4317';
const presets = JSON.parse(await readFile(new URL('../public/workflow-presets.json',import.meta.url),'utf8'));
const current = await (await fetch(base+'/api/config')).json();
// Keep an existing cutout workflow; install the fusion explicitly requested by the user.
const data = {fusion:presets.fusion,...(!current.cutout?{cutout:presets.cutout}:{})};
const response = await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const result = await response.json();
if(!response.ok)throw new Error(result.error);
console.log(JSON.stringify(await (await fetch(base+'/api/config')).json()));
