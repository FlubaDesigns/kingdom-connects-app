const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, Timestamp } = require('firebase/firestore');
let env;
const client = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
before(async () => {
  assert(process.env.FIRESTORE_EMULATOR_HOST);
  env = await initializeTestEnvironment({ projectId:'demo-kingdom-church',firestore:{rules:fs.readFileSync('firestore.rules','utf8')} });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db=c.firestore();
    for (const [id,role] of [['pastor','church_admin'],['other','church_admin'],['platform','admin'],['member','member'],['stranger','member']]) await setDoc(doc(db,'users',id),{roles:[role],account_status:'active',home_church_id:'one',church_membership_status:id==='member'?'approved':'pending'});
    for (const [id,owner,status] of [['one','pastor','active'],['two','other','active'],['pending','pastor','pending'],['suspended','pastor','suspended']]) await setDoc(doc(db,'churches',id),{church_name:id,admin_uid:owner,listing_status:status,contact_email:owner+'@example.test'});
    await setDoc(doc(db,'tithes','one'),{church_id:'one',amount_paid:100,tithe_amount:10,created_at:Timestamp.now()});
    await setDoc(doc(db,'tithes','two'),{church_id:'two',amount_paid:200,tithe_amount:20,created_at:Timestamp.now()});
  });
});
test('church profiles permit content/settings but deny financial fields, ownership changes and forged financial creation', async () => {
  const db=client('pastor'),ref=doc(db,'churches/one');
  await assertSucceeds(updateDoc(ref,{description:'Saved',page_settings:{show_email:false},membership_approval_mode:'manual'}));
  for(const values of [{stripe_connect_status:'active'},{stripe_connect_id:'fake'},{total_tithe_received:100},{monthly_commission_total:100},{admin_uid:'other'},{listing_status:'suspended'},{new_server_field:true}]) await assertFails(updateDoc(ref,values));
  const data={church_name:'New church',contact_email:'pastor@example.test',admin_uid:'pastor',listing_status:'pending'};
  await assertSucceeds(setDoc(doc(db,'churches/new'),data));
  await assertFails(setDoc(doc(db,'churches/forged'),{...data,stripe_connect_status:'active'}));
  await assertFails(updateDoc(doc(client('other'),'churches/one'),{description:'Not mine'}));
});
test('public church listing queries exclude pending and suspended churches; owner/admin access remains', async () => {
  await assertSucceeds(getDocs(query(collection(anon(),'churches'),where('listing_status','==','active'))));
  await assertFails(getDocs(collection(anon(),'churches')));
  for(const id of ['pending','suspended']) await assertFails(getDoc(doc(anon(),'churches',id)));
  await assertSucceeds(getDocs(query(collection(client('pastor'),'churches'),where('admin_uid','==','pastor'))));
  await assertSucceeds(getDocs(collection(client('platform'),'churches')));
});
test('new Insights form can read a missing own record then create/save it; cross-church and reassignment denied', async () => {
  const ref=doc(client('pastor'),'church_insights/one');
  assert.equal((await assertSucceeds(getDoc(ref))).exists(),false);
  await assertSucceeds(setDoc(ref,{church_id:'one',answers:{mission:'Welcome'},completed:false}));
  await assertSucceeds(updateDoc(ref,{completed:true}));
  await assertFails(updateDoc(ref,{church_id:'two'}));
  await assertFails(getDoc(doc(client('other'),'church_insights/one')));
  await assertFails(setDoc(doc(client('pastor'),'church_insights/two'),{church_id:'one'}));
});
test('tithes are readable only by the controlling church and platform; church cannot invent ledger entries', async () => {
  const q=query(collection(client('pastor'),'tithes'),where('church_id','==','one'));
  assert.equal((await assertSucceeds(getDocs(q))).size,1);
  await assertFails(getDoc(doc(client('pastor'),'tithes/two')));
  await assertFails(getDocs(collection(client('pastor'),'tithes')));
  await assertFails(getDoc(doc(anon(),'tithes/one')));
  await assertFails(setDoc(doc(client('pastor'),'tithes/new'),{church_id:'one',tithe_amount:100}));
});
test('published content works; drafts and members-only messages are not public; church ownership is immutable', async () => {
  const db=client('pastor');
  await setDoc(doc(db,'churches/one/announcements/draft'),{status:'draft',body:'private'});
  await setDoc(doc(db,'churches/one/announcements/live'),{status:'published',body:'public'});
  await assertFails(getDoc(doc(anon(),'churches/one/announcements/draft')));
  await assertSucceeds(getDocs(query(collection(anon(),'churches/one/announcements'),where('status','==','published'))));
  await setDoc(doc(db,'churches/one/events/live'),{visibility:'visible',title:'Event'});
  await assertSucceeds(getDocs(query(collection(anon(),'churches/one/events'),where('visibility','==','visible'))));
  for(const coll of ['church_messages','church_activities']) {
    await setDoc(doc(db,coll,'private'),{church_id:'one',active:false,audience:'members'});
    await setDoc(doc(db,coll,'public'),{church_id:'one',active:true,audience:'both'});
    await assertFails(updateDoc(doc(db,coll,'public'),{church_id:'two'}));
    await assertFails(getDoc(doc(anon(),coll,'private')));
    const filters=[where('church_id','==','one'),where('active','==',true)];
    if(coll==='church_messages')filters.push(where('audience','in',['both','social']));
    await assertSucceeds(getDocs(query(collection(anon(),coll),...filters)));
  }
  await setDoc(doc(db,'church_messages/members'),{church_id:'one',active:true,audience:'members'});
  await assertFails(getDoc(doc(anon(),'church_messages/members')));
  await assertFails(getDoc(doc(client('stranger'),'church_messages/members')));
  await assertSucceeds(getDoc(doc(client('member'),'church_messages/members')));
});
test('suspension removes public content access and church editing while Dave retains control', async () => {
  await setDoc(doc(client('pastor'),'church_messages/live'),{church_id:'one',active:true,audience:'both'});
  await setDoc(doc(client('pastor'),'churches/one/events/live'),{visibility:'visible'});
  await updateDoc(doc(client('platform'),'churches/one'),{listing_status:'suspended'});
  for(const p of ['churches/one','church_messages/live','churches/one/events/live']) await assertFails(getDoc(doc(anon(),p)));
  await assertFails(updateDoc(doc(client('pastor'),'church_messages/live'),{title:'Blocked'}));
  await assertSucceeds(getDoc(doc(client('platform'),'church_messages/live')));
});
test('one financial summary uses actual tithe amounts and dates and does not equate recorded with paid', () => {
  const source=fs.readFileSync('public/js/services/church-tithes.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const ctx=vm.createContext({Date});vm.runInContext(source,ctx);
  const result=ctx.summarizeChurchTithes([{created_at:'2026-10-10T12:00:00Z',tithe_amount:10,amount_paid:100},{created_at:'2026-09-10T12:00:00Z',tithe_amount:20,payout_status:'paid'},{created_at:'2025-10-10T12:00:00Z',tithe_amount:30}],new Date('2026-10-11T12:00:00Z'));
  assert.equal(result.total,60);assert.equal(result.year,30);assert.equal(result.month,10);assert.equal(result.week,10);assert.equal(result.notPaid,40);
  assert.throws(()=>ctx.summarizeChurchTithes([{created_at:'invalid',tithe_amount:10}]),/date/);
});
test('shared church context honors selected admin church, rejects another owner, and preserves navigation selection', async () => {
  const source=fs.readFileSync('public/js/auth/access-control.js','utf8');
  const body=source.slice(source.indexOf('async function getChurchForUser('),source.indexOf('\nasync function checkIsSalesDirector'));
  let click,chosen;
  const context=vm.createContext({URL,URLSearchParams,db:{},doc:(db,c,id)=>id,getDoc:async id=>({exists:()=>true,id,data:()=>({church_name:id,admin_uid:'pastor'})}),window:{location:{search:'?id=one',href:'https://kingdom-commerce.web.app/church-admin/profile?id=one',origin:'https://kingdom-commerce.web.app'},history:{replaceState:(a,b,url)=>{chosen=url.href;}}},document:{addEventListener:(type,handler)=>{click=handler;}}});
  vm.runInContext(body,context);
  assert.equal((await context.getChurchForUser('platform','',{roles:['admin']})).id,'one');
  assert(chosen.endsWith('?id=one'));
  const link={href:'https://kingdom-commerce.web.app/church-admin/members'};click({target:{closest:()=>link}});assert(link.href.endsWith('?id=one'));
  await assert.rejects(context.getChurchForUser('other','',{roles:['church_admin']}),/authority/);
});
