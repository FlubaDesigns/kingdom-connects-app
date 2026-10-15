const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = file => fs.readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const business = { business_name: 'Faith & Family Repairs', church_id: 'church & 1', description: 'Repairs and home maintenance.' };
const church = { church_name: 'Grace Church' };
const origin = 'https://example.test';
function runtime() {
  const nodes = new Map(), copied = [];
  function element() {
    return { innerHTML:'', textContent:'', value:'', dataset:{}, children:[], handlers:{},
      classList:{add(){},remove(){}},
      addEventListener(type,fn){this.handlers[type]=fn;},
      append(...children){this.children.push(...children);}, prepend(child){this.children.unshift(child);} };
  }
  const context = vm.createContext({ URL, console, db:{},
    document:{getElementById(id){if(!nodes.has(id)) nodes.set(id,element());return nodes.get(id);},
      createElement(){const el=element();Object.defineProperty(el,'innerHTML',{get(){return el.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}});return el;}},
    window:{location:{origin},showToast(){}},navigator:{clipboard:{writeText:async text=>copied.push(text)}},
    requireAdmin(){},doc:(db,...parts)=>parts.join('/'),collection:(db,path)=>path,query:q=>q,where(){},
    canShareReview:async uid=>({allowed:uid!=='blocked'}),
    getDoc:async path=>({exists:()=>true,data:()=>path.startsWith('business_listings_public/')?business:church}),
    getDocs:async path=>({docs: path==='reviews' ? [
      {id:'yes',data:()=>({business_id:'biz & 1',user_id:'allowed',review_text:'Great service',rating:5})},
      {id:'no',data:()=>({business_id:'biz & 1',user_id:'blocked',review_text:'Do not share',rating:4})}
    ] : []})
  });
  vm.runInContext(source('public/js/business-share-content.js'), context);
  return {context,nodes,copied};
}
test('post associates the business with its church and includes both exact page URLs',()=>{
  const {context:c}=runtime();
  const post=c.buildBusinessShareContent({businessId:'biz & 1',business,church,origin,detail:business.description});
  assert.equal(post.title,'Faith & Family Repairs, associated with Grace Church.');
  assert.equal(new URL(post.businessUrl).searchParams.get('id'),'biz & 1');
  assert.equal(new URL(post.churchUrl).searchParams.get('id'),'church & 1');
  assert(post.text.includes(post.businessUrl));assert(post.text.includes(post.churchUrl));
  assert(post.text.includes(business.description));assert(!post.text.includes('store'));
  assert.equal(c.buildBusinessShareContent({businessId:'biz',business,origin}),null);
});
test('permitted queue posts, named page links, social intents and clipboard agree',async()=>{
  const {context:c,nodes,copied}=runtime();
  vm.runInContext(source('public/admin/js/social-sharing-admin.js'),c);
  await c.loadShareableContent();
  const content=vm.runInContext('allContent',c);
  assert.equal(content.length,1);
  const post=content[0].post;
  const html=nodes.get('contentQueue').innerHTML;
  assert(html.includes(`href="${post.businessUrl}">Faith &amp; Family Repairs</a>`));
  assert(html.includes(`href="${post.churchUrl}">Grace Church</a>`));
  const facebook=new URL(html.match(/href="(https:\/\/www.facebook.com[^\"]+)/)[1]);
  assert.equal(facebook.searchParams.get('quote'),post.text);
  assert.equal(facebook.searchParams.get('u'),post.businessUrl);
  const twitter=new URL(html.match(/href="(https:\/\/twitter.com[^\"]+)/)[1]);
  assert.equal(twitter.searchParams.get('text'),post.text);
  nodes.get('contentQueue').handlers.click({target:{closest:()=>({dataset:{text:post.text}})}});
  await Promise.resolve();assert.equal(copied[0],post.text);
});
test('public sharing includes both page URLs and offers exact caption copying',async()=>{
  const {context:c,nodes,copied}=runtime();
  vm.runInContext(source('public/js/social-share.js'),c);
  const post=c.buildBusinessShareContent({businessId:'biz',business,church,origin,detail:'Home repairs.'});
  const config={url:post.businessUrl,title:post.title,shareText:post.text,description:post.text,businessPost:post};
  const links=c.createShareButtons(config);
  assert.equal(new URL(links.twitter).searchParams.get('text'),post.text);
  assert.equal(new URL(links.facebook).searchParams.get('quote'),post.text);
  c.renderShareButtons('share',config);
  const preview=nodes.get('share').children[0];
  assert.equal(preview.children[0].href,post.businessUrl);
  assert.equal(preview.children[2].href,post.churchUrl);
  await nodes.get('share').children.at(-1).handlers.click();
  assert.equal(copied[0],post.text);
});
test('missing church records and disabled business sharing do not create incomplete posts',async()=>{
  const {context:c}=runtime();
  vm.runInContext(source('public/admin/js/social-sharing-admin.js'),c);
  c.getDoc=async()=>({exists:()=>false});
  assert.equal(await c.businessPost('biz','Detail',business),null);
  c.getDoc=async()=>{throw Error('must not read');};
  assert.equal(await c.businessPost('biz','Detail',{...business,allow_social_sharing:false}),null);
});
