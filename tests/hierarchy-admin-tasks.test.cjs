const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,updateDoc,deleteDoc,collection,Timestamp}=require('firebase/firestore');
let env;
const client=uid=>env.authenticatedContext(uid).firestore();
const task=()=>({title:'Verify member delivery',notes:'Confirm arrival in a test inbox.',link:'https://resend.com/domains',priority:'high',status:'open',created_by:'platform',created_at:Timestamp.now(),updated_at:Timestamp.now()});
before(async()=>{
 assert(process.env.FIRESTORE_EMULATOR_HOST,'Emulator required.');
 env=await initializeTestEnvironment({projectId:'demo-kingdom-admin-tasks',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  for(const [uid,role,status]of [['platform','admin','active'],['member','member','active'],['pastor','church_admin','active'],['business','business_owner','active'],['suspended','admin','suspended']])await setDoc(doc(context.firestore(),'users',uid),{roles:[role],account_status:status});
 });
});
test('admin tasks persist edits, completion, archive and reopening',async()=>{
 const ref=doc(client('platform'),'admin_tasks/check');
 await assertSucceeds(setDoc(ref,task()));
 await assertSucceeds(updateDoc(ref,{notes:'Delivery confirmed',status:'done',updated_at:Timestamp.now()}));
 assert.equal((await getDoc(ref)).data().status,'done');
 await assertSucceeds(updateDoc(ref,{status:'archived',updated_at:Timestamp.now()}));
 await assertSucceeds(updateDoc(ref,{status:'open',updated_at:Timestamp.now()}));
 assert.equal((await getDocs(collection(client('platform'),'admin_tasks'))).size,1);
 await assertFails(deleteDoc(ref));
});
test('members, churches, businesses, suspended admins and anonymous visitors cannot read or alter tasks',async()=>{
 await setDoc(doc(client('platform'),'admin_tasks/check'),task());
 for(const db of [client('member'),client('pastor'),client('business'),client('suspended'),env.unauthenticatedContext().firestore()]){
  await assertFails(getDocs(collection(db,'admin_tasks')));
  await assertFails(getDoc(doc(db,'admin_tasks/check')));
  await assertFails(setDoc(doc(db,'admin_tasks/new'),task()));
  await assertFails(updateDoc(doc(db,'admin_tasks/check'),{status:'done'}));
 }
});
test('task schema rejects bad state, extra fields, unsafe links, oversized title and changed provenance',async()=>{
 const ref=doc(client('platform'),'admin_tasks/check');await setDoc(ref,task());
 for(const values of [{status:'approved'},{link:'javascript:alert(1)'},{title:''},{title:'a'.repeat(161)},{extra:true},{created_by:'other'}])await assertFails(updateDoc(ref,values));
});
test('task entry safely normalizes action links and rejects invalid input',()=>{
 const source=fs.readFileSync('public/js/services/admin-tasks.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({URL});vm.runInContext(source,context);
 assert.equal(context.safeTaskLink('javascript:alert(1)'), '');
 assert.equal(context.safeTaskLink('https://user:secret@example.com'), '');
 assert.equal(context.safeTaskLink('/admin/members'),'https://kingdom-commerce.web.app/admin/members');
 assert.throws(()=>context.taskValues({...task(),title:''}),/title/);
 assert.throws(()=>context.taskValues({...task(),link:'http://example.com'}),/HTTPS/);
 assert.equal(context.taskValues({...task(),title:'  Delivery check  '}).title,'Delivery check');
});
