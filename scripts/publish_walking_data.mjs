import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadWalkingData} from '../api/src/walking_environment.js';

export function publishWalking(inputPath,outputDir,now=Date.now()){
 const bytes=readFileSync(inputPath),raw=JSON.parse(bytes),data=loadWalkingData(raw,now);
 if(!data.version||data.audit.rejected||data.audit.roads===0||!/^[-a-zA-Z0-9._]{1,80}$/.test(data.version))throw Error('Publication refused: invalid map metadata or rejected records.');
 const sha256=createHash('sha256').update(bytes).digest('hex'),dir=join(resolve(outputDir),data.version+'-'+sha256.slice(0,12)),path=join(dir,'records.json');
 if(existsSync(path))throw Error('Snapshot already published; choose a new dataset version.');
 mkdirSync(dir,{recursive:true});writeFileSync(path,bytes,{flag:'wx',mode:0o600});
 const manifest={version:data.version,sha256,published_at:new Date(now).toISOString(),collected_at:data.collected_at,audit:data.audit,dataset_path:path,license:raw.license,license_url:raw.license_url,independently_validated:false,limitation:data.limitations};
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){try{console.log(JSON.stringify(publishWalking(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
