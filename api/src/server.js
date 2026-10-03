import {buildApp} from './app.js';
const app=buildApp();
try{await app.listen({port:Number(process.env.PORT||8787),host:process.env.HOST||'127.0.0.1'});console.log('Waymate API ready on port '+(process.env.PORT||8787));}
catch(error){console.error('API failed to start: '+error.message);process.exit(1);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
