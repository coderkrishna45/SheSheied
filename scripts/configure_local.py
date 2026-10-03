#!/usr/bin/env python3
"""Copy local credentials to the ignored API environment without printing values."""
import argparse,secrets
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--public-url');args=parser.parse_args()
props={}
source=root/'android/local.properties'
if source.exists():
 for line in source.read_text(encoding='utf-8-sig').splitlines():
  if line.strip() and not line.lstrip().startswith('#') and '=' in line:
   k,v=line.split('=',1);props[k.strip()]=v.strip()
target=root/'api/.env';text=target.read_text() if target.exists() else (root/'api/.env.example').read_text();lines=text.splitlines()
values={x.split('=',1)[0]:x.split('=',1)[1] for x in lines if x and not x.startswith('#') and '=' in x}
updates={k:props[k] for k in ['ORS_API_KEY','TWILIO_AUTH_TOKEN','PINECONE_API_KEY','PINECONE_INDEX_HOST','N8N_API_KEY'] if props.get(k) and not props[k].startswith('your_')}
for key in ['WORKER_TOKEN','ENROLLMENT_CODE']:
 if not values.get(key):updates[key]=secrets.token_hex(32 if key=='WORKER_TOKEN' else 8)
if args.public_url:
 if not args.public_url.startswith('https://'):parser.error('The callback URL must use HTTPS')
 updates['PUBLIC_BASE_URL']=args.public_url.rstrip('/')
for key,value in updates.items():
 lines=[line for line in lines if not line.startswith(key+'=')];lines.append(key+'='+value)
target.write_text('\n'.join(lines)+'\n');target.chmod(0o600)
print('API configuration saved. Secret values were not printed.')
print('Updated fields:',', '.join(updates) or 'none')
