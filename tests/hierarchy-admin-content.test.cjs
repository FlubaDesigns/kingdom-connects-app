const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const {createPresentationService}=require('../functions/presentation-service');
let env;
before(async()=>{assert(process.env.FIRESTORE_EMULATOR_HOST);env=await initializeTestEnvironment({projectId:'demo-kingdom-admin-content',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{for(const [id,roles,status] of [['admin',['admin'],'active'],['other',['admin'],'active'],['member',['member'],'active'],['blocked',['admin'],'suspended']])await setDoc(doc(c.firestore(),'users',id),{roles,account_status:status});});});
test('manuals publish through canonical content records; private admin preferences and invitation logs stay private',async()=>{
 const admin=env.authenticatedContext('admin').firestore();
 await assertSucceeds(setDoc(doc(admin,'public_manuals/member'),{hero_title:'Verified member manual'}));
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'public_manuals/member'))).data().hero_title,'Verified member manual');
 await assertSucceeds(setDoc(doc(admin,'admin_prefs/admin'),{lastDemoRecipient:{email:'fixture@example.invalid'}}));
 await assertSucceeds(setDoc(doc(admin,'demo_invites/invite'),{sentBy:'admin'}));
 await assertFails(setDoc(doc(admin,'demo_invites/forged'),{sentBy:'member'}));
 await assertFails(deleteDoc(doc(admin,'demo_invites/invite')));
 await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'admin_prefs/admin')));
 for(const db of [env.authenticatedContext('member').firestore(),env.authenticatedContext('blocked').firestore(),env.unauthenticatedContext().firestore()]){
  await assertFails(setDoc(doc(db,'public_manuals/member'),{hero_title:'Wrong'}));
  await assertFails(getDoc(doc(db,'admin_prefs/admin')));
  await assertFails(getDoc(doc(db,'demo_invites/invite')));
  await assertFails(setDoc(doc(db,'demo_invites/other'),{sentBy:'member'}));
 }
});
test('presentation preview, email and attachment consume the same selected template and live settings',async()=>{
 const records={'pricing_settings/default':{monthly_price:12.5,annual_price:0},'commission_policies/default':{salesperson_percentage:0,church_percentage:7},'presentation_templates/chosen':{role:'business_owner',name:'Selected title',email:{subject:'Selected subject',headline:'Selected headline',intro:'Costs {{monthly_price}} and {{annual_price}}',highlights:['{{church_tithe}} <img>'],cta:'Join'},slides:[{type:'content',title:'Saved slide',bullets:['Price {{monthly_price}}']} ]}};
 const service=createPresentationService({doc:path=>({get:async()=>({exists:!!records[path],data:()=>records[path]})})});
 const selected=await service.load('business_owner','chosen');
 assert.equal(selected.email.intro,'Costs $12.50 and $0.00');assert.match(service.renderEmail(selected),/7% &lt;img&gt;/);
 const file=await service.attachment(selected);assert.equal(file.content.slice(0,2).toString(),'PK');
 const zip=await require('../functions/node_modules/jszip').loadAsync(file.content);
 const slide=await zip.file('ppt/slides/slide1.xml').async('string');assert.match(slide,/Saved slide/);assert.match(slide,/\$12.50/);
 await assert.rejects(service.load('church_admin','chosen'),{status:400});await assert.rejects(service.load('business_owner','missing'),{status:404});
 const builtIn=await service.load('sales_agent');assert.match(builtIn.email.subject,/0%/);assert.doesNotMatch(JSON.stringify(builtIn),/\{\{/);
});
