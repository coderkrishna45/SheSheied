#!/usr/bin/env python3
"""A city-wide public-facility extract. Map centres are never claimed as verified entrances."""
import datetime,hashlib,json,urllib.parse,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
rawpath=root/'.tools/osm/kolkata-facilities.json';rawpath.parent.mkdir(parents=True,exist_ok=True)
query='[out:json][timeout:55];nwr[amenity~"^(police|hospital)$"](22.35,88.15,22.80,88.60);out meta center;'
if not rawpath.exists():
 req=urllib.request.Request('https://overpass-api.de/api/interpreter',data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'SheShield/2.0 (public Kolkata facility map)'})
 with urllib.request.urlopen(req,timeout=60) as response:rawpath.write_bytes(response.read())
raw=json.loads(rawpath.read_text());data=json.loads((root/'evidence/saltlake/environment/walking.v1.json').read_text());known={p['id'] for p in data['places']};added=0
for element in raw.get('elements',[]):
 kind=element['type'];identifier=kind+'/'+str(element['id']);tags=element.get('tags',{});point=element.get('center',element)
 if kind not in ['node','way'] or identifier in known or tags.get('access') in ['no','private'] or not all(k in point for k in ['lat','lon']):continue
 if tags.get('amenity') not in ['police','hospital']:continue
 data['places'].append({'id':identifier,'name':tags.get('name:en') or tags.get('name') or ('Police station' if tags['amenity']=='police' else 'Hospital'),'point':[point['lon'],point['lat']],
  'tags':{k:tags[k] for k in ['amenity','name','opening_hours','access','emergency','healthcare','website'] if k in tags},'updated_at':element.get('timestamp'),
  'source_url':'https://www.openstreetmap.org/'+identifier,'entrance_status':'MAP_POINT_UNCONFIRMED','entrance_node_id':None,'location_basis':'OSM_NODE' if kind=='node' else 'OSM_BUILDING_CENTRE'})
 known.add(identifier);added+=1
now=datetime.datetime.now(datetime.timezone.utc).isoformat();data['version']=now[:10]+'.kolkata-facilities.'+now[11:19].replace(':','')
# The facility refresh does not reset the age of the existing walking-street survey.
# Keep the original collected_at for walking facts; facilities have their own collection timestamp.
data['facility_collected_at']=now;data['facility_bounds']=[88.15,22.35,88.60,22.80]
data['limitations']+=' City-wide facility map points/building centres are unverified entrances. The street-condition extract remains limited to Salt Lake.'
out=root/'evidence/kolkata/environment';out.mkdir(parents=True,exist_ok=True)
path=out/'walking.v1.json';path.write_text(json.dumps(data,separators=(',',':'))+'\n')
manifest={'version':data['version'],'facility_collected_at':now,'raw_sha256':hashlib.sha256(rawpath.read_bytes()).hexdigest(),'source':'https://overpass-api.de/api/interpreter','query':query,'added_places':added,'police':sum(p['tags'].get('amenity')=='police' for p in data['places']),'hospitals':sum(p['tags'].get('amenity')=='hospital' for p in data['places']),'roads':len(data['roads']),'independently_validated':False}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest))
