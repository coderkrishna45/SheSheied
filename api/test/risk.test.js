import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreRoute,segmentDistanceKm,normalizeIncidents} from '../src/risk.js';
const geometry=[[0,0],[.02,0]];
test('midpoint incidents are measured against the segment, including valid zero coordinates',()=>{
 assert.equal(segmentDistanceKm([.01,0],...geometry),0);
 const r=scoreRoute([{id:'a',lat:0,lng:.01,days_old:0,category:'violent_crime'}],geometry);
 assert.equal(r.incident_count,1);assert.equal(r.score,.1);
});
test('missing data has unknown exposure, valid empty coverage has low reported exposure',()=>{
 assert.equal(scoreRoute([],geometry,.5,{coverage:'UNAVAILABLE'}).level,'UNKNOWN');
 assert.equal(scoreRoute([],geometry).level,'LOW');
});
test('invalid dates, duplicate IDs and malformed coordinates are excluded',()=>{
 const input=[{id:'a',lat:0,lng:.01,days_old:0},{id:'a',lat:0,lng:.01,days_old:0},{id:'b',lat:0,lng:.01,incident_date:'no date'},{id:'c',lat:0,lng:.01,days_old:-1},{id:'d',lat:91,lng:0,days_old:0}];
 assert.equal(normalizeIncidents(input).length,1);
});
test('geographic exposure is deterministic and stale incidents contribute less',()=>{
 const inc=[{lat:0,lng:.01,days_old:0,category:'robbery'}];
 const options={now:Date.parse("2026-10-01T12:00:00Z")};assert.deepEqual(scoreRoute(inc,geometry,.5,options),scoreRoute(inc,geometry,.5,options));
 assert.ok(scoreRoute(inc,geometry).score>scoreRoute([{...inc[0],days_old:360}],geometry).score);
 assert.throws(()=>scoreRoute([],[[NaN,0],[1,2]]));
});
