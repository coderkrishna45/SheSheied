import test from 'node:test';
import assert from 'node:assert/strict';
import {selectInsightContext} from '../src/street_evidence.js';
const now=Date.parse('2026-10-03T09:00:00Z'),route=[[88.35,22.56],[88.35,22.561]],scopes=[{id:'local',search_bounds:[88.349,22.559,88.351,22.562]},{id:'near',search_bounds:[88.36,22.559,88.361,22.562]},{id:'far',search_bounds:[88.40,22.559,88.41,22.562]}];
const record=(id,scope='local',extra={})=>({id,setting:'public_space',category:'robbery',occurred:{start:'2026-09-20T00:00:00Z'},location:{scope_ids:[scope]},...extra});
test('walking insights exclude private, campus, transport, traffic and history; cap recent relevant area references',()=>{
 const records=[...Array.from({length:9},(_,i)=>record('local-'+i)),record('campus','local',{setting:'campus'}),record('private','local',{setting:'private_space'}),record('auto','local',{setting:'transport'}),record('collision','local',{category:'traffic_incident'}),record('history','local',{occurred:{start:'2024-01-01T00:00:00Z'}}),record('near','near')];
 const r=selectInsightContext(records,scopes,route,now);assert.equal(r.selection.basis,'LOCAL_AREA');assert.equal(r.records.length,5);assert.equal(r.selection.total_relevant,9);assert.ok(r.records.every(v=>v.id.startsWith('local-')));
});
test('only an empty relevant area result expands to 2 km research bounds, never to unrelated city reports or incident distances',()=>{
 const r=selectInsightContext([record('near','near'),record('far','far')],scopes,route,now);assert.equal(r.selection.basis,'EXPANDED_AREA');assert.equal(r.selection.radius_meters,2000);assert.deepEqual(r.records.map(r=>r.id),['near']);assert.match(r.selection.notice,/research areas/);
 const empty=selectInsightContext([record('far','far')],scopes,route,now);assert.equal(empty.selection.basis,'NONE');assert.equal(empty.records.length,0);
});
