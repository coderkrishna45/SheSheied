import {haversine, validPoint, segmentDistanceKm} from './risk.js';

export const DAY = 86400000;
export const CATEGORIES = ['violent_crime','sexual_assault','robbery','kidnapping','assault','harassment','theft','vandalism','traffic_incident','other'];
const conditionKinds = new Set(['lighting_out','lighting_working','walkway_closed','walkway_open','obstruction','clear_walkway']);
const conditionTTL = {lighting_out:DAY,lighting_working:DAY,walkway_closed:6*3600000,walkway_open:6*3600000,obstruction:DAY,clear_walkway:DAY};
export const utc = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value))return NaN;
  const n=Date.parse(value);
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,19)===value.slice(0,19)?n:NaN;
};
export const https = value => {try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}};
const present = value => typeof value==='string'&&value.trim().length>0;
const boundedText = (value,n=400) => typeof value==='string'?value.trim().slice(0,n):'';
export const validBounds = b => Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&validPoint(b.slice(0,2))&&validPoint(b.slice(2))&&b[0]<b[2]&&b[1]<b[3];
export const inside = (p,b) => p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3];
const lineValid = g => g?.type==='LineString'&&Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.length<=2000&&g.coordinates.every(validPoint)&&g.coordinates.some((p,i,a)=>i>0&&haversine(p[1],p[0],a[i-1][1],a[i-1][0])>0);
const norm = value => String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const array = value => Array.isArray(value)?value:[];

function sectionOnStreet(line,street) {
  let length=0;
  for(let i=1;i<line.length;i++) {
    const a=line[i-1],b=line[i],meters=haversine(a[1],a[0],b[1],b[0])*1000;
    length+=meters;if(length>2000)return false;
    const samples=Math.max(1,Math.ceil(meters/5));
    for(let j=0;j<=samples;j++)if(distanceToLine([a[0]+(b[0]-a[0])*j/samples,a[1]+(b[1]-a[1])*j/samples],street)>25)return false;
  }
  return true;
}

// A date interval expresses source precision. Never turn a day/month into a guessed time.
export function dateInterval(value,now=Date.now()) {
  const start=utc(value?.start),end=utc(value?.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||start>now||!['exact','approximate','day','month','range'].includes(value.precision))return null;
  // Today's calendar day/month may end after retrieval; that is source uncertainty, not a future event.
  if(end>now&&!['day','month'].includes(value.precision))return null;
  if(value.precision==='exact'&&start!==end)return null;
  const normalizedStart=new Date(start).toISOString();
  if(value.precision==='day'&&(end-start!==DAY-1||!normalizedStart.endsWith('T00:00:00.000Z')&&!normalizedStart.endsWith('T18:30:00.000Z')))return null;
  if(value.precision==='month') {
    const offset=normalizedStart.endsWith('T18:30:00.000Z')?330*60000:0,local=new Date(start+offset);
    if(local.getUTCDate()!==1||local.getUTCHours()!==0||local.getUTCMinutes()!==0||local.getUTCSeconds()!==0||local.getUTCMilliseconds()!==0)return null;
    if(end!==Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-offset-1)return null;
  }
  return {start:value.start,end:value.end,precision:value.precision,label:boundedText(value.label,120)};
}

function reviewStatus(reviews,now,requireLocation=false) {
  const valid=(Array.isArray(reviews)?reviews:[]).filter(r=>r&&present(r.reviewer_id)&&Number.isFinite(utc(r.reviewed_at))&&utc(r.reviewed_at)<=now&&r.source_checked===true&&present(r.method)&&
    (!requireLocation||r.location_confirmed===true&&r.barriers_checked===true&&r.decision==='accept'));
  const ids=new Set(valid.map(r=>r.reviewer_id));
  const people=new Set(valid.filter(r=>['human','provider'].includes(r.reviewer_type)).map(r=>r.reviewer_id));
  const disputed=array(reviews).some(r=>r&&['human','provider'].includes(r.reviewer_type)&&r.decision==='reject');
  return {count:ids.size,checked:ids.size>0,independent:people.size>=2&&!disputed,last:valid.map(r=>r.reviewed_at).sort().at(-1)||''};
}

function cleanSource(s) {
  if(!s||!present(s.id)||!present(s.name)||!https(s.url)||!validBounds(s.bounds)||!['official','partner','news'].includes(s.kind)||
    !['public_reference','open_license','permission_granted'].includes(s.reuse?.basis)||!present(s.reuse?.terms)||
    (s.reuse.basis!=='public_reference'&&!https(s.reuse.reference_url)))return null;
  return {id:s.id,name:boundedText(s.name,150),url:s.url,kind:s.kind,bounds:s.bounds,
    reuse:{basis:s.reuse.basis,terms:boundedText(s.reuse.terms,500),reference_url:s.reuse.reference_url||s.url}};
}

function cleanLocation(l,source,scopes,streets) {
  if(!l||!['street_section','possible_sections','named_area','unresolved'].includes(l.kind)||!present(l.reason))return null;
  const scope_ids=(Array.isArray(l.scope_ids)?l.scope_ids:[]).filter(id=>scopes.has(id));
  if(!scope_ids.length)return null;
  const clean={kind:l.kind,scope_ids,label:boundedText(l.label,160),reason:boundedText(l.reason),geometry:null};
  if(l.kind==='street_section') {
    const street=streets.get(l.street_id);
    if(!street||!lineValid(l.geometry)||!l.geometry.coordinates.every(p=>inside(p,source.bounds))||!https(l.reference_url)||
      !Number.isFinite(l.uncertainty_meters)||!(l.uncertainty_meters>0&&l.uncertainty_meters<=25)||l.route_relation!=='same_public_street'||l.side_specific===true||l.level_specific===true)return null;
    // The entire event section must lie on the referenced street, not a station/arrest address.
    if(!sectionOnStreet(l.geometry.coordinates,street.geometry.coordinates))return null;
    Object.assign(clean,{street_id:l.street_id,geometry:l.geometry,uncertainty_meters:l.uncertainty_meters,reference_url:l.reference_url});
  } else if(l.kind==='possible_sections') {
    const candidates=(Array.isArray(l.candidates)?l.candidates:[]).filter(c=>streets.has(c.street_id)&&lineValid(c.geometry)&&c.geometry.coordinates.every(p=>inside(p,source.bounds))&&https(c.reference_url));
    if(!candidates.length)return null;
    // Candidate geometries stay internal. Unresolved alternatives do not produce street pins.
    clean.candidates=candidates.map(c=>({street_id:c.street_id,geometry:c.geometry,reference_url:c.reference_url}));
  }
  return clean;
}

export function auditStreetDataset(input,now=Date.now()) {
  const result={schema_version:4,incidents:[],context:[],observations:[],areas:[],sources:[],scopes:[],streets:[],
    metadata:null,audit:{accepted:0,context_only:0,rejected:0,duplicates:0,observations_accepted:0,observations_rejected:0,reasons:{}}};
  const reject=reason=>{result.audit.rejected++;result.audit.reasons[reason]=(result.audit.reasons[reason]||0)+1;};
  if(input?.schema_version!==4||input.is_real_data!==true||!present(input.dataset_id)||!present(input.version)||!Number.isFinite(utc(input.updated_at))||utc(input.updated_at)>now||!Array.isArray(input.sources)||!Array.isArray(input.incidents)) {
    result.audit.error='A dated version 4 evidence dataset with source references is required.';return result;
  }
  result.metadata={dataset_id:input.dataset_id,version:input.version,updated_at:input.updated_at,collection:boundedText(input.collection,500),
    independently_validated:false,limitations:boundedText(input.limitations,1000)};
  const sources=new Map();
  for(const raw of input.sources){const s=cleanSource(raw);if(s&&!sources.has(s.id)){sources.set(s.id,s);result.sources.push(s);}}
  const scopes=new Map();
  for(const s of array(input.scopes))if(s&&present(s.id)&&present(s.name)&&validBounds(s.search_bounds)&&https(s.reference_url)&&!scopes.has(s.id)) {
    const clean={id:s.id,name:boundedText(s.name,150),search_bounds:s.search_bounds,reference_url:s.reference_url,
      bounds_purpose:'Research search area; not an incident location or reporting coverage.'};scopes.set(s.id,clean);result.scopes.push(clean);
  }
  const streets=new Map();
  for(const s of array(input.streets))if(s&&present(s.id)&&present(s.name)&&lineValid(s.geometry)&&https(s.reference_url)&&!streets.has(s.id)) {
    const clean={id:s.id,name:boundedText(s.name,150),aliases:array(s.aliases).filter(present).slice(0,20),geometry:s.geometry,reference_url:s.reference_url};streets.set(s.id,clean);result.streets.push(clean);
  }
  const groups=new Map();
  const publisherKeys=new Map(),reused=new Set();
  for(const r of input.incidents)if(r&&present(r.source_id)&&present(r.source_record_id)&&present(r.event_id)) {
    const key=r.source_id+':'+r.source_record_id,prior=publisherKeys.get(key);
    if(prior&&prior!==r.event_id)reused.add(key);else publisherKeys.set(key,r.event_id);
  }
  for(const r of input.incidents) {
    const source=sources.get(r?.source_id);
    if(!source||!https(r.source_url)||!present(r.source_record_id)||!present(r.event_id)||r.is_demo_data===true||r.is_real_data===false){reject('missing_provenance');continue;}
    if(reused.has(r.source_id+':'+r.source_record_id)){reject('source_record_reused');continue;}
    const publisher=new URL(source.url).hostname,recordHost=new URL(r.source_url).hostname;
    if(recordHost!==publisher&&!recordHost.endsWith('.'+publisher)){reject('publisher_mismatch');continue;}
    const occurred=dateInterval(r.occurred,now),retrieved=utc(r.retrieved_at),published=utc(r.published_at),reviews=reviewStatus(r.reviews,now);
    if(!occurred||!Number.isFinite(retrieved)||!Number.isFinite(published)||retrieved>now||published>retrieved||utc(occurred.start)>published){reject('invalid_date');continue;}
    if(!reviews.checked||utc(reviews.last)<retrieved||!CATEGORIES.includes(r.category)||!['public_space','transport','private_space','campus','unknown'].includes(r.setting)||
      !['police_record','reported_allegation','community_report'].includes(r.report_status)){reject('unreviewed_or_invalid');continue;}
    const location=cleanLocation(r.location,source,scopes,streets);if(!location){reject('invalid_location');continue;}
    const locationReview=reviewStatus(r.reviews,now,true);
    const rejectedReview=array(r.reviews).some(v=>v&&['human','provider'].includes(v.reviewer_type)&&v.decision==='reject');
    const current=now-utc(occurred.start)<=365*DAY;
    const eligible=location.kind==='street_section'&&locationReview.independent&&!rejectedReview&&r.setting==='public_space'&&current;
    const record={id:r.event_id,category:r.category,setting:r.setting,report_status:r.report_status,occurred,published_at:r.published_at,retrieved_at:r.retrieved_at,
      source:source.name,source_id:source.id,source_url:r.source_url,source_kind:source.kind,source_record_id:r.source_record_id,
      reviewed_at:reviews.last,review_count:locationReview.count,source_review_count:reviews.count,location,eligible,location_reviewed:locationReview.independent&&!rejectedReview,historical:!current,
      summary:boundedText(r.public_summary,240),exclusion_reason:eligible?'':rejectedReview?'A location reviewer rejected this attribution; steward resolution is required.':!current?'Historical report outside the 365-day comparison window.':
        r.setting!=='public_space'?`Reported setting: ${r.setting.replaceAll('_',' ')}; not attributed to a passing pedestrian's street.`:
        location.kind!=='street_section'?'The source does not resolve one public street section.':'Two independent location reviews are still required.',
      references:[{source:source.name,url:r.source_url}]};
    const group=groups.get(record.id)||[];group.push(record);groups.set(record.id,group);
  }
  for(const group of groups.values()) {
    // Conflicting precise locations are quarantined to context, rather than taking the first pin.
    const precise=group.filter(r=>r.eligible),locations=new Set(group.filter(r=>r.location.kind==='street_section').map(r=>JSON.stringify([r.location.street_id,r.location.geometry])));
    const selected=precise[0]||group[0];selected.references=[...new Map(group.flatMap(r=>r.references).map(r=>[r.url,r])).values()];
    if(locations.size>1){selected.eligible=false;selected.location={...selected.location,kind:'possible_sections',geometry:null};selected.exclusion_reason='Source records disagree about the street section.';}
    result.audit.duplicates+=group.length-1;
    if(selected.eligible){result.incidents.push(selected);result.audit.accepted++;}else{result.context.push(selected);result.audit.context_only++;}
  }
  const recordKeys=new Set();
  for(const record of [...result.incidents,...result.context]) {
    const key=`${record.source_id}:${record.source_record_id}`;
    if(recordKeys.has(key)){reject('source_record_reused');result.incidents=result.incidents.filter(r=>r!==record);result.context=result.context.filter(r=>r!==record);}else recordKeys.add(key);
  }
  result.audit.accepted=result.incidents.length;result.audit.context_only=result.context.length;
  // Conditions require actual independently reviewed observations; a map or article isn't a field audit.
  const observationIds=new Set();
  for(const r of array(input.observations)) {
    const source=sources.get(r?.source_id),observed=utc(r?.observed_at),expires=utc(r?.expires_at),review=reviewStatus(r?.reviews,now,true);
    const location=source?cleanLocation(r.location,source,scopes,streets):null;
    if(!source||source.kind==='news'||source.reuse.basis==='public_reference'||!present(r.id)||observationIds.has(r.id)||!conditionKinds.has(r.kind)||!location||location.kind!=='street_section'||!review.independent||!https(r.evidence_url)||
      !Number.isFinite(observed)||observed>now||expires<=observed||!Number.isFinite(expires)||expires-observed>conditionTTL[r.kind]||utc(review.last)<observed||
      !['daylight','after_dark','any'].includes(r.time_of_day)||r.measurement!=='direct_observation'){result.audit.observations_rejected++;continue;}
    observationIds.add(r.id);result.observations.push({id:r.id,kind:r.kind,source:source.name,source_id:r.source_id,source_url:r.evidence_url,
      observed_at:r.observed_at,expires_at:r.expires_at,time_of_day:r.time_of_day,location,reviewed_at:review.last,review_count:review.count});result.audit.observations_accepted++;
  }
  // Feed coverage is a separately audited contract, never inferred from curated news or audit points.
  for(const a of array(input.coverage?.areas)) {
    if(!a)continue;
    const source=sources.get(a.source_id),from=utc(a.window_start),to=utc(a.window_end),updated=utc(a.updated_at),review=reviewStatus(a.reviews,now);
    if(!source||source.kind==='news'||source.reuse.basis==='public_reference'||!validBounds(a.bounds)||!inside(a.bounds.slice(0,2),source.bounds)||!inside(a.bounds.slice(2),source.bounds)||
      a.collection!=='complete_geocoded_feed'||!https(a.method_url)||!review.independent||!Array.isArray(a.categories)||!CATEGORIES.every(c=>a.categories.includes(c))||
      !Array.isArray(a.settings)||!a.settings.includes('public_space')||!Number.isInteger(a.total_records)||!Number.isInteger(a.geocoded_records)||a.total_records<0||a.total_records!==a.geocoded_records||
      !Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(updated)||from>now-365*DAY||from>=to||to>updated||updated>now||now-to>30*DAY||now-updated>30*DAY||
      result.audit.rejected>0||result.context.some(r=>r.source_id===source.id&&!r.historical&&r.setting==='public_space'))continue;
    const supplied=[...result.incidents,...result.context].filter(r=>r.source_id===source.id&&r.setting==='public_space'&&r.location_reviewed&&r.location.kind==='street_section'&&
      utc(r.occurred.start)>=from&&utc(r.occurred.end)<=to&&r.location.geometry.coordinates.every(p=>inside(p,a.bounds)));
    if(supplied.length!==a.total_records)continue;
    result.areas.push({source_id:a.source_id,source:source.name,bounds:a.bounds,collection:a.collection,window_start:a.window_start,window_end:a.window_end,updated_at:a.updated_at,method_url:a.method_url,categories:[...a.categories],settings:[...a.settings]});
  }
  return result;
}

export function distanceToLine(p,line) {
  let min=Infinity;for(let i=1;i<line.length;i++)min=Math.min(min,segmentDistanceKm(p,line[i-1],line[i])*1000);return min;
}

function direction(a,b,latitude) {
  const x=(b[0]-a[0])*Math.cos(latitude*Math.PI/180),y=b[1]-a[1],length=Math.hypot(x,y);
  return length?[x/length,y/length]:[0,0];
}

// Name, alignment and geometry must agree. Proximity alone never establishes same-street attribution.
export function matchesStreet(a,b,location,street,names) {
  if(!street||!names.some(n=>[street.name,...street.aliases].some(alias=>norm(n)===norm(alias))))return false;
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],dir=direction(a,b,mid[1]);
  const line=location.geometry.coordinates;
  for(let i=1;i<line.length;i++) {
    const c=line[i-1],d=line[i],other=direction(c,d,mid[1]);
    if(Math.abs(dir[0]*other[0]+dir[1]*other[1])<.9)continue;
    // Require the entire route piece within the small section buffer. Junction crossings are excluded.
    if([a,mid,b].every(p=>segmentDistanceKm(p,c,d)*1000<=15))return true;
  }
  return false;
}

export function scopeIntersectsRoute(scope,geometry) {
  const b=scope.search_bounds;
  // Slab intersection catches a route crossing a search box even if both endpoints lie outside.
  for(let i=1;i<geometry.length;i++) {
    const a=geometry[i-1],d=[geometry[i][0]-a[0],geometry[i][1]-a[1]];let lo=0,hi=1;
    for(let axis=0;axis<2;axis++) {
      if(d[axis]===0){if(a[axis]<b[axis]||a[axis]>b[axis+2]){lo=1;hi=0;break;}}
      else {const x=(b[axis]-a[axis])/d[axis],y=(b[axis+2]-a[axis])/d[axis];lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));}
    }
    if(lo<=hi)return true;
  }
  return false;
}

function scopeDistance(scope,geometry){
  if(scopeIntersectsRoute(scope,geometry))return 0;
  const [w,s,e,n]=scope.search_bounds,box=[[w,s],[e,s],[e,n],[w,n],[w,s]];
  return Math.min(...box.map(p=>distanceToLine(p,geometry)),...geometry.map(p=>distanceToLine(p,box)));
}

export function selectInsightContext(records,scopes,geometry,now){
  const distances=new Map(scopes.map(s=>[s.id,scopeDistance(s,geometry)]));
  const candidates=records.filter(r=>r.setting==='public_space'&&r.category!=='traffic_incident'&&now-utc(r.occurred.start)<=365*DAY)
    .map(r=>({record:r,distance:Math.min(...r.location.scope_ids.map(id=>distances.get(id)??Infinity))}));
  const local=candidates.filter(r=>r.distance===0);
  const selected=(local.length?local:candidates.filter(r=>r.distance<=2000)).sort((a,b)=>a.distance-b.distance||utc(b.record.occurred.start)-utc(a.record.occurred.start));
  const unique=[...new Map(selected.map(r=>[r.record.id,r.record])).values()];
  const basis=local.length?'LOCAL_AREA':unique.length?'EXPANDED_AREA':'NONE';
  return {records:unique.slice(0,5),selection:{basis,radius_meters:basis==='EXPANDED_AREA'?2000:null,total_relevant:unique.length,
    notice:basis==='EXPANDED_AREA'?'Expanded to research areas within 2 km of your route. These are broader-area references; exact incident streets remain unconfirmed.':basis==='LOCAL_AREA'?'Reports refer to areas your route passes through. Exact incident street sections remain unconfirmed.':'No relevant recent pedestrian reports were found within the supplied research areas or a 2 km expansion. Missing reports never establish safety.'}};
}

export function assessStreetRoute(route,dataset,now) {
  const scopeIds=new Set(dataset.scopes.filter(s=>scopeIntersectsRoute(s,route.geometry)).map(s=>s.id));
  const relevant=r=>r.location.scope_ids.some(id=>scopeIds.has(id));
  const streets=new Map(dataset.streets.map(s=>[s.id,s])),evidence=new Map(),observations=new Map();
  const records=dataset.incidents.filter(r=>now-utc(r.occurred.start)<=365*DAY);
  let total=0,covered=0,offset=0,gap=0,longest=0,audited=0;
  const stretches=[],segments=[];
  for(let i=1;i<route.geometry.length;i++) {
    const a=route.geometry[i-1],b=route.geometry[i],distance=haversine(a[1],a[0],b[1],b[0])*1000;
    const names=(route.steps||[]).filter(s=>s.way_points?.[0]<=i-1&&s.way_points?.at(-1)>=i).map(s=>s.name||'');
    const matching=records.filter(r=>matchesStreet(a,b,r.location,streets.get(r.location.street_id),names));
    const conditions=dataset.observations.filter(r=>utc(r.expires_at)>now&&r.time_of_day==='any'&&matchesStreet(a,b,r.location,streets.get(r.location.street_id),names));
    // Time-specific observations remain visible but cannot establish current route-wide coverage without a time model.
    const timed=dataset.observations.filter(r=>utc(r.expires_at)>now&&r.time_of_day!=='any'&&matchesStreet(a,b,r.location,streets.get(r.location.street_id),names));
    const marginY=.15/111.195,marginX=marginY/Math.max(.01,Math.cos(a[1]*Math.PI/180));
    const available=dataset.areas.filter(area=>utc(area.window_start)<=now-365*DAY&&now-utc(area.updated_at)<=30*DAY&&now-utc(area.window_end)<=30*DAY&&[a,b].every(p=>inside([p[0]-marginX,p[1]-marginY],area.bounds)&&inside([p[0]+marginX,p[1]+marginY],area.bounds)));
    matching.forEach(r=>evidence.set(r.id,r));[...conditions,...timed].forEach(r=>observations.set(r.id,r));
    const kinds=new Set(conditions.map(r=>r.kind));
    const conflict=[['lighting_out','lighting_working'],['walkway_closed','walkway_open'],['obstruction','clear_walkway']].some(pair=>pair.every(k=>kinds.has(k)));
    const dimensions=new Set(conflict?[]:conditions.map(r=>r.kind.startsWith('lighting_')?'lighting':'walkway'));
    if(dimensions.has('lighting')&&dimensions.has('walkway'))audited+=distance;
    const start=Math.round(offset);offset+=distance;total+=distance;
    if(available.length){covered+=distance;gap=0;}else{gap+=distance;longest=Math.max(longest,gap);}
    const segment={segment_id:`seg-${i-1}`,start_index:i-1,end_index:i,score:0,risk_level:'UNKNOWN',distance_meters:Math.round(distance),
      coverage:available.length?'AVAILABLE':'UNAVAILABLE',evidence_count:matching.length,observation_count:conditions.length+timed.length,observation_conflict:conflict,from_meters:start,to_meters:Math.round(offset)};
    segments.push(segment);
    const ids=matching.map(r=>r.id).sort(),kind=ids.length?'REPORTS':available.length?'NO_REPORTS':'UNKNOWN',previous=stretches.at(-1);
    if(previous&&previous.kind===kind&&previous.coverage===segment.coverage&&JSON.stringify(previous.event_ids)===JSON.stringify(ids))previous.to_meters=segment.to_meters;
    else stretches.push({kind,coverage:segment.coverage,from_meters:start,to_meters:segment.to_meters,report_count:ids.length,event_ids:ids});
  }
  const context=[...dataset.context.filter(relevant),...dataset.incidents.filter(r=>relevant(r)&&!evidence.has(r.id)).map(r=>({...r,exclusion_reason:now-utc(r.occurred.start)>365*DAY?'Historical report outside the comparison window.':'A reviewed section exists, but this route could not be matched to it by street name and geometry.'}))];
  const publicRecord=r=>({id:r.id,category:r.category,source:r.source,source_url:r.source_url,source_kind:r.source_kind,report_status:r.report_status,setting:r.setting,
    occurred:r.occurred,incident_date:r.occurred.start,days_old:Math.max(0,Math.floor((now-Math.min(utc(r.occurred.end),utc(r.published_at)))/DAY)),historical:now-utc(r.occurred.start)>365*DAY,
    location_kind:r.location.kind,location_label:r.location.label,location_reason:r.location.reason,summary:r.summary,
    exclusion_reason:r.exclusion_reason,reviewed_at:r.reviewed_at,review_count:r.review_count,source_review_count:r.source_review_count,references:r.references,
    // No distance-to-a-fabricated-centroid; no victim narratives, names or home addresses.
    distance_km:0,precision_meters:r.location.uncertainty_meters||0,relation:evidence.has(r.id)?'MATCHED_STREET':'AREA_CONTEXT'});
  const coverage=total>0&&covered>=total-.01?'AVAILABLE':covered>0?'PARTIAL':'UNAVAILABLE';
  const observationList=[...observations.values()].map(o=>({id:o.id,kind:o.kind,source:o.source,source_url:o.source_url,observed_at:o.observed_at,expires_at:o.expires_at,time_of_day:o.time_of_day,location_label:o.location.label,review_count:o.review_count}));
  const insights=selectInsightContext([...dataset.context,...dataset.incidents.filter(r=>!evidence.has(r.id))],dataset.scopes,route.geometry,now);
  return {...route,risk_level:'UNKNOWN',risk_score:0,incident_count:evidence.size,segments,evidence:[...evidence.values()].map(publicRecord),context_evidence:context.map(publicRecord),observations:observationList,
    insight_context:insights.records.map(publicRecord),context_selection:insights.selection,
    coverage,evaluated_at:new Date(now).toISOString(),algorithm_version:'street-evidence-4.0',is_demo_data:false,route_revision:1,label:'',
    passport:{analysis_step_meters:10,corridor_meters:0,coverage_percent:total?Math.floor(covered/total*100):0,longest_unknown_meters:Math.round(longest),peak_exposure:0,
      context_report_count:context.length,precise_report_count:evidence.size,stretches,sources:dataset.sources,
      observation_coverage_percent:total?Math.floor(audited/total*100):0,dataset_version:dataset.metadata?.version||'UNAVAILABLE',dataset_updated_at:dataset.metadata?.updated_at||null,
      dataset_collection:dataset.metadata?.collection||'Dataset unavailable.',coverage_windows:dataset.areas.filter(a=>scopeIntersectsRoute({search_bounds:a.bounds},route.geometry)).map(a=>({source:a.source,from:a.window_start,to:a.window_end,updated_at:a.updated_at,method_url:a.method_url})),
      limitations:dataset.metadata?.limitations||'Reporting is incomplete. Source review does not establish occurrence or safety. Search areas do not locate an incident.'},
    risk_summary:`${evidence.size} independently reviewed reports matched to this street geometry. ${context.length} wider-area or historical reports are shown separately. Safety is unknown.`,
    decision:{basis:'WALKING_TIME',summary:'Walking-time comparison. Available reports do not establish which route is safer.',reasons:[]}};
}
