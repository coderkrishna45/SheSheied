import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDataset,assessRoute,labelRoutes,subdivideRoute} from '../src/evidence.js';
import {haversine} from '../src/risk.js';

const now=Date.parse('2026-10-02T12:00:00Z');
const route={route_id:'r',geometry:[[88.35,22.56],[88.35,22.575]],duration_seconds:1200,distance_meters:1668,
  steps:[{instruction:'Walk',way_points:[0,1]}]};
const source={id:'test',name:'Synthetic test source',url:'https://example.org/feed',license:'Test only',kind:'official',bounds:[88.2,22.4,88.6,22.8]};
const record={event_id:'event-1',source_id:'test',source_record_id:'case-1',source_url:'https://example.org/case/1',
  lat:22.567,lng:88.35,incident_date:'2026-09-30T12:00:00Z',retrieved_at:'2026-10-01T12:00:00Z',reviewed_at:'2026-10-01T14:00:00Z',
  reviewed_by:'test-steward',verification:'reviewed',precision_meters:30,location_method:'verified_coordinate',setting:'public_space',category:'harassment'};
const area={source_id:'test',bounds:[88.34,22.55,88.36,22.59],collection:'complete_geocoded_feed',resolution_meters:50,
  window_start:'2025-09-01T00:00:00Z',window_end:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T12:00:00Z',method_url:'https://example.org/method'};
const dataset=(incidents=[record],areas=[area])=>({schema_version:3,is_real_data:true,sources:[source],incidents,coverage:{areas}});

test('city bounds and a real-data flag cannot certify any street',()=>{
 const old=auditDataset({is_real_data:true,incidents:[record],coverage:{bounds:area.bounds}},now);
 const r=assessRoute(route,old,now);
 assert.equal(r.coverage,'UNAVAILABLE');assert.equal(r.passport.coverage_percent,0);assert.equal(r.risk_level,'UNKNOWN');
 assert.ok(r.passport.longest_unknown_meters>1600);assert.ok(old.audit.error);
});
test('provenance, date, review and coordinate errors are quarantined, never counted as an empty clean feed',()=>{
 const invalid=[{...record,event_id:'a',source_url:'javascript:alert(1)'},{...record,event_id:'b',verification:'pending'},
  {...record,event_id:'c',incident_date:'2027-10-01T00:00:00Z'},{...record,event_id:'d',lat:88.35,lng:22.567},
  {...record,event_id:'e',lat:'22.567'},{...record,event_id:'f',precision_meters:0}];
 const d=auditDataset(dataset(invalid),now);
 assert.equal(d.audit.rejected,6);
 assert.equal(d.areas.length,0);
 assert.equal(assessRoute(route,d,now).incident_count,0);
});
test('centroids and private-space records stay out of street exposure; a precise duplicate supersedes context',()=>{
 const d=auditDataset(dataset([{...record,precision_meters:1500,location_method:'neighbourhood_centroid'},record,
  {...record,event_id:'private',source_record_id:'private',setting:'private_space'}]),now);
 assert.equal(d.incidents.length,1);assert.equal(d.context.length,1);
 assert.equal(assessRoute(route,d,now).passport.context_report_count,1);
});
test('the same case and syndicated event are counted once',()=>{
 const d=auditDataset(dataset([record,{...record,source_url:'https://example.org/copy'},
  {...record,source_record_id:'second-article'}]),now);
 assert.equal(d.audit.accepted,1);assert.equal(d.audit.duplicates,2);
 assert.equal(assessRoute(route,d,now).incident_count,1);
});
test('short routes get pieces no longer than 50 m and turn instructions retain their geometry indexes',()=>{
 const r=subdivideRoute(route);
 assert.equal(r.steps[0].way_points[1],r.geometry.length-1);
 for(let i=1;i<r.geometry.length;i++)assert.ok(haversine(r.geometry[i-1][1],r.geometry[i-1][0],r.geometry[i][1],r.geometry[i][0])*1000<=50.01);
 const d=auditDataset(dataset(),now),scored=assessRoute(route,d,now);
 assert.equal(scored.coverage,'AVAILABLE');assert.equal(scored.incident_count,1);
 assert.equal(scored.risk_score,0);assert.equal(scored.passport.peak_exposure,0);
 assert.ok(scored.segments.every(s=>s.score===0&&s.risk_level==='UNKNOWN'));
 assert.ok(scored.passport.stretches.some(s=>s.kind==='REPORTS'&&s.to_meters-s.from_meters<500));
});
test('partial and expired feeds expose a continuous gap; a later request cannot reuse expired coverage',()=>{
 const d=auditDataset(dataset([], [{...area,bounds:[88.34,22.55,88.36,22.568]}]),now);
 const r=assessRoute(route,d,now);
 assert.equal(r.coverage,'PARTIAL');assert.ok(r.passport.coverage_percent>0&&r.passport.coverage_percent<100);
 assert.ok(r.passport.longest_unknown_meters>800);
 assert.equal(assessRoute(route,d,now+31*86400000).coverage,'UNAVAILABLE');
 assert.equal(auditDataset(dataset([],[{...area,window_end:'2026-08-01T00:00:00Z'}]),now).areas.length,0);
});
test('a route near the feed boundary has unknown coverage when its incident corridor extends outside it',()=>{
 const d=auditDataset(dataset([],[{...area,bounds:[88.3499,22.55,88.36,22.59]}]),now);
 assert.equal(assessRoute(route,d,now).coverage,'UNAVAILABLE');
});
test('coordinate uncertainty is displayed, including possible overlap at the corridor boundary',()=>{
 const d=auditDataset(dataset([{...record,lng:88.35195,precision_meters:100}]),now);
 const r=assessRoute(route,d,now);
 assert.equal(r.incident_count,1);assert.equal(r.evidence[0].possible_overlap,true);
 assert.ok(r.evidence[0].distance_min_meters<150);assert.ok(r.evidence[0].distance_max_meters>250);
 assert.ok(r.segments.some(s=>s.evidence_count===1));
});
test('known reports survive missing coverage; alternatives with unknown evidence sort by time',()=>{
 const d=auditDataset(dataset([record],[]),now),known=assessRoute(route,d,now);
 assert.equal(known.incident_count,1);assert.equal(known.risk_level,'UNKNOWN');
 const fast={...known,route_id:'fast',duration_seconds:600,risk_score:1};
 const result=labelRoutes([known,fast]);assert.equal(result[0].route_id,'fast');assert.equal(result[0].label,'Fastest walking route');
});
test('a news publisher cannot declare complete reporting coverage',()=>{
 const input=dataset();input.sources[0]={...source,kind:'news'};
 assert.equal(auditDataset(input,now).areas.length,0);
});

test('calendar-invalid and timezone-free timestamps are rejected',()=>{
 for(const incident_date of ['2026-02-30T12:00:00Z','2026-09-30T12:00:00','2026-09-30'])
  assert.equal(auditDataset(dataset([{...record,incident_date}]),now).audit.rejected,1);
});

test('an imprecise public-space record prevents that publisher claiming complete geocoded coverage',()=>{
 const d=auditDataset(dataset([{...record,precision_meters:1000,location_method:'neighbourhood_centroid'}]),now);
 assert.equal(d.context.length,1);assert.equal(d.areas.length,0);
});

test('coverage metadata exposes only the fields needed to explain reporting coverage',()=>{
 const d=auditDataset(dataset([], [{...area,internal_notes:'private steward notes',reviewer_email:'private@example.org'}]),now);
 assert.equal(d.areas.length,1);
 assert.equal(d.areas[0].internal_notes,undefined);
 assert.equal(d.areas[0].reviewer_email,undefined);
});
