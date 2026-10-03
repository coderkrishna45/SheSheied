import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditDataset,assessRoute,labelRoutes} from '../src/evidence.js';
import {dateInterval,scopeIntersectsRoute} from '../src/street_evidence.js';
import {buildApp} from '../src/app.js';
import {publishEvidence} from '../../scripts/publish_evidence.mjs';
import {evaluateEvidence} from '../../scripts/evaluate_evidence.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const now=Date.parse('2026-10-02T17:30:00Z');
const reviewed_at='2026-10-02T16:00:00Z';
const reviews=[1,2].map(i=>({reviewer_id:`test-human-${i}`,reviewer_type:'human',reviewed_at,source_checked:true,location_confirmed:true,barriers_checked:true,decision:'accept',method:'Synthetic fixture only'}));
const source={id:'test',name:'Synthetic source',kind:'partner',url:'https://example.org',bounds:[88.39,22.55,88.46,22.65],reuse:{basis:'permission_granted',terms:'Test only',reference_url:'https://example.org/terms'}};
const street={id:'street',name:'Test Road',aliases:['পরীক্ষা রাস্তা'],geometry:{type:'LineString',coordinates:[[88.43,22.57],[88.43,22.59]]},reference_url:'https://example.org/street'};
const location={kind:'street_section',scope_ids:['scope'],label:'Test Road section',reason:'Synthetic validation only',street_id:'street',geometry:{type:'LineString',coordinates:[[88.43,22.574],[88.43,22.576]]},uncertainty_meters:10,reference_url:'https://example.org/map',route_relation:'same_public_street'};
const record={event_id:'event',source_id:'test',source_record_id:'report-1',source_url:'https://example.org/report',published_at:'2026-09-30T12:00:00Z',retrieved_at:'2026-10-01T12:00:00Z',reviews,
  occurred:{start:'2026-09-29T18:30:00.000Z',end:'2026-09-30T18:29:59.999Z',precision:'day',label:'30 September · India'},category:'assault',setting:'public_space',report_status:'reported_allegation',location,public_summary:'Synthetic fixture'};
const input=()=>structuredClone({schema_version:4,is_real_data:true,dataset_id:'test',version:'test-1',updated_at:reviewed_at,collection:'Test only',sources:[source],scopes:[{id:'scope',name:'Research scope',search_bounds:source.bounds,reference_url:'https://example.org/map'}],streets:[street],incidents:[record],observations:[],coverage:{areas:[]}});
const route=(name='Test Road',x=88.43)=>({route_id:'test',geometry:[[x,22.57],[x,22.58]],duration_seconds:600,distance_meters:1112,steps:[{name,instruction:'Walk',way_points:[0,1]}]});

test('a real source reference is preserved without inventing an exact location or proving an allegation',()=>{
 const data=JSON.parse(readFileSync(new URL('../../evidence/saltlake/reports.v4.json',import.meta.url)));
 const audited=auditDataset(data,now),result=assessRoute(route(),audited,now);
 assert.equal(audited.audit.rejected,0);assert.equal(audited.incidents.length,0);assert.equal(audited.context.length,5);
 assert.equal(result.incident_count,0);assert.equal(result.context_evidence.length,5);assert.equal(result.risk_level,'UNKNOWN');assert.equal(result.passport.coverage_percent,0);
 assert.equal(result.context_evidence.filter(r=>r.historical).length,2);
 assert.ok(result.context_evidence.every(r=>r.relation==='AREA_CONTEXT'&&!('lat' in r)&&!('lng' in r)));
 assert.ok(result.context_evidence.every(r=>r.source_url.startsWith('https://timesofindia.indiatimes.com/')));
});
test('two real location reviewers, a named street and aligned geometry are required; AI checks cannot impersonate reviewers',()=>{
 const d=input();assert.equal(auditDataset(d,now).incidents.length,1);
 d.incidents[0].reviews=reviews.map(r=>({...r,reviewer_type:'automated'}));assert.equal(auditDataset(d,now).incidents.length,0);
 d.incidents[0].reviews=[reviews[0],reviews[0]];assert.equal(auditDataset(d,now).incidents.length,0);
 d.incidents[0].reviews=reviews.map(r=>({...r,barriers_checked:false}));assert.equal(auditDataset(d,now).incidents.length,0);
 const d2=auditDataset(input(),now);assert.equal(assessRoute(route(),d2,now).incident_count,1);
 assert.equal(assessRoute(route('Other Lane'),d2,now).incident_count,0);
 assert.equal(assessRoute(route('পরীক্ষা রাস্তা'),d2,now).incident_count,1);
 const unnamed=route();unnamed.steps=[];assert.equal(assessRoute(unnamed,d2,now).incident_count,0);
});
test('parallel roads, crossing roads and the other side of a street do not inherit a report',()=>{
 const d=auditDataset(input(),now);assert.equal(assessRoute(route('Test Road',88.4304),d,now).incident_count,0);
 const crossing={...route(),geometry:[[88.429,22.575],[88.431,22.575]]};assert.equal(assessRoute(crossing,d,now).incident_count,0);
 const side=input();side.incidents[0].location.side_specific=true;assert.equal(auditDataset(side,now).audit.rejected,1);
 const level=input();level.incidents[0].location.level_specific=true;assert.equal(auditDataset(level,now).audit.rejected,1);
});
test('a short localized event survives a kilometre walk without extending the report to the whole road',()=>{
 const d=input();d.incidents[0].location.geometry.coordinates=[[88.43,22.57499],[88.43,22.57501]];
 const result=assessRoute(route(),auditDataset(d,now),now);
 assert.equal(result.incident_count,1);assert.ok(result.segments.filter(s=>s.evidence_count>0).length<8);
 assert.equal(result.steps[0].way_points[1],result.geometry.length-1);assert.equal(result.passport.analysis_step_meters,10);
 assert.equal(result.risk_level,'UNKNOWN');assert.ok(result.segments.every(s=>s.risk_level==='UNKNOWN'&&s.score===0));
});
test('date intervals preserve day precision, reject invalid dates and age into historical context at request time',()=>{
 assert.equal(dateInterval({...record.occurred,start:'2026-02-30T00:00:00Z'},now),null);
 assert.equal(dateInterval({start:'2026-09-30T12:00:00Z',end:'2026-09-30T13:00:00Z',precision:'exact'},now),null);
 assert.equal(dateInterval({...record.occurred,end:'2027-01-01T00:00:00Z'},now),null);
 const result=assessRoute(route(),auditDataset(input(),now),now+365*86400000);
 assert.equal(result.incident_count,0);assert.equal(result.context_evidence[0].historical,true);
});
test('reports from today or this month retain calendar precision before the calendar interval ends',()=>{
 const d=input(),r=d.incidents[0];r.occurred={start:'2026-10-01T18:30:00.000Z',end:'2026-10-02T18:29:59.999Z',precision:'day',label:'2 October · India'};
 r.published_at='2026-10-02T16:00:00Z';r.retrieved_at='2026-10-02T16:30:00Z';r.reviews=reviews.map(v=>({...v,reviewed_at:'2026-10-02T17:00:00Z'}));
 const a=auditDataset(d,now);assert.equal(a.incidents.length,1);const result=assessRoute(route(),a,now);assert.equal(result.evidence[0].days_old,0);assert.equal(result.evidence[0].occurred.end,r.occurred.end);
 assert.ok(dateInterval({start:'2026-09-30T18:30:00.000Z',end:'2026-10-31T18:29:59.999Z',precision:'month'},now));
 assert.equal(dateInterval({start:'2026-10-01T00:00:00.000Z',end:'2026-10-01T12:00:00.000Z',precision:'month'},now),null);
 assert.equal(dateInterval({...r.occurred,start:'2026-10-02T18:30:00.000Z',end:'2026-10-03T18:29:59.999Z'},now),null);
 assert.ok(dateInterval({...r.occurred,start:r.occurred.start.replace('.000','')},now));
});
test('syndicated duplicate events are counted once; contradictory accepted locations remain context',()=>{
 const d=input();d.incidents.push({...structuredClone(record),source_record_id:'copy',source_url:'https://example.org/copy'});
 const audited=auditDataset(d,now);assert.equal(audited.audit.duplicates,1);assert.equal(audited.incidents.length,1);assert.equal(audited.incidents[0].references.length,2);
 d.incidents[1].location.geometry.coordinates=[[88.43,22.577],[88.43,22.578]];
 const conflicted=auditDataset(d,now);assert.equal(conflicted.incidents.length,0);assert.equal(conflicted.context.length,1);
 assert.match(conflicted.context[0].exclusion_reason,/disagree/);
});
test('unresolved, private and transport reports remain context; invalid provenance cannot become a clean empty feed',()=>{
 for(const setting of ['private_space','transport','campus']){const d=input();d.incidents[0].setting=setting;assert.equal(auditDataset(d,now).incidents.length,0);}
 const d=input();d.incidents[0].source_url='https://unrelated.example/report';assert.equal(auditDataset(d,now).audit.reasons.publisher_mismatch,1);
 const possible=input();possible.incidents[0].location={...location,kind:'possible_sections',candidates:[{street_id:'street',geometry:location.geometry,reference_url:location.reference_url}]};
 const r=assessRoute(route(),auditDataset(possible,now),now);assert.equal(r.incident_count,0);assert.equal(r.context_evidence[0].location_kind,'possible_sections');assert.ok(!JSON.stringify(r.context_evidence).includes('coordinates'));
});
test('search-area intersection catches sparse geometry crossing a box and never certifies coverage',()=>{
 const scope={search_bounds:[88.42,22.57,88.44,22.59]};assert.equal(scopeIntersectsRoute(scope,[[88.41,22.58],[88.45,22.58]]),true);
 assert.equal(scopeIntersectsRoute(scope,[[88.41,22.60],[88.45,22.60]]),false);
 const d=input();d.incidents[0].location={kind:'unresolved',reason:'No location',scope_ids:['scope']};
 const r=assessRoute(route(),auditDataset(d,now),now);assert.equal(r.coverage,'UNAVAILABLE');assert.equal(r.passport.coverage_percent,0);
});
test('observation expiry, evidence, licensing and human review are enforced',()=>{
 const d=input();d.observations=[{id:'o',source_id:'test',kind:'walkway_closed',location,observed_at:'2026-10-02T15:00:00Z',expires_at:'2026-10-02T18:00:00Z',time_of_day:'any',measurement:'direct_observation',evidence_url:'https://example.org/photo',reviews}];
 const audited=auditDataset(d,now);assert.equal(audited.observations.length,1);assert.equal(assessRoute(route(),audited,now).observations.length,1);
 assert.equal(assessRoute(route(),audited,now+3600000).observations.length,0);
 d.observations[0].expires_at='2026-10-03T18:00:00Z';assert.equal(auditDataset(d,now).observations.length,0);
 d.observations[0].expires_at='2026-10-02T18:00:00Z';d.sources[0]={...source,reuse:{basis:'public_reference',terms:'Link only'}};assert.equal(auditDataset(d,now).observations.length,0);
});
test('even complete incident feeds cannot produce calibrated crime probabilities or low safety labels',()=>{
 const d=input();d.coverage.areas=[{source_id:'test',bounds:source.bounds,collection:'complete_geocoded_feed',method_url:'https://example.org/method',reviews,
  categories:['violent_crime','sexual_assault','robbery','kidnapping','assault','harassment','theft','vandalism','traffic_incident','other'],settings:['public_space'],total_records:1,geocoded_records:1,
  window_start:'2025-09-01T00:00:00Z',window_end:'2026-10-01T00:00:00Z',updated_at:reviewed_at}];
 const audited=auditDataset(d,now);assert.equal(audited.areas.length,1);const result=assessRoute(route(),audited,now);assert.equal(result.coverage,'AVAILABLE');assert.equal(result.risk_level,'UNKNOWN');
 const fast={...result,route_id:'fast',duration_seconds:500,risk_score:1};const ordered=labelRoutes([result,fast]);assert.equal(ordered[0].route_id,'fast');assert.equal(ordered[0].decision.basis,'WALKING_TIME');
 d.coverage.areas[0].categories=['assault'];assert.equal(auditDataset(d,now).areas.length,0);
 d.coverage.areas[0].categories=['violent_crime','sexual_assault','robbery','kidnapping','assault','harassment','theft','vandalism','traffic_incident','other'];d.coverage.areas[0].geocoded_records=0;assert.equal(auditDataset(d,now).areas.length,0);
 d.coverage.areas[0].geocoded_records=2;d.coverage.areas[0].total_records=2;assert.equal(auditDataset(d,now).areas.length,0);
});
test('public route explanations and evidence status contain only safe fields and work through the API',async()=>{
 const d=input();d.incidents[0].victim_name='PRIVATE';d.incidents[0].reviews[0].notes='PRIVATE';d.sources[0].internal_token='PRIVATE';
 const app=buildApp({disableWorker:true,now:()=>now,evidenceDataset:d,routeLive:async()=>[route()],config:{INCIDENT_DATA_PATH:''}});
 try{
  const session=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json();const headers={authorization:'Bearer '+session.session_token};
  const status=await app.inject({url:'/v1/evidence/status',headers});assert.equal(status.json().dataset.version,'test-1');assert.ok(!status.body.includes('PRIVATE'));
  const plan=await app.inject({method:'POST',url:'/v1/plans',headers,payload:{mode:'LIVE',origin:{longitude:88.43,latitude:22.57},destination:{longitude:88.43,latitude:22.58}}});
  assert.equal(plan.statusCode,200);assert.equal(plan.json().routes[0].incident_count,1);assert.deepEqual(plan.json().routes[0].decision.reasons.map(r=>r.kind),['TIME','REPORTS','GAPS','ENVIRONMENT']);assert.ok(!plan.body.includes('PRIVATE'));
  assert.equal((await app.inject({url:'/v1/evidence/status'})).statusCode,401);
 }finally{await app.close();}
});

test('section interiors cannot cut across a curved reference street',()=>{
 const d=input();d.streets[0].geometry.coordinates=[[88.43,22.574],[88.435,22.574],[88.435,22.576]];
 d.incidents[0].location.geometry.coordinates=[[88.43,22.574],[88.435,22.576]];
 assert.equal(auditDataset(d,now).audit.reasons.invalid_location,1);
});
test('reused publisher records and rejected location reviews never inflate street evidence',()=>{
 const d=input();d.incidents.push({...structuredClone(record),event_id:'different-event'});
 const a=auditDataset(d,now);assert.equal(a.incidents.length,0);assert.equal(a.audit.accepted,0);assert.equal(a.audit.rejected,2);
 const disputed=input();disputed.incidents[0].reviews.push({...reviews[0],reviewer_id:'third-real-reviewer',decision:'reject'});
 assert.equal(auditDataset(disputed,now).incidents.length,0);assert.match(auditDataset(disputed,now).context[0].exclusion_reason,/rejected/);
});
test('invalid dataset metadata preserves walking plans with unknown evidence',()=>{
 const d=input();d.updated_at='invalid';const a=auditDataset(d,now);
 const r=assessRoute(route(),a,now);assert.equal(r.risk_level,'UNKNOWN');assert.equal(r.incident_count,0);assert.equal(r.passport.dataset_version,'UNAVAILABLE');
});
test('conflicting fresh conditions remain visible but cannot certify current observation coverage',()=>{
 const d=input();const base={source_id:'test',location,observed_at:'2026-10-02T15:00:00Z',expires_at:'2026-10-02T18:00:00Z',time_of_day:'any',measurement:'direct_observation',evidence_url:'https://example.org/photo',reviews};
 d.observations=['lighting_out','lighting_working','walkway_open'].map((kind,i)=>({...base,id:'o'+i,kind}));
 const r=assessRoute(route(),auditDataset(d,now),now);assert.equal(r.observations.length,3);assert.equal(r.passport.observation_coverage_percent,0);assert.ok(r.segments.some(s=>s.observation_conflict));
});
test('snapshots are immutable, hashed and refuse invalid publications',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sheshield-evidence-'));
 try{const file=join(dir,'input.json');writeFileSync(file,JSON.stringify(input()));
  const first=publishEvidence(file,dir,now),again=publishEvidence(file,dir,now+1000);assert.equal(first.sha256,again.sha256);assert.equal(first.published_at,again.published_at);assert.equal(first.accuracy,'UNMEASURED');
  const d=input();d.incidents[0].source_url='javascript:alert(1)';writeFileSync(file,JSON.stringify(d));assert.throws(()=>publishEvidence(file,dir,now));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('accuracy is unmeasured for zero independent reference events, and errors are counted on a real reference sample',()=>{
 const d=input();let result=evaluateEvidence(d,{records:[]},now);assert.equal(result.status,'UNMEASURED');assert.equal(result.wrong_street_rate,null);assert.equal(result.resolved_recall,null);
 const reference={independent_review:true,reviewers:['test-independent-person'],method_url:'https://example.org/reference',records:[{event_id:'event',resolved:true,allowed_street_ids:['another-street']},{event_id:'missing',resolved:true,allowed_street_ids:['street']}]};
 result=evaluateEvidence(d,reference,now);assert.equal(result.wrong_street,1);assert.equal(result.missed_resolved,1);assert.equal(result.wrong_street_rate,1);assert.equal(result.resolved_recall,0);
 assert.throws(()=>evaluateEvidence(d,{...reference,independent_review:false},now));
});

test('legacy saved live scores cannot initiate inferred risk-segment check-ins',async()=>{
 const app=buildApp({disableWorker:true,now:()=>now,evidenceDataset:input(),routeLive:async()=>[route()],config:{INCIDENT_DATA_PATH:''}});
 try{const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;
 const headers={authorization:'Bearer '+token,'idempotency-key':'test-start'};
 const plan=(await app.inject({method:'POST',url:'/v1/plans',headers,payload:{mode:'LIVE',origin:{longitude:88.43,latitude:22.57},destination:{longitude:88.43,latitude:22.58}}})).json();
 const trip=(await app.inject({method:'POST',url:'/v1/trips',headers,payload:{plan_id:plan.id,route_id:plan.routes[0].route_id,contacts:[]}})).json();
 trip.route.segments[0].risk_level='HIGH';app.store.put('trip',trip);
 const result=await app.inject({method:'POST',url:`/v1/trips/${trip.id}/check-ins`,headers:{...headers,'idempotency-key':'old-risk'},payload:{segment_id:trip.route.segments[0].segment_id}});
 assert.equal(result.statusCode,400);assert.equal(result.json().code,'INVALID_SEGMENT');assert.equal(app.store.list('sos').length,0);
 const watch=await app.inject({method:'POST',url:`/v1/trips/${trip.id}/check-ins`,headers:{...headers,'idempotency-key':'personal'},payload:{kind:'PERSONAL',window_seconds:120}});
 assert.equal(watch.statusCode,200);assert.equal(watch.json().check_in.kind,'PERSONAL');
 }finally{await app.close();}
});
