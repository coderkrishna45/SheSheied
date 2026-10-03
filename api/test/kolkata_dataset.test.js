import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditDataset,assessRoute} from '../src/evidence.js';
import {loadWalkingData,enrichWalkingRoute} from '../src/walking_environment.js';
const now=Date.parse('2026-10-03T09:00:00Z');
test('Kolkata sample preserves locality, sources and original dates without certifying street coverage or pedestrian exposure from transport reports',()=>{
 const raw=JSON.parse(readFileSync(new URL('../../evidence/kolkata/reports.v4.json',import.meta.url))),data=auditDataset(raw,now);
 assert.equal(data.audit.rejected,0);assert.equal(data.audit.context_only,10);assert.equal(data.incidents.length,0);assert.equal(data.areas.length,0);
 const make=geometry=>assessRoute({route_id:'walk',geometry,steps:[],distance_meters:500,duration_seconds:600},data,now);
 const northern=make([[88.35,22.594],[88.35,22.60]]);assert.ok(northern.insight_context.some(r=>r.location_label.includes('Nimtala')));assert.equal(northern.coverage,'UNAVAILABLE');assert.equal(northern.incident_count,0);assert.equal(northern.risk_level,'UNKNOWN');
 const hazra=make([[88.349,22.518],[88.348,22.523]]);assert.ok(hazra.insight_context.every(r=>r.setting==='public_space'));assert.ok(!hazra.insight_context.some(r=>r.location_label.includes('moving auto')));
 assert.ok(raw.incidents.every(r=>r.reviews.every(v=>v.reviewer_type==='automated'&&!v.location_confirmed)));
});
test('city-wide facility extract provides source-linked police and hospitals beyond Salt Lake with unconfirmed entrance and assistance',()=>{
 const raw=JSON.parse(readFileSync(new URL('../../evidence/kolkata/environment/walking.v1.json',import.meta.url))),data=loadWalkingData(raw,now);
 assert.equal(data.audit.rejected,0);assert.ok(data.places.filter(p=>p.tags.amenity==='police').length>=40);assert.ok(data.places.filter(p=>p.tags.amenity==='hospital').length>=300);
 const r=enrichWalkingRoute({geometry:[[88.351,22.5641],[88.352,22.563]],steps:[],distance_meters:300,duration_seconds:300},data,{},now);
 assert.ok(r.environment.help_places.some(p=>p.category==='police'));assert.ok(r.environment.help_places.length<=8);assert.equal(r.environment.activity,'UNKNOWN');
 assert.ok(r.environment.help_places.every(p=>p.source_url.startsWith('https://www.openstreetmap.org/')&&p.assistance_status==='UNCONFIRMED'));
});
