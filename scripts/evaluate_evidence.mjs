import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {auditDataset} from '../api/src/evidence.js';

export function evaluateEvidence(dataset,reference,now=Date.now()) {
  const audited=auditDataset(dataset,now);
  if(audited.audit.error)throw Error(audited.audit.error);
  if(!Array.isArray(reference.records))throw Error('Reference records must be an array.');
  if(reference.records.length&&(!reference.independent_review||!reference.method_url?.startsWith('https://')||!reference.reviewers?.length))throw Error('A nonempty reference set requires documented independent review.');
  const ids=new Set(),predictions=new Map(audited.incidents.map(r=>[r.id,r.location.street_id]));
  let resolved=0,wrong=0,correct=0,missed=0,unresolved=0,falseAttribution=0;
  for(const r of reference.records) {
    if(!r.event_id||ids.has(r.event_id)||typeof r.resolved!=='boolean'||r.resolved&&(!Array.isArray(r.allowed_street_ids)||!r.allowed_street_ids.length))throw Error('Invalid or repeated reference event.');
    ids.add(r.event_id);const prediction=predictions.get(r.event_id);
    if(r.resolved){resolved++;if(!prediction)missed++;else if(r.allowed_street_ids.includes(prediction))correct++;else wrong++;}
    else{unresolved++;if(prediction)falseAttribution++;}
  }
  const assigned=correct+wrong;
  return {dataset_version:dataset.version,evaluated_at:new Date(now).toISOString(),status:reference.records.length?'REFERENCE_COMPARISON':'UNMEASURED',
    reference_events:ids.size,resolved_reference_events:resolved,unresolved_reference_events:unresolved,correct_street:correct,wrong_street:wrong,missed_resolved:missed,false_attribution_of_unresolved:falseAttribution,
    wrong_street_rate:assigned?wrong/assigned:null,resolved_recall:resolved?correct/resolved:null,
    untested_admitted_events:[...predictions.keys()].filter(id=>!ids.has(id)).length,
    limitations:'Measures agreement on the supplied independently reviewed sample only. Does not measure unreported crime, population risk or reporting completeness. Metadata does not authenticate reviewers.'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  try{const [data,truth,output]=process.argv.slice(2);if(!data||!truth)throw Error('Usage: node scripts/evaluate_evidence.mjs DATASET.json REFERENCE.json [REPORT.json]');
    const report=evaluateEvidence(JSON.parse(readFileSync(data)),JSON.parse(readFileSync(truth)));
    if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
