const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEmailTemplateService,renderTemplate}=require('../functions/email-template-service');
function service(records) {
 const snap=(id,data)=>({id,exists:!!data,data:()=>data});
 return createEmailTemplateService({
   doc:path=>({get:async()=>snap(path.split('/')[1],records[path.split('/')[1]])}),
   collection:()=>({where:(field,op,value)=>({
     get:async()=>({docs:Object.entries(records).filter(([id,data])=>data[field]===value).map(([id,data])=>snap(id,data))})
   })})
 });
}
test('saved template slug/id and selected versions render the structured fields used by the editor',async()=>{
 const renderer=service({welcome:{slug:'welcome',is_active:true,subject:'Hello {{name}}',headline:'Welcome',intro:'Original',highlights:[]},welcome_v2:{slug:'welcome_v2',is_active:true,subject:'Version two',headline:'Updated',intro:'Hello {{name}}',highlights:['Saved highlight']}});
 const selected=await renderer.prepare('welcome_v2',{name:'<img src=x>'});assert.equal(selected.subject,'Version two');assert.match(selected.html,/Saved highlight/);assert.match(selected.html,/&lt;img src=x&gt;/);assert.doesNotMatch(selected.html,/Original/);
 const initial=await renderer.prepare('welcome',{name:'Dave'});assert.equal(initial.subject,'Hello Dave');
});
test('legacy names remain readable; inactive, ambiguous and missing templates fail instead of sending another version',async()=>{
 const renderer=service({old:{template_name:'legacy',is_active:true,subject:'Legacy',html_body:'<p>{{name}}</p>'},disabled:{slug:'disabled',is_active:false},a:{slug:'duplicate'},b:{slug:'duplicate'}});
 assert.equal((await renderer.prepare('legacy',{name:'<unsafe>'})).html,'<p>&lt;unsafe&gt;</p>');
 await assert.rejects(renderer.prepare('disabled'),{status:409});await assert.rejects(renderer.prepare('duplicate'),{status:409});await assert.rejects(renderer.prepare('missing'),{status:404});
});
test('draft preview uses the same renderer and rejects executable CTA schemes',()=>{
 const preview=renderTemplate({subject:'Draft',headline:'<script>',intro:'{{value}}',highlights:[],button_url:'javascript:alert(1)',button_text:'Click'},{value:'$&'});
 assert.match(preview.html,/&lt;script&gt;/);assert.match(preview.html,/\$&amp;/);assert.doesNotMatch(preview.html,/javascript:/);
});
