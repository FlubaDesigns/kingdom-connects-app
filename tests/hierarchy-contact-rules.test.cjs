'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc}=require('firebase/firestore');
let env;
before(async()=>{assert(process.env.FIRESTORE_EMULATOR_HOST);env=await initializeTestEnvironment({projectId:'demo-kingdom-contact',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
 await setDoc(doc(c.firestore(),'users/admin'),{roles:['admin'],account_status:'active'});
 await setDoc(doc(c.firestore(),'contact_submissions/test'),{name:'Visitor',status:'new'});
 await setDoc(doc(c.firestore(),'contact_rate_limits/test'),{count:1});
});});
after(async()=>env?.cleanup());
test('direct contact writes and rate-limit access are denied; canonical admin still reads and resolves inbox messages',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('member').firestore(),env.authenticatedContext('admin').firestore()]){
  await assertFails(setDoc(doc(db,'contact_submissions/forged'),{name:'Forged',status:'resolved'}));
  await assertFails(getDoc(doc(db,'contact_rate_limits/test')));
  await assertFails(setDoc(doc(db,'contact_rate_limits/test'),{count:0}));
 }
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'contact_submissions/test')));
 const admin=env.authenticatedContext('admin').firestore();
 await assertSucceeds(getDoc(doc(admin,'contact_submissions/test')));
 await assertSucceeds(updateDoc(doc(admin,'contact_submissions/test'),{status:'resolved',admin_response:'Internal note'}));
});

test('concurrent service calls persist only three messages per email in a real transaction',async()=>{
 const admin=require('../functions/node_modules/firebase-admin');
 const app=admin.initializeApp({projectId:'demo-kingdom-contact'},'contact-race');
 try {
  const db=app.firestore();
  const submit=require('../functions/contact-service').createContactService(db,()=>admin.firestore.FieldValue.serverTimestamp());
  const input={name:'Test Visitor',email:'race@example.invalid',subject:'Race test',message:'Temporary contact test',category:'general',subcategory:'feedback',source:'form',dashboard:null};
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>submit(input,{ip:'192.0.2.'+i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
  const records=await db.collection('contact_submissions').where('email','==',input.email).get();
  assert.equal(records.size,3);
 } finally { await app.delete(); }
});
