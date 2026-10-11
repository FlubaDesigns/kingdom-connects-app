const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=file=>fs.readFileSync(file,'utf8').replace(/^\s*import .*;\n/gm,'').replace(/export /g,'');
function page(file, overrides={}) {
 const nodes=new Map(), notices=[], writes=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,handlers:{},
  classList:{add(){},remove(){},toggle(){}},addEventListener(event,fn){this.handlers[event]=fn;},querySelector(){return el(id+'-child');},appendChild(){}});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>el('new')},
  window:{showToast:(...v)=>notices.push(v),showConfirmDialog:async()=>true,addEventListener(){}},console:{error(){},warn(){}},
  db:{},requireAdmin(){},doc:(db,...parts)=>parts.join('/'),collection:(db,path)=>path,query:q=>q,where(){},orderBy(){},
  getDocs:async()=>({docs:[],empty:true}),getDoc:async()=>({data:()=>({}),exists:()=>true}),
  changeHierarchy:async(...v)=>writes.push(v),normalizeUserRoles:user=>user.roles||['member'],
  mergeBusiness:(id,pub,priv)=>({...priv,...pub,id}),escapeHtml:value=>String(value??'').replace(/</g,'&lt;'),
  serverTimestamp:()=> 'server',setTimeout(){},clearTimeout(){},...overrides});
 vm.runInContext(source(file).replace(/^await adminReady;\n/gm,''),context);
 return {context,el,notices,writes,run:code=>vm.runInContext(code,context)};
}
const snap=records=>({docs:records.map(([id,data])=>({id,data:()=>data})),empty:!records.length});

test('pending management uses canonical lifecycle, includes undated members, and removes reviewed submissions',async()=>{
 const p=page('public/admin/js/management.js',{getDocs:async path=>snap(path==='users'?[['legacy',{name:'Legacy',account_status:'pending'}]]:path==='churches'?[['church',{church_name:'Pending church',listing_status:'pending'}]]:[['business',{business_name:'Pending business',listing_status:'pending'}],['waiting',{platform_approved:true,listing_status:'pending'}],['rejected',{platform_review_status:'rejected',listing_status:'pending'}]])});
 p.el('filterStatus').value='pending';await p.run('loadAllData()');
 assert.equal(p.el('pendingSubmissions').textContent,3);
 assert.match(p.el('resultsList').innerHTML,/Pending business/);assert.match(p.el('resultsList').innerHTML,/Legacy/);
 p.el('filterRole').value='church_admin';p.run('renderResults()');assert.match(p.el('resultsList').innerHTML,/Pending church/);assert.doesNotMatch(p.el('resultsList').innerHTML,/Pending business/);
});
test('failed account deletion never reports success or independently deletes the profile',async()=>{
 const p=page('public/admin/js/management.js',{changeHierarchy:async()=>{throw Error('Transfer ownership first');}});
 p.run("allUsers=[{id:'target',email:'test@example.invalid'}]");await p.run("deleteUser('target')");
 assert.equal(p.notices.length,1);assert.equal(p.notices[0][1],'error');assert.match(p.notices[0][0],/Transfer ownership/);
});
test('review moderation includes canonical member reviews and clears the last deleted row',async()=>{
 let records=[['review',{rating:4,review_text:'Real member review',created_at:{toDate:()=>new Date('2026-01-01')}}]];
 const p=page('public/admin/js/review-moderation.js',{getDocs:async()=>snap(records)});
 await p.run('loadReviews()');assert.equal(p.el('totalReviews').textContent,1);
 assert.equal(p.run('allReviews[0].rating'),4);assert.equal(p.run('allReviews[0].submitted_at.toDate().getFullYear()'),2026);
 records=[];await p.run('loadReviews()');assert.equal(p.el('totalReviews').textContent,0);assert.match(p.el('reviewsList').innerHTML,/No reviews/);
});
test('questionnaires normalize legacy aliases once and separate inactive/business/church audiences',async()=>{
 const context=vm.createContext({db:{},collection:()=>'',getDocs:async()=>snap([['old',{is_required:true,question_type:'multiple_choice',order_index:2}],['new',{audience:'business',active:false,question_type:'text',order:1}],['active',{audience:'business',active:true,question_type:'text',order:3}]])});
 vm.runInContext(source('public/js/services/questionnaire-service.js'),context);
 const church=await context.loadQuestionnaireQuestions({audience:'church',activeOnly:true});assert.equal(church.length,1);assert.equal(church[0].question_type,'select');assert.equal(church[0].required,true);
 const business=await context.loadQuestionnaireQuestions({audience:'business',activeOnly:true});assert.equal(business.length,1);assert.equal(business[0].id,'active');
});
test('dashboard and payments share ledger totals, canonical status overrides legacy flags',()=>{
 const context=vm.createContext({});vm.runInContext(source('public/js/services/commission-ledger.js'),context);
 const entries=[{recipient_type:'platform',amount:'5'},{recipient_type:'salesperson',amount:2},{recipient_type:'church',recipient_id:'church',amount:1},{recipient_type:'charitable_fund',amount:3}].map((data,i)=>context.normalizeLedgerEntry(String(i),data));
 assert.equal(JSON.stringify(context.ledgerTotals(entries)),JSON.stringify({platform:5,commissions:2,church:4,charitable:3}));
 assert.equal(context.normalizeLedgerEntry('id',{status:'pending',commission_paid:true}).status,'pending');
});
test('unresolved admin authorization prevents settings initialization',async()=>{
 let accessed=false;
 const context=vm.createContext({adminReady:new Promise(()=>{}),document:{getElementById(){accessed=true;throw Error('too early');}}});
 vm.runInContext('(async()=>{'+source('public/admin/js/pricing-settings.js')+'})()',context);
 await Promise.resolve();assert.equal(accessed,false);
});
test('commission settings preserve zero bonuses and reject invalid thresholds or splits',async()=>{
 const saved=[];
 const p=page('public/admin/js/commission-settings.js',{setDoc:async(ref,data)=>saved.push(data)});
 await p.run('loadSettings()');
 for(const id of ['churchPercent','salespersonPercent','directorPercent','originationFee','agentTier1Bonus','agentTier2Bonus','agentTier3Bonus','directorTier1Bonus','directorTier2Bonus','directorTier3Bonus'])p.el(id).value='0';
 for(const group of ['agent','director'])for(let tier=1;tier<=3;tier++)p.el(group+'Tier'+tier+'Threshold').value=String(tier);
 await p.el('saveSettingsBtn').handlers.click();assert.equal(saved.length,1);assert.equal(saved[0].origination_fee,0);assert.equal(saved[0].agent_tier3_bonus,0);assert.equal(saved[0].kingdom_connect_percentage,100);
 p.el('churchPercent').value='101';await p.el('saveSettingsBtn').handlers.click();assert.equal(saved.length,1);
 p.el('churchPercent').value='0';p.el('agentTier2Threshold').value='1';await p.el('saveSettingsBtn').handlers.click();assert.equal(saved.length,1);
});
test('pricing settings persist zero-day trials with actor identity and reject fractional days',async()=>{
 const saved=[];
 const p=page('public/admin/js/pricing-settings.js',{adminReady:Promise.resolve({user:{uid:'admin'}}),setDoc:async(ref,data)=>saved.push(data)});
 await p.run('loadPricingSettings()');p.el('monthlyPrice').value='8.99';p.el('annualPrice').value='74.99';p.el('freeTrialDays').value='0';
 await p.el('savePricingBtn').handlers.click();assert.equal(saved[0].free_trial_days,0);assert.equal(saved[0].updated_by,'admin');
 p.el('freeTrialDays').value='1.5';await p.el('savePricingBtn').handlers.click();assert.equal(saved.length,1);
});
