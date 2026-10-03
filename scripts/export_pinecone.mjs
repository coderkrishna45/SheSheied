import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {normalizeIncidents,validPoint} from '../api/src/risk.js';
const e=process.env;
for(const key of ['PINECONE_API_KEY','PINECONE_INDEX_HOST','INCIDENT_SOURCE','INCIDENT_COVERAGE_BOUNDS'])if(!e[key])throw Error(`Configure ${key} in api/.env before export.`);
// Export is a staging operation. Metadata must pass the v3 steward review before live import.
const bounds=e.INCIDENT_COVERAGE_BOUNDS.split(',').map(Number);
if(bounds.length!==4||!validPoint(bounds.slice(0,2))||!validPoint(bounds.slice(2))||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw Error('Coverage bounds must be west,south,east,north.');
const host=e.PINECONE_INDEX_HOST.startsWith('https://')?e.PINECONE_INDEX_HOST:'https://'+e.PINECONE_INDEX_HOST;
if(!new URL(host).hostname.endsWith('.pinecone.io'))throw Error('Use the index host shown in Pinecone Console.');
async function request(path,params){const url=new URL(path,host);for(const [k,v] of params)url.searchParams.append(k,v);const r=await fetch(url,{headers:{'Api-Key':e.PINECONE_API_KEY,'X-Pinecone-Api-Version':'2025-04'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Pinecone returned HTTP ${r.status}; check index host, namespace and permissions.`);return r.json();}
const namespace=e.PINECONE_NAMESPACE||'',ids=[];let token;
do{const params=[['namespace',namespace],['limit','100']];if(token)params.push(['paginationToken',token]);const result=await request('/vectors/list',params);ids.push(...(result.vectors||[]).map(v=>v.id));token=result.pagination?.next;if(ids.length>20000)throw Error('Export exceeds 20,000 records. Narrow the namespace before retrying.');}while(token);
const incidents=[];let rejected=0;
for(let offset=0;offset<ids.length;offset+=100){const result=await request('/vectors/fetch',[['namespace',namespace],...ids.slice(offset,offset+100).map(id=>['ids',id])]);for(const [id,record] of Object.entries(result.vectors||{})){
 const m=record.metadata||{};const incident={id,lat:m.lat??m.latitude,lng:m.lng??m.longitude,category:m.category,incident_date:m.incident_date??m.date,source:m.source||e.INCIDENT_SOURCE,source_id:m.source_id,source_record_id:m.source_record_id,event_id:m.event_id,source_url:m.source_url,precision_meters:m.precision_meters,location_method:m.location_method,setting:m.setting,verification:'pending',retrieved_at:new Date().toISOString()};
 if(!incident.incident_date||m.is_demo_data===true||m.is_real_data===false||!normalizeIncidents([incident]).length){rejected++;continue;}
 incidents.push(incident);
}}
if(!incidents.length)throw Error('No valid, dated geospatial incidents found. Embedding similarity cannot substitute for coordinates and dates.');
const output=e.INCIDENT_STAGING_PATH||'./data/incidents-staging.json';if(e.INCIDENT_DATA_PATH&&resolve(output)===resolve(e.INCIDENT_DATA_PATH))throw Error('Staging export must not overwrite the live reviewed dataset.');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({schema_version:3,is_real_data:false,sources:[],coverage:{areas:[]},staging_metadata:{bounds,source:e.INCIDENT_SOURCE,license:e.INCIDENT_LICENSE||'Not supplied',exported_at:new Date().toISOString()},incidents},null,2)+'\n');
console.log(`Staged ${incidents.length} unreviewed candidate records; rejected ${rejected}. File: ${output}`);
