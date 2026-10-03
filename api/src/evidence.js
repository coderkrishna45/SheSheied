import {haversine, validPoint, segmentDistanceKm, scoreRoute} from './risk.js';
import {auditStreetDataset,assessStreetRoute} from './street_evidence.js';

const DAY = 86400000;
const categories = new Set(['violent_crime','sexual_assault','robbery','kidnapping','assault','harassment','theft','vandalism','traffic_incident','other']);
const date = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value))return NaN;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,19)===value.slice(0,19)?parsed:NaN;
};
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const present = value => typeof value === 'string' && value.trim().length > 0;
const boundsValid = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && validPoint(b.slice(0,2)) && validPoint(b.slice(2)) && b[0]<b[2] && b[1]<b[3];
const inside = (p,b) => p[0]>=b[0] && p[0]<=b[2] && p[1]>=b[1] && p[1]<=b[3];

// This validates provenance supplied by a data steward. It cannot authenticate a report's truth.
export function auditDataset(input = {}, now = Date.now()) {
  if(input?.schema_version===4)return auditStreetDataset(input,now);
  const result = {incidents:[], context:[], areas:[], sources:[], audit:{accepted:0, context_only:0, rejected:0, duplicates:0, reasons:{}}};
  const reject = reason => { result.audit.rejected++; result.audit.reasons[reason]=(result.audit.reasons[reason]||0)+1; };
  if (!input || input.schema_version!==3 || input.is_real_data!==true || !Array.isArray(input.sources) || !Array.isArray(input.incidents)) {
    result.audit.error='A reviewed version 3 dataset is required. Legacy bounds and a real-data flag do not establish street coverage.';
    return result;
  }
  const sources = new Map();
  for (const s of input.sources) {
    if (!s || typeof s!=='object') continue;
    if (present(s.id) && present(s.name) && https(s.url) && present(s.license) && boundsValid(s.bounds) && ['official','partner','news'].includes(s.kind) && !sources.has(s.id)) {
      const source={id:s.id,name:s.name,url:s.url,license:s.license,kind:s.kind,bounds:s.bounds};
      sources.set(s.id,source); result.sources.push(source);
    }
  }
  const events=new Set(), sourceRecords=new Set(), impreciseSources=new Set();
  for (const r of input.incidents) {
    const source=sources.get(r?.source_id);
    if (!source || !https(r.source_url) || !present(r.source_record_id) || !present(r.event_id)) { reject('missing_provenance'); continue; }
    const occurred=date(r.incident_date), retrieved=date(r.retrieved_at), reviewed=date(r.reviewed_at);
    if (![occurred,retrieved,reviewed].every(Number.isFinite) || occurred>now || retrieved>now || reviewed>now || occurred>retrieved || retrieved>reviewed || now-occurred>365*DAY) { reject('invalid_or_old_date'); continue; }
    if (r.verification!=='reviewed' || !present(r.reviewed_by) || r.is_demo_data===true || r.is_real_data===false || !categories.has(r.category)) { reject('unreviewed_or_invalid'); continue; }
    if (!validPoint([r.lng,r.lat]) || !inside([r.lng,r.lat],source.bounds) || !Number.isFinite(r.precision_meters) || r.precision_meters<=0 || r.precision_meters>5000) { reject('invalid_location'); continue; }
    const key=`${r.source_id}:${r.source_record_id}`;
    if (events.has(r.event_id) || sourceRecords.has(key)) { result.audit.duplicates++; continue; }
    // Keep only the fields needed by the route engine: never publish names, narratives or addresses of victims.
    const record={id:r.event_id,lat:r.lat,lng:r.lng,category:r.category,incident_date:r.incident_date,source:source.name,
      source_url:r.source_url,source_kind:source.kind,precision_meters:r.precision_meters,location_method:r.location_method,
      reviewed_at:r.reviewed_at,retrieved_at:r.retrieved_at};
    const precise=r.precision_meters<=100 && ['verified_coordinate','verified_address'].includes(r.location_method) && r.setting==='public_space';
    // A context-only duplicate must not suppress a later, more precise reviewed location.
    if (!precise) { result.context.push(record); result.audit.context_only++; if(r.setting==='public_space')impreciseSources.add(r.source_id);continue; }
    events.add(r.event_id); sourceRecords.add(key); result.incidents.push(record); result.audit.accepted++;
  }
  result.context=result.context.filter(r=>!events.has(r.id)).filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i);
  for (const a of Array.isArray(input.coverage?.areas)?input.coverage.areas:[]) {
    if (!a || typeof a!=='object') continue;
    const source=sources.get(a.source_id), updated=date(a.updated_at), from=date(a.window_start), to=date(a.window_end);
    if (!source || !['official','partner'].includes(source.kind) || !boundsValid(a.bounds) || !inside(a.bounds.slice(0,2),source.bounds) || !inside(a.bounds.slice(2),source.bounds) || !https(a.method_url) ||
        a.collection!=='complete_geocoded_feed' || a.resolution_meters>100 || !(a.resolution_meters>0) ||
        ![updated,from,to].every(Number.isFinite) || updated>now || to>updated || from>now-365*DAY || from>=to || now-to>30*DAY || now-updated>30*DAY || result.audit.rejected>0 || impreciseSources.has(a.source_id)) continue;
    result.areas.push({source_id:a.source_id,source:source.name,bounds:a.bounds,collection:a.collection,
      resolution_meters:a.resolution_meters,window_start:a.window_start,window_end:a.window_end,
      updated_at:a.updated_at,method_url:a.method_url});
  }
  return result;
}

export function subdivideRoute(route,stepMeters=50) {
  const points=route.geometry;
  if (!Array.isArray(points) || points.length<2 || !points.every(validPoint)) throw Error('Invalid route geometry');
  const geometry=[points[0]], indices=[0];
  for (let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],parts=Math.max(1,Math.ceil(haversine(a[1],a[0],b[1],b[0])*1000/stepMeters));
    if (parts+geometry.length>20000) throw Error('Route is too long for walking analysis');
    for(let j=1;j<=parts;j++) geometry.push(j===parts?b:[a[0]+(b[0]-a[0])*j/parts,a[1]+(b[1]-a[1])*j/parts]);
    indices.push(geometry.length-1);
  }
  return {...route,geometry,steps:(route.steps||[]).map(s=>({...s,way_points:(s.way_points||[]).map(i=>indices[i]??0)}))};
}

export function assessRoute(route, dataset, now=Date.now(), demoRecords=null) {
  const demo=demoRecords!==null,r=subdivideRoute(route,!demo&&dataset.schema_version===4?10:50);
  if(!demo&&dataset.schema_version===4)return assessStreetRoute(r,dataset,now);
  const records=demo?demoRecords:dataset.incidents.filter(r=>now-Date.parse(r.incident_date)<=365*DAY);
  const corridor=.15;
  const risk=scoreRoute(records,r.geometry,corridor,{now});
  const byId=new Map(records.map(x=>[x.id,x]));
  let covered=0,total=0,gap=0,longest=0,offset=0;
  const stretches=[];
  for (const s of risk.segments) {
    const a=r.geometry[s.start_index], b=r.geometry[s.end_index];
    // Coverage must include the entire 150 m corridor, not just the centre line.
    const marginY=corridor/111.195,marginX=marginY/Math.max(.01,Math.cos(a[1]*Math.PI/180));
    const areas=demo?[]:dataset.areas.filter(area=>now-date(area.updated_at)<=30*DAY && now-date(area.window_end)<=30*DAY &&
      [a,b].every(p=>inside([p[0]-marginX,p[1]-marginY],area.bounds)&&inside([p[0]+marginX,p[1]+marginY],area.bounds)));
    const known=demo||areas.length>0;
    s.coverage=known?'AVAILABLE':'UNAVAILABLE';
    s.evidence_count=records.filter(x=>segmentDistanceKm([x.lng,x.lat],a,b)<=corridor+(x.precision_meters||0)/1000).length;
    s.from_meters=Math.round(offset);offset+=s.distance_meters;s.to_meters=Math.round(offset);
    total+=s.distance_meters;
    if (known) { covered+=s.distance_meters;gap=0; } else { gap+=s.distance_meters;longest=Math.max(longest,gap); }
    if(!demo||!known)s.risk_level='UNKNOWN';
    if(!demo)s.score=0;
    const kind=s.evidence_count>0?'REPORTS':known?'NO_REPORTS':'UNKNOWN';
    const previous=stretches.at(-1);
    if (previous?.kind===kind && previous.coverage===s.coverage) {previous.to_meters=s.to_meters;previous.report_count=Math.max(previous.report_count,s.evidence_count);}
    else stretches.push({kind,coverage:s.coverage,from_meters:s.from_meters,to_meters:s.to_meters,report_count:s.evidence_count});
  }
  const coverage=total>0&&covered===total?'AVAILABLE':covered>0?'PARTIAL':'UNAVAILABLE';
  const evidence=risk.supporting_evidence.map(e=>{
    const record=byId.get(e.id)||{},p=record.precision_meters??0,d=e.distance_km*1000;
    return {...e,possible_overlap:d>corridor*1000,source_url:record.source_url??'',source_kind:demo?'fictional':record.source_kind,
      precision_meters:p,distance_min_meters:Math.round(Math.max(0,d-p)),distance_max_meters:Math.round(d+p),
      incident_date:record.incident_date??'',reviewed_at:record.reviewed_at??'',location_method:record.location_method??'fictional'};
  });
  const context=demo?[]:dataset.context.filter(x=>now-Date.parse(x.incident_date)<=365*DAY&&r.geometry.some((p,i)=>i>0&&segmentDistanceKm([x.lng,x.lat],r.geometry[i-1],p)<=x.precision_meters/1000+.15));
  const peak=Math.max(...risk.segments.map(s=>s.score));
  const passport={analysis_step_meters:50,corridor_meters:corridor*1000,coverage_percent:total?(coverage==='AVAILABLE'?100:Math.min(99,Math.floor(covered/total*100))):0,
    longest_unknown_meters:Math.round(longest),peak_exposure:peak,context_report_count:context.length,
    precise_report_count:evidence.length,stretches,sources:demo?[]:dataset.sources,
    coverage_windows:demo?[]:dataset.areas.filter(a=>r.geometry.some(p=>inside(p,a.bounds))).map(a=>({source:a.source,from:a.window_start,to:a.window_end,updated_at:a.updated_at,method_url:a.method_url})),
    limitations:'Missing reports do not establish safety. Reporting gaps, location uncertainty and unreported incidents remain. Nearby reports can be on another street or across a barrier.'};
  return {...r,risk_level:demo&&coverage==='AVAILABLE'?risk.level:'UNKNOWN',risk_score:demo?risk.score:0,incident_count:evidence.length,
    segments:risk.segments,evidence,coverage,evaluated_at:new Date(now).toISOString(),algorithm_version:'evidence-3.0',is_demo_data:demo,
    passport,risk_summary:demo?`${evidence.length} fictional reports. Demo evidence only.`:
      `${evidence.length} reviewed public-space reports overlapping the 150 m corridor. ${passport.coverage_percent}% has documented recent reporting coverage. ${context.length} imprecise area reports excluded from street scoring.`,
    label:'',route_revision:1,decision:demo?null:{basis:'WALKING_TIME',summary:'Walking-time comparison. Nearby reports have not been matched to the same street.',reasons:[]}};
}

export function labelRoutes(routes) {
  const fastest=Math.min(...routes.map(r=>r.duration_seconds));
  const windows=r=>JSON.stringify((r.passport?.coverage_windows||[]).map(w=>`${w.source}:${w.from}:${w.to}`).sort());
  const comparable=routes.every(r=>r.is_demo_data===true&&r.coverage==='AVAILABLE'&&windows(r)===windows(routes[0]));
  routes.sort((a,b)=>comparable?(a.passport.peak_exposure-b.passport.peak_exposure || a.risk_score-b.risk_score || a.duration_seconds-b.duration_seconds):a.duration_seconds-b.duration_seconds);
  routes.forEach((r,i)=>{
    r.extra_minutes=Math.round((r.duration_seconds-fastest)/60);r.label=comparable&&i===0?'Lower reported exposure':r.duration_seconds===fastest?'Fastest walking route':'Alternative walking route';
    if(!r.is_demo_data) {
      r.decision=r.decision||{basis:'WALKING_TIME',reasons:[]};
      r.decision.summary=r.duration_seconds===fastest?'Shortest walking time among the returned options. Safety cannot be ranked from the available evidence.':`${Math.ceil((r.duration_seconds-fastest)/60)} extra minutes. Safety cannot be ranked from the available evidence.`;
      r.decision.reasons=[{kind:'TIME',text:`${Math.ceil(r.duration_seconds/60)} min walking · ${r.distance_meters} m`},
        {kind:'REPORTS',text:r.algorithm_version==='street-evidence-4.0'?`${r.incident_count} reports matched to reviewed street sections. Wider-area reports do not identify this lane.`:`${r.incident_count} nearby reports. Geographic proximity does not establish the same street.`},
        {kind:'GAPS',text:`${r.passport?.coverage_percent||0}% documented reporting coverage. Missing reports do not establish safety.`}];
    }
  });
  return routes;
}
