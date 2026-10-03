import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionPreview,DEFAULT_CONDITION_PREVIEW} from '../src/condition_preview.js';
import {buildApp} from '../src/app.js';

const a=[88.431,22.572],b=[88.431,22.578],east=[88.433,22.572],north=[88.433,22.578];
const at=Date.parse('2026-10-03T12:00:00Z');
const road=(n,geometry,highway)=>({id:`way/${n}`,geometry,tags:{highway},node_ids:geometry.map((_,i)=>`${n}-${i}`),updated_at:'2026-09-01T00:00:00Z',source_url:`https://www.openstreetmap.org/way/${n}`});
const walking=()=>({schema_version:1,version:'test',collected_at:new Date(at).toISOString(),license:'ODbL-1.0',roads:[road(1,[a,b],'service'),road(2,[a,east,north,b],'primary')],places:[],areas:[],report_areas:[]});
const route=(id,geometry,seconds=600)=>({route_id:id,geometry,duration_seconds:seconds,distance_meters:700,risk_level:'UNKNOWN',risk_score:0,is_demo_data:false,evidence:[],segments:[],environment:{summary:{restricted_meters:0}}});
const routes=()=>[route('short',[a,b]),route('connected',[a,east,north,b],720)];
const engine=()=>conditionPreview(DEFAULT_CONDITION_PREVIEW,walking());

test('real geometry yields stable, distinct synthetic conditions without manufacturing crime facts',()=>{
 const rs=engine()(routes()),[short,connected]=rs;
 assert.equal(short.condition_preview.level,'HIGH');assert.equal(connected.condition_preview.level,'LOW');
 assert.equal(connected.condition_preview.recommended,true);assert.equal(short.condition_preview.recommended,false);
 assert.ok(short.condition_preview.summary.caution_meters>600);assert.ok(connected.condition_preview.summary.lower_exposure_meters>900);
 for(const r of rs){assert.equal(r.risk_level,'UNKNOWN');assert.equal(r.risk_score,0);assert.equal(r.is_demo_data,false);assert.deepEqual(r.evidence,[]);assert.deepEqual(r.segments,[]);assert.match(r.condition_preview.disclosure,/Synthetic/);}
 assert.deepEqual(engine()([...routes()].reverse()).map(r=>r.condition_preview).reverse(),rs.map(r=>r.condition_preview));
});
test('detour limit, access restrictions, equal geometry and single route do not create false improvements',()=>{
 assert.equal(engine()(routes(),0).find(r=>r.condition_preview.recommended).route_id,'short');
 const rs=routes();rs[1].environment.summary.restricted_meters=20;
 assert.equal(engine()(rs).find(r=>r.condition_preview.recommended).route_id,'short');
 const same=engine()([route('a',[a,b]),route('b',[a,b],720)]);
 assert.equal(same[0].condition_preview.score,same[1].condition_preview.score);
 assert.deepEqual(same[0].condition_preview.stretches,same[1].condition_preview.stretches);
 assert.equal(same[0].condition_preview.recommended,true);
 assert.equal(engine()([routes()[0]])[0].condition_preview.comparison_available,false);
 assert.equal(engine()([routes()[0]])[0].condition_preview.recommended,false);
});
test('outside Salt Lake, missing maps, competing parallel profiles and rehearsal remain unknown or absent',()=>{
 const unknown=conditionPreview(DEFAULT_CONDITION_PREVIEW,{roads:[]})(routes());
 assert.ok(unknown.every(r=>r.condition_preview.level==='UNKNOWN'&&!r.condition_preview.recommended));
 assert.equal(engine()([route('outside',[[88.35,22.55],[88.36,22.56]])])[0].condition_preview,undefined);
 assert.equal(engine()([{...routes()[0],is_demo_data:true}])[0].condition_preview,undefined);
 const map=walking();map.roads.push(road(3,[[a[0]+.00001,a[1]],[b[0]+.00001,b[1]]],'primary'));
 assert.equal(conditionPreview(DEFAULT_CONDITION_PREVIEW,map)([routes()[0]])[0].condition_preview.level,'UNKNOWN');
});
test('sparse routes are clipped at the scenario boundary; uncovered portions stay grey and cannot be recommended',()=>{
 const map=walking();map.roads=[road(1,[[88.431,22.56],[88.431,22.62]],'primary')];
 const r=conditionPreview(DEFAULT_CONDITION_PREVIEW,map)([route('cross',map.roads[0].geometry)])[0];
 assert.ok(r.condition_preview.summary.unknown_meters>1000);assert.ok(r.condition_preview.summary.lower_exposure_meters>1000);
 assert.equal(r.condition_preview.level,'UNKNOWN');assert.equal(r.condition_preview.recommended,false);
 assert.ok(r.condition_preview.stretches.some(s=>s.level==='UNKNOWN'));assert.ok(r.condition_preview.stretches.some(s=>s.level==='LOW'));
});
test('a hypothetical zone clips a mapped road precisely and significant exposed metres remain visible in a long walk',()=>{
 const points=[[88.435,22.575],[88.435,22.581]],map={roads:[road(1,points,'primary')]};
 const r=conditionPreview(DEFAULT_CONDITION_PREVIEW,map)([route('zone',points)])[0],p=r.condition_preview;
 assert.ok(p.summary.caution_meters>270&&p.summary.caution_meters<280);
 assert.ok(p.summary.lower_exposure_meters>380);assert.equal(p.level,'HIGH');
 const high=p.stretches.filter(s=>s.level==='HIGH');assert.ok(high.every(s=>s.geometry.every(point=>point[1]>=22.5768-1e-9&&point[1]<=22.5793+1e-9)));
});
test('LIVE plan, opt-out, persistence and reroutes preserve preview provenance; synthetic stretches cannot trigger alerts',async()=>{
 let n=0;const app=buildApp({disableWorker:true,now:()=>at,walkingDataset:walking(),config:{INCIDENT_DATA_PATH:'',WALKING_DATA_PATH:'',SALT_LAKE_CONDITION_PREVIEW:'true',ENROLLMENT_CODE:'',LIVE_ALERTS_ENABLED:'false'},routeLive:async()=>routes()});
 try{
  const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;
  const call=(method,url,payload)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+token,'idempotency-key':String(n++)}});
  const make=async(extra={})=>(await call('POST','/v1/plans',{mode:'LIVE',origin:{longitude:a[0],latitude:a[1]},destination:{longitude:b[0],latitude:b[1]},...extra})).json();
  const p=await make();assert.ok(p.routes.every(r=>r.condition_preview));assert.equal(p.mode,'LIVE');
  const off=(await call('POST',`/v1/plans/${p.id}/compare`,{condition_preview:false})).json();assert.ok(off.routes.every(r=>!r.condition_preview));
  assert.ok((await make({condition_preview:false})).routes.every(r=>!r.condition_preview));
  assert.ok((await make({mode:'REHEARSAL'})).routes.every(r=>!r.condition_preview));
  const on=(await call('POST',`/v1/plans/${p.id}/compare`,{condition_preview:true})).json();
  const t=(await call('POST','/v1/trips',{plan_id:p.id,route_id:on.routes[0].route_id,contacts:[]})).json();assert.equal(t.mode,'LIVE');assert.equal(t.route.condition_preview.kind,'SYNTHETIC_WALKING_CONDITIONS');
  const fix={longitude:a[0],latitude:a[1],timestamp_ms:at,accuracy_meters:5,sequence:1};
  const moved=(await call('POST',`/v1/trips/${t.id}/locations`,fix)).json();assert.equal(moved.check_in,null);assert.equal(app.store.list('sos').length,0);assert.equal(app.store.list('sms_attempt').length,0);
  const proposal=(await call('POST',`/v1/trips/${t.id}/reroute`,{origin:fix})).json();assert.ok(proposal.routes?.length>0);assert.ok(proposal.routes.every(r=>r.condition_preview));
  const status=(await call('GET','/v1/evidence/status')).json();assert.equal(status.audit.accepted,0);assert.equal(status.condition_preview.kind,'SYNTHETIC_WALKING_CONDITIONS');
  const ready=(await app.inject('/ready')).json();assert.equal(ready.risk_data,false);assert.equal(ready.condition_preview,'SYNTHETIC_SALT_LAKE');
 }finally{await app.close();}
});
