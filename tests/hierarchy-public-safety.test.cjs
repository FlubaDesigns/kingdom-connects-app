'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validateContact,createContactService}=require('../functions/contact-service');
const valid=()=>({name:'Test Visitor',email:'visitor@example.invalid',subject:'Test contact',message:'A normal message.',category:'general',subcategory:'feedback',source:'form',dashboard:null,page_url:'https://kingdom-commerce.web.app/contact?token=private#fragment'});
test('contact validation preserves text and removes URL secrets while rejecting forged authority and oversized values',()=>{
 const record=validateContact(valid());assert.equal(record.page_url,'https://kingdom-commerce.web.app/contact');
 for(const change of [{status:'resolved'},{user_id:'admin'},{admin_response:'forged'},{created_at:0},{name:''},{message:'x'.repeat(5001)},{email:'bad'},{category:'bad'},{subcategory:'bad'},{dashboard:'invented'},{source:'invented'},{page_url:'https://evil.example/contact'}]){
  assert.throws(()=>validateContact({...valid(),...change}),{status:400});
 }
});
test('contact HTTP boundary rejects invalid sessions and requests before any database write',async()=>{
 let writes=0;
 const exported={};
 const requireFake=name=>name==='firebase-functions/v2/https'?{onRequest:(_opts,handler)=>handler}:name==='firebase-admin'?{firestore:()=>({}),auth:()=>({verifyIdToken:async()=>{throw Error('bad token')}})}:{createContactService:()=>async()=>{writes++;return {success:true}}};
 vm.runInNewContext(fs.readFileSync('functions/contact-endpoint.js','utf8'),{require:requireFake,exports:exported,Buffer,console});
 async function call(change){let result;const req={method:'POST',headers:{},body:valid(),ip:'192.0.2.1',is:()=>true,...change};const res={set(){},status(code){this.code=code;return this},json(body){result={status:this.code,body};return this}};await exported.submitContact(req,res);return result;}
 assert.equal((await call({method:'GET'})).status,405);
 assert.equal((await call({is:()=>false})).status,400);
 assert.equal((await call({body:{message:'x'.repeat(16001)}})).status,400);
 assert.equal((await call({headers:{authorization:'Bearer bad'}})).status,401);
 assert.equal(writes,0);assert.equal((await call({})).status,201);assert.equal(writes,1);
});
function directoryContext(){
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',addEventListener(){},classList:{add(){},remove(){},toggle(){}},setAttribute(){},querySelectorAll:()=>[],appendChild(){}});return nodes.get(id)};
 const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>el('new')};
 const context=vm.createContext({document,window:{},console,URL,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,onAuthChange(){},analytics:{trackImpression(){}},isBusinessPro:()=>false});
 vm.runInContext(fs.readFileSync('public/js/sanitize.js','utf8').replace(/^export default[\s\S]*$/m,'').replace(/^export /gm,''),context);
 const code=fs.readFileSync('public/js/business-directory.js','utf8').replace(/^import .*;\n/gm,'').replace(/\nloadData\(\);\s*$/,'');
 vm.runInContext(code,context);return {context,el};
}
test('both actual directory renderers escape saved text, quotes, church names and category values',()=>{
 const {context,el}=directoryContext();
 const attack='<img src=x onerror="alert(1)">';
 context.fixture={id:'id" onmouseover="bad',slug:'slug" onclick="bad',business_name:attack,description:attack,city:attack,state:attack,address:attack,primary_category:attack,secondary_categories:[attack],logo:'javascript:alert(1)',website_url:'data:text/html,bad',phone_number:'" onmouseover="bad',church_id:'church',average_rating:Infinity};
 context.churchName=attack;vm.runInContext('allChurches=[{id:"church",church_name:churchName}];currentUser={uid:"member"}',context);
 for(const fn of ['renderBusinesses','renderListView']){
  vm.runInContext(fn+'([fixture])',context);const html=el('businessList').innerHTML;
  assert(!html.includes(attack));assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html,/href="(?:javascript|data):|src="javascript:| onclick="bad| onmouseover="bad/);
  assert.match(html,/slug=slug%22%20onclick%3D%22bad/);
 }
 assert.equal(context.cleanUrl('example.org/path?a=1&b=2'),'https://example.org/path?a=1&amp;b=2');
 assert.equal(context.cleanUrl('https://user:pass@example.org'),'');assert.equal(context.cleanUrl('java\nscript:alert(1)'),'');
 vm.runInContext('renderBusinesses([{id:"normal",business_name:"Smith & Sons",description:"Normal listing",website_url:"example.org",logo:"https://example.org/logo.png"}])',context);
 assert.match(el('businessList').innerHTML,/Smith &amp; Sons/);assert.match(el('businessList').innerHTML,/href="https:\/\/example.org\/"/);
});

test('contact service enforces email, IP and global limits without accepting caller-controlled state',async()=>{
 const records=new Map();let counter=0,time=3600000;
 const ref=path=>({path,id:path.split('/').at(-1)});
 const db={doc:ref,collection:col=>({doc:()=>ref(col+'/'+ ++counter)}),runTransaction:async fn=>{
  const pending=[];await fn({get:async r=>({data:()=>records.get(r.path)}),set:(r,v)=>pending.push([r.path,v]),create:(r,v)=>pending.push([r.path,v])});for(const [path,value] of pending)records.set(path,value);
 }};
 const submit=createContactService(db,()=>new Date(time),()=>time);
 for(let i=0;i<3;i++)await submit(valid(),{ip:'192.0.2.1'});
 await assert.rejects(submit(valid(),{ip:'192.0.2.2'}),{status:429});
 for(let i=0;i<7;i++)await submit({...valid(),email:'visitor'+i+'@example.invalid'},{ip:'192.0.2.1'});
 await assert.rejects(submit({...valid(),email:'last@example.invalid'},{ip:'192.0.2.1'}),{status:429});
 assert.equal([...records].filter(([p])=>p.startsWith('contact_submissions/')).length,10);
 const saved=records.get('contact_submissions/1');assert.equal(saved.status,'new');assert.equal(saved.user_id,null);assert.equal(saved.admin_response,null);
 time+=3600000;await submit(valid(),{ip:'192.0.2.1',uid:'verified-user'});
 assert.equal([...records.values()].filter(v=>v.user_id==='verified-user').length,1);
 for(const [key,val] of records)if(key.startsWith('contact_rate_limits/'))assert(!JSON.stringify(val).includes('192.0.2.1'));
 for(const [key,val] of records)if(key.startsWith('contact_rate_limits/'))records.set(key,{...val,count:300});
 await assert.rejects(submit({...valid(),email:'new@example.invalid'},{ip:'192.0.2.100'}),{status:429});
});
