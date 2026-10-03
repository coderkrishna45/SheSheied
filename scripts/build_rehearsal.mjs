import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {assessRoute,labelRoutes,auditDataset} from '../api/src/evidence.js';
const s=JSON.parse(readFileSync(new URL('../demo/kolkata_scenario.json',import.meta.url)));
const routes=labelRoutes(s.routes.map(r=>assessRoute(r,auditDataset(),Date.parse(s.evaluated_at),s.incidents)));
const plan={id:'kolkata-rehearsal-v2',mode:'REHEARSAL',origin:s.origin,destination:s.destination,routes,attribution:s.attribution,geometry_source:s.geometry_source,expires_at_ms:0};
const dir=new URL('../android/app/src/main/assets/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('rehearsal_plan.json',dir),JSON.stringify(plan));
console.log('Bundled rehearsal uses the production scoring engine.');
