'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=require('../functions/hierarchy-policy');
test('sitemap includes the same visible businesses as public profile rendering',async()=>{
 const doc=(id,data)=>({id,data:()=>data});
 const businesses=[doc('shown',{business_name:'Visible',listing_status:'active',church_id:'active'}),doc('orphan',{business_name:'Orphan',listing_status:'active'}),doc('inactive',{business_name:'Inactive parent',listing_status:'active',church_id:'missing'}),doc('suspended',{business_name:'Suspended',listing_status:'active',church_id:'active',platform_suspended:true})];
 const churches=[doc('active',{church_name:'Active Church',listing_status:'active'})];
 const exports={};
 const context={exports,require(name){if(name==='firebase-functions/v2/https')return {onRequest:(_options,fn)=>fn};if(name==='firebase-admin')return {firestore:()=>({collection:name=>({where:()=>({get:async()=>({docs:name==='churches'?churches:businesses})})})})};if(name==='cors')return ()=>()=>{};if(name==='./hierarchy-policy')return policy;throw Error(name);},console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/sitemap.js'),'utf8'),context);
 let body,status=200;const res={set(){},status(code){status=code;return this;},send(value){body=value;}};
 await exports.sitemapXml({headers:{},ip:'fixture',path:'/sitemap.xml'},res);
 assert.equal(status,200);assert(body.includes('/business/visible.htm'));for(const slug of ['orphan','inactive-parent','suspended'])assert(!body.includes('/business/'+slug+'.htm'));assert(body.includes('/church/active-church.htm'));
});
