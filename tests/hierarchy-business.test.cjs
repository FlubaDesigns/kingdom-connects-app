const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,getDocs,collection,query,where,serverTimestamp}=require('firebase/firestore');
let env;
const client=uid=>env.authenticatedContext(uid).firestore();
const anon=()=>env.unauthenticatedContext().firestore();
before(async()=>{
  assert(process.env.FIRESTORE_EMULATOR_HOST,'Business tests require the emulator.');
  env=await initializeTestEnvironment({projectId:'demo-kingdom-business',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();
    for(const [id,role] of [['owner','business_owner'],['other','business_owner'],['pastor','church_admin'],['admin','admin']]) await setDoc(doc(db,'users',id),{roles:[role],account_status:'active'});
    await setDoc(doc(db,'churches/church'),{admin_uid:'pastor',listing_status:'active'});
    for(const [id,owner,pro] of [['one','owner','pro'],['two','other','pro'],['free','owner',null]]) {
      await setDoc(doc(db,'business_listings_public',id),{business_name:id,created_by_uid:owner,church_id:'church',listing_status:'active',is_visible:true,pro_status:pro});
      await setDoc(doc(db,'business_listings_private',id),{owner_uid:owner});
    }
    await setDoc(doc(db,'reviews/approved'),{business_id:'one',user_id:'other',status:'approved',rating:4,review_text:'A useful service'});
    await setDoc(doc(db,'reviews/pending'),{business_id:'one',user_id:'other',status:'pending',rating:3});
  });
});
test('Pro belongs to the business: grant works without a user subscription; paid user cannot edit a free or other listing',async()=>{
  for(const name of ['promotions','products_services','testimonials']) {
    await assertSucceeds(setDoc(doc(client('owner'),`business_listings_public/one/${name}/new`),{name:'Offering',is_active:true}));
    await assertFails(setDoc(doc(client('other'),`business_listings_public/one/${name}/foreign`),{is_active:true}));
  }
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/owner'),{subscription_status:'active'}));
  await assertFails(setDoc(doc(client('owner'),'business_listings_public/free/products_services/new'),{name:'Free listing bypass',is_active:true}));
  await assertFails(updateDoc(doc(client('owner'),'business_listings_public/free'),{pro_status:'pro'}));
});
test('inactive offerings/testimonials are private; only active public queries succeed, and parent suspension blocks publication and edits',async()=>{
  for(const name of ['products_services','testimonials']) {
    const path=`business_listings_public/one/${name}`;
    await setDoc(doc(client('owner'),path,'active'),{is_active:true,name:'Published'});
    await setDoc(doc(client('owner'),path,'draft'),{is_active:false,name:'Private'});
    assert.equal((await assertSucceeds(getDocs(query(collection(anon(),path),where('is_active','==',true))))).size,1);
    await assertFails(getDoc(doc(anon(),path,'draft')));
    await assertFails(getDocs(collection(anon(),path)));
    assert.equal((await assertSucceeds(getDocs(collection(client('owner'),path)))).size,2);
  }
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'churches/church'),{listing_status:'suspended'}));
  await assertFails(getDoc(doc(anon(),'business_listings_public/one/products_services/active')));
  await assertFails(updateDoc(doc(client('owner'),'business_listings_public/one/products_services/active'),{name:'Changed'}));
});
test('owner can read and reply to approved reviews without altering ratings, moderation, identity or another business',async()=>{
  const ref=doc(client('owner'),'reviews/approved');
  assert.equal((await assertSucceeds(getDocs(query(collection(client('owner'),'reviews'),where('business_id','==','one'),where('status','==','approved'))))).size,1);
  await assertSucceeds(updateDoc(ref,{response_text:'Thank you for visiting.',response_date:serverTimestamp()}));
  for(const data of [{rating:5},{status:'pending'},{business_id:'two'},{user_id:'owner'},{response_text:'x'.repeat(501),response_date:serverTimestamp()}]) await assertFails(updateDoc(ref,data));
  await assertFails(updateDoc(doc(client('other'),'reviews/approved'),{response_text:'Not owner',response_date:serverTimestamp()}));
  await assertFails(updateDoc(doc(client('owner'),'reviews/pending'),{response_text:'Not yet moderated',response_date:serverTimestamp()}));
});
test('business Insights supports first read, draft/save and denies cross-business or public access',async()=>{
  const ref=doc(client('owner'),'business_insights/one');
  assert.equal((await assertSucceeds(getDoc(ref))).exists(),false);
  await assertSucceeds(setDoc(ref,{business_id:'one',answers:{q_one:'Yes'},completed:false,created_at:serverTimestamp(),updated_at:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{completed:true,updated_at:serverTimestamp()}));
  await assertFails(updateDoc(ref,{business_id:'two'}));
  await assertFails(getDoc(doc(client('other'),'business_insights/one')));
  await assertFails(getDoc(doc(anon(),'business_insights/one')));
  await assertFails(setDoc(doc(client('owner'),'business_insights/two'),{business_id:'two',answers:{}}));
});
test('private payload cannot shadow canonical business identity, approval or Pro status',()=>{
  const source=fs.readFileSync('public/js/services/business-service.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const context=vm.createContext({}); vm.runInContext(source,context);
  const result=context.mergeBusiness('one',{id:'forged',listing_status:'pending',pro_status:null},{id:'two',listing_status:'active',pro_status:'pro',owner_uid:'owner',allow_store:true});
  assert.equal(result.id,'one');assert.equal(result.listing_status,'pending');assert.equal(result.pro_status,null);assert.equal(result.owner_uid,'owner');assert.equal(result.allow_store,undefined);
});
test('offering renderer and contact settings resist unsafe links, markup and hidden contact exposure',async()=>{
  const source=fs.readFileSync('public/js/business-presentation.js','utf8');
  const {renderOffering,businessContact,safeWebUrl}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  for(const url of ['javascript:alert(1)','data:text/html,bad','https://user:password@example.test']) assert.equal(safeWebUrl(url),'');
  assert.equal(safeWebUrl('example.test/book'),'https://example.test/book');
  const html=renderOffering({name:'<script>bad</script>',description:'<img onerror=bad>',image_url:'javascript:alert(1)',details_url:'javascript:alert(1)'});
  assert(!html.includes('<script>'));assert(!html.includes('src='));assert(html.includes('href="#contactSection"'));
  const hidden=businessContact({show_email:false,show_phone:false,show_website:false,show_address:false,email:'private@example.test',phone_number:'123',website_url:'example.test',city:'Private'});
  assert.deepEqual(hidden,{address:[],phone:'',email:'',website:''});
  assert.deepEqual(businessContact({city:'Albany',state:'NY',zip_code:'12207'}).address,['Albany, NY 12207']);
});
function contextHarness({requested='',admin=false,businesses=[]}={}) {
  const children=[],listeners={},links=[];
  const makeNode=()=>({children:[],classList:{add(){}},append(...values){this.children.push(...values);},textContent:''});
  const main=makeNode();
  const document={getElementById:()=>null,createElement:makeNode,querySelector:()=>main,querySelectorAll:()=>links,addEventListener:(type,fn)=>{listeners[type]=fn;}};
  const window={location:{href:'https://example.test/business-admin/products-services'+(requested?'?id='+requested:''),search:requested?'?id='+requested:'',origin:'https://example.test'},history:{replaceState:(a,b,url)=>{window.selectedUrl=String(url);}}};
  const context=vm.createContext({document,window,URL,URLSearchParams,db:{},getBusinessForUser:async()=>businesses,getAllBusinessesMerged:async()=>businesses,getBusinessById:async id=>businesses.find(b=>b.id===id),doc:(db,c,id)=>id,getDoc:async()=>({data:()=>({listing_status:'active'})})});
  const source=fs.readFileSync('public/js/auth/access-control.js','utf8');
  vm.runInContext(source.slice(source.indexOf('async function selectBusinessContext'),source.indexOf('async function getChurchForUser')),context);
  return {context,window,main,listeners,select:()=>context.selectBusinessContext('owner',admin)};
}
test('multiple businesses require a choice; explicit selection persists through portal links; foreign IDs fail',async()=>{
  const businesses=[{id:'one',business_name:'First',listing_status:'active'},{id:'two',business_name:'Second',listing_status:'active'}];
  const choice=contextHarness({businesses});assert.equal(await choice.select(),null);assert.equal(choice.main.children[0].children.length,3);
  const selected=contextHarness({businesses,requested:'two'});assert.equal((await selected.select())[0].id,'two');
  assert(selected.window.selectedUrl.endsWith('?id=two'));
  const link={href:'https://example.test/business-admin/reviews'};
  selected.listeners.click({target:{closest:()=>link}});assert.equal(link.href,'https://example.test/business-admin/reviews?id=two');
  const foreign=contextHarness({businesses,requested:'three'});await assert.rejects(foreign.select(),/not under your authority/);
  const admin=contextHarness({businesses,requested:'two',admin:true});assert.equal((await admin.select())[0].id,'two');
});
test('review response button executes the actual save handler with selected review and timestamp',async()=>{
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'Thank you!',classList:{add(){},remove(){}},addEventListener:(name,fn)=>{nodes.get(id).listener=fn;}});return nodes.get(id);};
  const writes=[];
  const context=vm.createContext({db:{},document:{getElementById:node},window:{showToast(){}},console,requireAuth(){},doc:(db,c,id)=>c+'/'+id,updateDoc:async(ref,data)=>writes.push({ref,data}),serverTimestamp:()=> 'server-time',query:()=>({}),collection:()=>({}),where:()=>({}),getDocs:async()=>({forEach(){}})});
  vm.runInContext(fs.readFileSync('public/business-admin/js/reviews.js','utf8').replace(/^import .*;\n/gm,''),context);
  const button={dataset:{id:'approved'},disabled:false};
  await node('reviewsList').listener({target:{closest:()=>button}});
  assert.equal(writes.length,1);assert.equal(writes[0].ref,'reviews/approved');assert.equal(writes[0].data.response_text,'Thank you!');assert.equal(writes[0].data.response_date,'server-time');assert.equal(button.disabled,false);
});
test('a paid listing cannot use a cancelled or unrelated subscription to manage Pro content',async()=>{
  await env.withSecurityRulesDisabled(async c=>{
    await updateDoc(doc(c.firestore(),'business_listings_public/one'),{stripe_subscription_id:'sub_one'});
    await updateDoc(doc(c.firestore(),'users/owner'),{stripeSubscriptionId:'sub_one',subscription_status:'cancelled'});
  });
  const ref=doc(client('owner'),'business_listings_public/one/products_services/paid');
  await assertFails(setDoc(ref,{is_active:true,name:'Blocked'}));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/owner'),{stripeSubscriptionId:'sub_other',subscription_status:'active'}));
  await assertFails(setDoc(ref,{is_active:true,name:'Wrong subscription'}));
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/owner'),{stripeSubscriptionId:'sub_one',subscription_status:'trialing'}));
  await assertSucceeds(setDoc(ref,{is_active:true,name:'Matching trial'}));
});
test('legacy server-rendered business pages hydrate the shared layout, keep metadata and avoid duplicate fetches on current pages',async()=>{
  const source=fs.readFileSync('public/js/business.js','utf8');
  const actual=source.slice(source.indexOf('async function ensureStorefrontLayout'),source.indexOf('async function loadChurchInfo'));
  const replacements=[],styles=[];let fetches=0,modern=false;
  const context=vm.createContext({document:{getElementById:id=>id==='storefrontActions'?(modern?{}:null):{replaceWith:node=>replacements.push(node)},querySelector:()=>null,createElement:()=>({}),head:{append:node=>styles.push(node)}},fetch:async url=>{assert.equal(url,'/business.html');fetches++;return {ok:true,text:async()=>fs.readFileSync('public/business.html','utf8')};},DOMParser:class {parseFromString(html){return {getElementById:id=>{assert(html.includes(`id="${id}"`));return {id};}};}}});
  vm.runInContext(actual,context);await context.ensureStorefrontLayout();
  assert.deepEqual(replacements.map(n=>n.id),['businessContent','errorMessage']);assert.equal(styles[0].href,'/styles/components/business-storefront.css?v=1');
  modern=true;await context.ensureStorefrontLayout();assert.equal(fetches,1);
});
