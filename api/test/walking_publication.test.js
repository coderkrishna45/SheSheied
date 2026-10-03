import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {publishWalking} from '../../scripts/publish_walking_data.mjs';
test('map snapshots preserve source bytes and hashes, refuse replacement and reject invalid records',()=>{
 const root=mkdtempSync(join(tmpdir(),'sheshield-map-'));try{
  const source=new URL('../../evidence/saltlake/environment/walking.v1.json',import.meta.url),bytes=readFileSync(source),at=Date.parse(JSON.parse(bytes).collected_at)+1000;
  const published=publishWalking(source,join(root,'published'),at);assert.equal(published.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(readFileSync(published.dataset_path),bytes);assert.equal(published.independently_validated,false);
  assert.throws(()=>publishWalking(source,join(root,'published'),at),/already published/);
  const invalid=JSON.parse(bytes);invalid.roads[0].source_url='https://unrelated.example/';const input=join(root,'invalid.json');writeFileSync(input,JSON.stringify(invalid));assert.throws(()=>publishWalking(input,join(root,'published'),at),/Publication refused/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
