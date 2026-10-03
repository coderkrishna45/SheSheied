// Enroll, inspect evidence, search places and calculate walks. Never starts trips or alerts.
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=(process.argv[2]||process.env.PUBLIC_BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');let token;
async function call(path,body) {
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error(`HTTP ${response.status}: API connection unavailable`);
  const data=await response.json();if(!response.ok)throw Error(`HTTP ${response.status}: ${data.code}`);return data;
}
try {
  token=(await call('/v1/sessions',{enrollment_code:process.env.ENROLLMENT_CODE})).session_token;
  const status=await call('/v1/evidence/status');assert.equal(status.dataset?.dataset_id,'saltlake-public-references');assert.equal(status.audit.context_only,5);assert.equal(status.audit.accepted,0);
  const groups=[['Sector V','Technopolis Kolkata','Wipro Kolkata'],['Sector II','BG Block Salt Lake Kolkata','BJ Block Salt Lake Kolkata']];
  if(process.argv[3]==='--search') {
    for(const query of process.argv.slice(4)){await new Promise(resolve=>setTimeout(resolve,1200));console.log(JSON.stringify({query,...await call('/v1/places?q='+encodeURIComponent(query))}));}
    process.exit(0);
  }
  const checks=[];
  for(const [area,fromQuery,toQuery] of groups) {
    const pair=[];
    for(const query of [fromQuery,toQuery]) {
      await new Promise(resolve=>setTimeout(resolve,1200));const result=await call('/v1/places?q='+encodeURIComponent(query));
      const place=result.places?.find(p=>p.longitude>=88.39&&p.longitude<=88.46&&p.latitude>=22.55&&p.latitude<=22.65);
      if(!place)throw Error('No Salt Lake search match for '+query);
      pair.push(place);console.log('Verified search:',query);
    }
    const plan=await call('/v1/plans',{mode:'LIVE',origin:pair[0],destination:pair[1]});assert.ok(plan.routes.length);
    for(const r of plan.routes) {
      assert.equal(r.is_demo_data,false);assert.equal(r.risk_level,'UNKNOWN');assert.equal(r.incident_count,0);assert.equal(r.passport.coverage_percent,0);
      assert.equal(r.context_evidence.length,5);assert.equal(r.context_evidence.filter(e=>e.historical).length,2);assert.equal(r.decision.basis,'WALKING_TIME');assert.equal(r.passport.dataset_version,status.dataset.version);
      assert.ok(r.geometry.length>2);assert.ok(r.segments.every(s=>s.risk_level==='UNKNOWN'&&s.score===0));
      assert.ok(r.context_evidence.every(e=>!('lat' in e)&&!('lng' in e)&&!('geometry' in e)));
    }
    checks.push({area,origin:pair[0],destination:pair[1],routes:plan.routes.map(r=>({meters:r.distance_meters,seconds:r.duration_seconds,geometry_vertices:r.geometry.length,
      origin_snap_meters:r.origin_snap_meters,destination_snap_meters:r.destination_snap_meters,safety:r.risk_level,matched_street_reports:r.incident_count,context_reports:r.context_evidence.length,
      reporting_coverage_percent:r.passport.coverage_percent,analysis_step_meters:r.passport.analysis_step_meters,decision:r.decision.basis}))});
    console.log(area+': '+plan.routes.length+' actual walking options; shortest '+plan.routes[0].distance_meters+' m; 5 wider-area reports; safety unknown.');
  }
  const report={checked_at:new Date().toISOString(),api_url:base,dataset_version:status.dataset.version,dataset_sha256:status.dataset.sha256,checks,
    limitation:'Provider search/routing and honest evidence presentation were checked. This is not a GPS walk or validation of street crime accuracy. Geocoder endpoint pins are not incident locations.',trips_started:0,alerts_requested:0};
  writeFileSync('artifacts/saltlake-live-check.json',JSON.stringify(report,null,2)+'\n');console.log('Salt Lake check passed. No journeys or alerts were started.');
}catch(error){console.error('Salt Lake check failed:',error.message);process.exitCode=1;}
