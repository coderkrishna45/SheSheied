#!/usr/bin/env python3
"""Small emulator inspection helper. It never clears app data or sends alerts."""
import os,re,subprocess,sys,xml.etree.ElementTree as ET
from pathlib import Path
adb=os.environ.get('SHESHIELD_ADB','/mnt/c/Users/rohit/AppData/Local/Android/Sdk/platform-tools/adb.exe')
device=os.environ.get('SHESHIELD_DEVICE_SERIAL','emulator-5554')
def run(*args): return subprocess.run([adb,'-s',device,*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35).stdout
def nodes():
 result=run('shell','uiautomator','dump','/sdcard/sheshield-ui.xml')
 if b'dumped to' not in result:raise SystemExit('UI hierarchy unavailable. Wake and unlock the device before inspecting it.')
 return list(ET.fromstring(run('shell','cat','/sdcard/sheshield-ui.xml')).iter('node'))
action=sys.argv[1] if len(sys.argv)>1 else 'inspect'
if action=='inspect':
 for n in nodes():
  label=n.get('text') or n.get('content-desc')
  if label: print(re.sub(r'\+\d{8,15}', '[phone hidden]', label.replace('\n',' | ')),n.get('bounds'), 'tap' if n.get('clickable')=='true' else '')
elif action=='tap':
 target=sys.argv[2]; ns=nodes(); matches=[n for n in ns if (n.get('text')==target or n.get('content-desc')==target)]
 if not matches: raise SystemExit('Control not visible: '+target)
 n=matches[-1]; x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));print('Tapped:',target)
elif action=='screen':
 target=Path(sys.argv[2]); target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(run('exec-out','screencap','-p'));print('Screenshot saved:',target)
elif action in ['safe','check']:
 import time
 deadline=time.monotonic()+18
 while time.monotonic()<deadline:
  ns=nodes(); match=next((n for n in ns if n.get('text')=="I'm safe"),None)
  if match is not None:
   screenshot=Path('artifacts/check-in.png');screenshot.parent.mkdir(parents=True,exist_ok=True);screenshot.write_bytes(run('exec-out','screencap','-p'))
   if action=='safe':
    x1,y1,x2,y2=map(int,re.findall(r'\d+',match.get('bounds')));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));print('Timely SAFE action tapped; check-in screenshot saved.')
   else: print('Pending check-in observed; screenshot saved.')
   break
  if any(n.get('text')=='SOS is active' for n in ns):raise SystemExit('Check-in already expired')
 else:raise SystemExit('No check-in appeared within the observation window')
elif action=='connection':
 env=dict(x.split('=',1) for x in Path('api/.env').read_text().splitlines() if x and not x.startswith('#') and '=' in x)
 code=env.get('ENROLLMENT_CODE','');url=(sys.argv[2] if len(sys.argv)>2 else env.get('PUBLIC_BASE_URL')) or 'http://10.0.2.2:8787'
 from urllib.parse import urlsplit
 parsed=urlsplit(url)
 if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:raise SystemExit('Use an HTTP(S) API URL without embedded credentials')
 if not code:raise SystemExit('Enrollment code is missing locally')
 if b'TripTrackingService' in run('shell','dumpsys','activity','services','com.sheshield.app'):raise SystemExit('End the current journey before configuring its connection')
 raw=run('exec-out','run-as','com.sheshield.app','cat','shared_prefs/sheshield_prefs.xml');prefs=ET.fromstring(raw)
 for child in list(prefs):
  if child.get('name') in ['backend_url','enrollment_code','session_token']:prefs.remove(child)
 for key,value in [('backend_url',url),('enrollment_code',code)]:ET.SubElement(prefs,'string',{'name':key}).text=value
 run('shell','am','force-stop','com.sheshield.app')
 subprocess.run([adb,'-s',device,'shell',"run-as com.sheshield.app sh -c 'cat > shared_prefs/sheshield_prefs.xml'"],input=ET.tostring(prefs,encoding='utf-8',xml_declaration=True),stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=35)
 print('Routing API connection configured. Credentials were not printed; contacts and history were preserved.')
elif action=='type':
 fields=[n for n in nodes() if n.get('class','').endswith('EditText')]
 if not fields:raise SystemExit('No text field is visible')
 n=fields[0];x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
 value=sys.argv[2]
 if not re.fullmatch(r'[A-Za-z0-9 .,-]+',value):raise SystemExit('Use a plain place query')
 run('shell','input','text',value.replace(' ','%s'));print('Place search text entered')
elif action=='launch': run('shell','am','start','-n','com.sheshield.app/.ui.MainActivity');print('Launched SheShield')
else: raise SystemExit('Usage: android_ui.py inspect | tap LABEL | screen PATH | launch')
