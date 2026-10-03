// Browser smoke test. Uses an isolated in-memory API and simulated alerts only.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildApp} from '../api/src/app.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let time=Date.now();
const app=buildApp({disableWorker:true,now:()=>time,config:{DATABASE_PATH:':memory:',ENROLLMENT_CODE:'',LIVE_ALERTS_ENABLED:'false',PUBLIC_BASE_URL:'http://127.0.0.1:18787'}});
let browser;
try {
 await app.listen({host:'127.0.0.1',port:18787});
 const token=(await app.inject({method:'POST',url:'/v1/sessions',payload:{}})).json().session_token;
 let command=0;
 async function post(url,payload={}){const response=await app.inject({method:'POST',url,payload,headers:{authorization:'Bearer '+token,'idempotency-key':'browser-'+command++}});assert.equal(response.statusCode,200,response.body);return response.json();}
 const plan=await post('/v1/plans',{mode:'REHEARSAL',recorded_scenario:true});
 const trip=await post('/v1/trips',{plan_id:plan.id,route_id:plan.routes[0].route_id});
 await post(`/v1/trips/${trip.id}/check-ins`,{event_id:'watch-browser',kind:'PERSONAL',window_seconds:120});
 const link=await post(`/v1/trips/${trip.id}/share`);
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(link.url);await page.waitForFunction(()=>document.getElementById('age').textContent.length>0);
 await page.evaluate(()=>document.fonts.ready);
 assert.ok(await page.locator('h1').evaluate(element=>element.getBoundingClientRect().height)>30,'The page needs readable rendered text.');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The companion page must fit a phone screen.');
 assert.match(await page.locator('#age').textContent(),/No position/,await page.locator('#error').textContent());
 assert.equal(await page.locator('#position').getAttribute('visibility'),'hidden');
 await page.getByRole('button',{name:"I'm watching this walk"}).click();
 await page.waitForFunction(()=>document.getElementById('joined').textContent.includes('acknowledged'));
 assert.equal(app.store.get('trip',trip.id).check_in.status,'PENDING');
 const p=trip.route.geometry[0];
 await post(`/v1/trips/${trip.id}/locations`,{latitude:p[1],longitude:p[0],accuracy_meters:15,timestamp_ms:time-90000,sequence:1});
 await page.reload();await page.waitForFunction(()=>document.getElementById('age').textContent.includes('STALE'));
 mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../artifacts/companion-watch.png',import.meta.url).pathname,fullPage:true});
 time+=121000;await app.tick();await page.reload();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('SOS ACTIVE'));
 assert.equal(app.store.list('sos').length,1);assert.equal(await page.locator('#watch').isVisible(),false);
 await post(`/v1/trips/${trip.id}/end`);await page.reload();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('ended'));
 assert.equal(await page.locator('#map').isVisible(),false);assert.equal(await page.locator('#route').getAttribute('points'),'');
 assert.deepEqual(errors,[]);
 console.log('PASS: companion page, acknowledgement, GPS absence/staleness, server timeout, ended-link privacy, and no browser errors. No real alerts sent.');
} finally {if(browser)await browser.close();await app.close();}
