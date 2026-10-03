import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
export const {scoreRoute,haversine,segmentDistanceKm,normalizeIncidents,validPoint,VERSION}=require('../../n8n/risk_engine.js');
