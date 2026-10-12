'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const filename=path.join(__dirname,'../functions/index.js');
function handlers(){
 let providerCalls=0;
 const profiles={member:{roles:['member'],account_status:'active'},admin:{roles:['admin'],account_status:'active'},blocked:{roles:['admin'],account_status:'suspended'}};
 const db={doc:uid=>({get:async()=>({exists:!!profiles[uid.split('/')[1]],data:()=>profiles[uid.split('/')[1]]})})};
 const admin={initializeApp(){},firestore:()=>db,storage:()=>({bucket:()=>({})}),auth:()=>({verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='invalid')throw Error('invalid');return {uid:token}}})};
 const wrappers={onRequest:(...args)=>{const handler=args.at(-1);handler.releaseOptions=args.length>1?args[0]:{};return handler;},onDocumentUpdated:(...args)=>args.at(-1),onDocumentCreated:(...args)=>args.at(-1)};
 const exported={};
 function fakeRequire(name){
  if(name==='firebase-admin')return admin;
  if(name==='./fluba-provider-keys')return {readFlubaProviderKey:async()=>{providerCalls++;throw Error('Provider must not run');}};
  if(name.startsWith('firebase-functions/v2/'))return wrappers;
  if(name==='firebase-functions/params')return {defineSecret:()=>({value(){providerCalls++;throw Error('Provider must not run')}})};
  if(name==='cors')return ()=>((req,res,next)=>next());
  if(name==='resend')return {Resend:class{}};
  if(name==='stripe')return class{};
  if(name==='jsonwebtoken')return {};
  if(['./brain','./ssr','./submissions','./sitemap','./contact-endpoint'].includes(name))return {};
  return require(path.join(__dirname,'../functions',name));
 }
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:fakeRequire,exports:exported,console:{error(){}},process,Buffer,URL,Map,Date},{filename});
 async function call(name,token,body={}){
  return new Promise((resolve,reject)=>{
   const req={method:'POST',headers:token?{authorization:'Bearer '+token}:{},path:'/'+name,body};
   const res={code:200,status(n){this.code=n;return this},json(body){resolve({status:this.code,body})}};
   Promise.resolve(exported[name](req,res)).catch(reject);
  });
 }
 return {call,providerCalls:()=>providerCalls,options:name=>exported[name].releaseOptions};
}
test('HTTP price and template endpoints enforce token, live account, and administrator before provider calls',async()=>{
 const h=handlers();
 for(const name of ['sendTemplate','updateProductPrice']){
  assert.equal((await h.call(name)).status,401);
  assert.equal((await h.call(name,'invalid')).status,401);
  assert.equal((await h.call(name,'member')).status,403);
  assert.equal((await h.call(name,'blocked')).status,403);
  assert.equal((await h.call(name,'missing')).status,403);
  assert.equal((await h.call(name,'admin')).status,400);
 }
 assert.equal(h.providerCalls(),0);
});

test('verification queue explicitly clears its retired email secret binding',()=>{
 assert.deepEqual(Array.from(handlers().options('sendVerificationEmail').secrets),[]);
});
