#!/usr/bin/env python3
"""Download bounded OSM extracts and publish only public map facts, without contributor metadata.
No map record is a live observation or an independent safety audit.
"""
import argparse, collections, datetime, hashlib, json, time, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'evidence/saltlake/environment'
BOXES={'sector-v':[88.422,22.575,88.440,22.587], 'sector-ii':[88.410,22.587,88.437,22.607],
 'saltlake-west':[88.390,22.565,88.410,22.597], 'saltlake-north':[88.410,22.607,88.437,22.627],
 'saltlake-south':[88.410,22.552,88.437,22.574], 'saltlake-east':[88.440,22.574,88.460,22.600],
 'saltlake-north-east':[88.437,22.600,88.460,22.627], 'saltlake-north-west':[88.390,22.597,88.410,22.627]}
ROAD_TAGS=['name','highway','lit','sidewalk','sidewalk:left','sidewalk:right','surface','smoothness','foot','access','opening_hours','bridge','tunnel','layer','level','oneway:foot']
PLACE_TAGS=['name','amenity','shop','opening_hours','access','entrance','wheelchair','emergency','healthcare','operator','website']
def fetch(name,bbox,depth=0):
 path=DEST/(name+'.osm.xml')
 if path.exists():return
 url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,bbox))
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SheShield/2.0 (bounded Salt Lake walking-map collection)'}),timeout=30) as r:raw=r.read()
  ET.fromstring(raw);path.write_bytes(raw);print(name+': downloaded',flush=True)
 except urllib.error.HTTPError as e:
  message=e.read(500).decode()
  if e.code==400 and 'too many nodes' in message and depth<3:
   x,y,u,v=bbox
   if u-x>v-y:m=(x+u)/2;children=([x,y,m,v],[m,y,u,v])
   else:m=(y+v)/2;children=([x,y,u,m],[x,m,u,v])
   for i,b in enumerate(children):fetch(name+'-'+str(i),b,depth+1)
  else:print(name+': unavailable ('+str(e.code)+')',flush=True)
 except Exception as e:print(name+': unavailable ('+type(e).__name__+')',flush=True)
 time.sleep(.5)
def compile_data(version=None):
 nodes={};ways={};files=[];bounds=[]
 for path in sorted(DEST.glob('*.osm.xml')):
  raw=path.read_bytes();r=ET.fromstring(raw)
  files.append({'file':path.name,'sha256':hashlib.sha256(raw).hexdigest(),'retrieved_at':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat()})
  b=r.find('bounds')
  if b is not None:bounds.append([float(b.get(k)) for k in ['minlon','minlat','maxlon','maxlat']])
  for n in r.findall('node'):
   nodes[n.get('id')]={'point':[float(n.get('lon')),float(n.get('lat'))],'tags':{t.get('k'):t.get('v') for t in n.findall('tag')},'updated_at':n.get('timestamp')}
  for w in r.findall('way'):ways[w.get('id')]={'refs':[n.get('ref') for n in w.findall('nd')],'tags':{t.get('k'):t.get('v') for t in w.findall('tag')},'updated_at':w.get('timestamp')}
 roads=[];areas=[];places=[]
 for id,w in ways.items():
  if len(w['refs'])<2 or any(ref not in nodes for ref in w['refs']):continue
  geom=[nodes[ref]['point'] for ref in w['refs']];t=w['tags'];url='https://www.openstreetmap.org/way/'+id
  if 'highway' in t and t.get('area')!='yes':roads.append({'id':'way/'+id,'geometry':geom,'node_ids':w['refs'],'tags':{k:t[k] for k in ROAD_TAGS if k in t},'updated_at':w['updated_at'],'source_url':url})
  if w['refs'][0]==w['refs'][-1] and len(geom)>=4 and (t.get('place')=='city_block' or t.get('landuse') or t.get('natural') in ['wood','water','wetland'] or t.get('leisure')=='park'):
   areas.append({'id':'way/'+id,'name':t.get('name','Mapped area'),'geometry':{'type':'Polygon','coordinates':[geom]},'tags':{k:t[k] for k in ['place','landuse','natural','leisure','access'] if k in t},'source_url':url,'updated_at':w['updated_at']})
 # Public-facing facility categories only; no homes, victim locations or private offices.
 def relevant(t):return t.get('amenity') in ['police','hospital','clinic','pharmacy','restaurant','cafe','fast_food','fuel','library','community_centre'] or t.get('shop') in ['convenience','supermarket','chemist']
 for id,n in nodes.items():
  t=n['tags']
  if relevant(t) and t.get('access') not in ['private','no']:
   places.append({'id':'node/'+id,'name':t.get('name',t.get('amenity',t.get('shop'))),'point':n['point'],'tags':{k:t[k] for k in PLACE_TAGS if k in t},'source_url':'https://www.openstreetmap.org/node/'+id,'updated_at':n['updated_at'],'entrance_status':'MAP_POINT_UNCONFIRMED','entrance_node_id':id if t.get('entrance') in ['yes','main'] else None})
 for id,w in ways.items():
  t=w['tags']
  if not relevant(t) or t.get('access') in ['private','no']:continue
  entrances=[dict(nodes[n],node_id=n) for n in w['refs'] if n in nodes and nodes[n]['tags'].get('entrance') in ['main','yes'] and nodes[n]['tags'].get('access') not in ['private','no']]
  if entrances:places.append({'id':'way/'+id,'name':t.get('name',t.get('amenity',t.get('shop'))),'point':entrances[0]['point'],'tags':{k:t[k] for k in PLACE_TAGS if k in t},'source_url':'https://www.openstreetmap.org/way/'+id,'updated_at':w['updated_at'],'entrance_status':'MAPPED_ENTRANCE','entrance_node_id':entrances[0]['node_id']})
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 data={'schema_version':1,'version':version or now[:10]+'.osm.'+now[11:19].replace(':',''),'collected_at':now,'source':'OpenStreetMap contributors','license':'ODbL-1.0','license_url':'https://www.openstreetmap.org/copyright','collection_bounds':bounds,'blocked_node_ids':[id for id,n in nodes.items() if n['tags'].get('access') in ['no','private'] or n['tags'].get('foot')=='no' or n['tags'].get('barrier') in ['wall','fence','gate','lift_gate','turnstile']], 'roads':roads,'places':places,'areas':areas,'limitations':'Community map facts, not live lighting, pedestrian counts, confirmed open businesses, guaranteed assistance or a safety audit. Collection bounds are download extents, not reporting coverage. Last edit is not last survey.'}
 # Association preserves the source's named block; it does not locate the event within it.
 bg=next((a for a in areas if a['name']=='BG Block' and a['tags'].get('place')=='city_block'),None)
 data['report_areas']=[] if bg is None else [{'id':'bg-block-historical-context','area_id':bg['id'],'event_ids':['saltlake-2025-08-22-bg-snatching'],'relation':'NAMED_AREA_CONTEXT','method':'Publisher explicitly names BG Block. OSM supplies a community-mapped block boundary. Exact incident location and boundary accuracy are unverified.','association_source_url':'https://timesofindia.indiatimes.com/city/kolkata/68-year-old-morning-walker-loses-gold-chain-to-snatcher-in-salt-lake/articleshow/123476595.cms'}]
 out=DEST/'walking.v1.json';out.write_text(json.dumps(data,separators=(',',':'))+'\n')
 audit={'version':data['version'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'collected_at':now,'raw_sources':files,'roads':len(roads),'places':len(places),'areas':len(areas),'lighting_tagged_ways':sum('lit' in r['tags'] for r in roads),'sidewalk_tagged_ways':sum(any(k.startswith('sidewalk') for k in r['tags']) for r in roads),'places_with_hours':sum('opening_hours' in p['tags'] for p in places),'independently_validated':False,'complete_saltlake_coverage':False}
 (DEST/'manifest.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps({k:v for k,v in audit.items() if k!='raw_sources'},indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--compile-only',action='store_true');parser.add_argument('--version',help='Unique publication version; defaults to collection UTC date/time');args=parser.parse_args();DEST.mkdir(exist_ok=True)
 if not args.compile_only:
  for name,bbox in BOXES.items():fetch(name,bbox)
 compile_data(args.version)
