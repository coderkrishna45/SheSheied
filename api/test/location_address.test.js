import test from 'node:test';
import assert from 'node:assert/strict';
import {locationAddressResolver} from '../src/location_address.js';
test('reverse lookup validates proximity, uses a bounded request and caches readable addresses',async()=>{
 let calls=0;const resolve=locationAddressResolver('key',async(url,options,timeout,policy)=>{calls++;assert.equal(timeout,3000);assert.deepEqual(policy,{singleAttempt:true});return {features:[{geometry:{coordinates:[88.351,22.558]},properties:{label:'Indian Museum, Kolkata'}}]};});
 const location={latitude:22.558,longitude:88.351};assert.equal(await resolve(location),'Indian Museum, Kolkata');assert.equal(await resolve(location),'Indian Museum, Kolkata');assert.equal(calls,1);
});
test('distant reverse matches, invalid data and provider outages never become invented addresses',async()=>{
 for(const body of [{features:[{geometry:{coordinates:[77,28]},properties:{label:'Delhi'}}]},{features:[]},{features:[{geometry:{coordinates:[88.351,22.558]},properties:{label:'22.558,88.351'}}]}])assert.equal(await locationAddressResolver('key',async()=>body)({latitude:22.558,longitude:88.351}),null);
 assert.equal(await locationAddressResolver('key',async()=>{throw Error('offline');})({latitude:22.558,longitude:88.351}),null);
});
