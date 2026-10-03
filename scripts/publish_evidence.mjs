// Local publication only. Does not upload data or contact any provider.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {auditDataset} from '../api/src/evidence.js';

export function publishEvidence(inputPath,outputDir,now=Date.now()) {
  const bytes=readFileSync(inputPath),input=JSON.parse(bytes),data=auditDataset(input,now);
  if(input.schema_version!==4||data.audit.error||data.audit.rejected||data.audit.observations_rejected)throw Error('Publication refused: resolve rejected records or invalid schema first.');
  if(!/^[a-zA-Z0-9._-]{1,80}$/.test(input.version))throw Error('Use a simple version identifier.');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const directory=join(resolve(outputDir),input.version+'-'+sha256.slice(0,12)),dataset=join(directory,'records.json');
  mkdirSync(directory,{recursive:true});
  if(existsSync(dataset)){if(!readFileSync(dataset).equals(bytes))throw Error('Snapshot collision; existing snapshot was preserved.');}
  else writeFileSync(dataset,bytes,{flag:'wx',mode:0o600});
  const manifest={dataset_id:input.dataset_id,version:input.version,sha256,source_updated_at:input.updated_at,published_at:new Date(now).toISOString(),
    audit:data.audit,sources:data.sources.length,coverage_areas:data.areas.length,current_observations:data.observations.filter(o=>Date.parse(o.expires_at)>now).length,
    independently_validated:false,accuracy:'UNMEASURED',notes:'A schema audit is not a measurement of source completeness or street attribution accuracy.'};
  const manifestPath=join(directory,'manifest.json');
  if(!existsSync(manifestPath))writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {dataset_path:dataset,manifest_path:manifestPath,...JSON.parse(readFileSync(manifestPath))};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  try{if(!process.argv[2]||!process.argv[3])throw Error('Usage: node scripts/publish_evidence.mjs INPUT.json OUTPUT_DIRECTORY');
    console.log(JSON.stringify(publishEvidence(process.argv[2],process.argv[3]),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
