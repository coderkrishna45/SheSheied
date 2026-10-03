import {readFileSync} from 'node:fs';
import {auditDataset} from '../api/src/evidence.js';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/audit_incidents.mjs /path/to/dataset.json');
const data=auditDataset(JSON.parse(readFileSync(file,'utf8')));
console.log(JSON.stringify({...data.audit,valid_sources:data.sources.length,recent_coverage_areas:data.areas.length},null,2));
if(data.audit.error||data.audit.rejected)process.exitCode=1;
