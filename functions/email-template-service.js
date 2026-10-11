'use strict';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderTemplate(template,variables={}) {
  const replace=(text,html=false)=>String(text??'').replace(/\{\{(\w+)\}\}/g,(match,key)=>Object.hasOwn(variables,key)?(html?escape(variables[key]):String(variables[key])):match);
  const subject=replace(template.subject || 'Kingdom Connects');
  let html;
  if (template.html_body || template.body) html=replace(template.html_body || template.body,true);
  else {
    const text=value=>escape(replace(value));
    const buttonUrl=replace(template.button_url);
    let safeUrl='';try{const url=new URL(buttonUrl);if(['https:','http:'].includes(url.protocol))safeUrl=url.href;}catch{}
    html=`<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px"><h2>${text(template.headline)}</h2><p>${text(template.intro)}</p><ul>${(Array.isArray(template.highlights)?template.highlights:[]).map(h=>'<li>'+text(h)+'</li>').join('')}</ul><p>${text(template.cta)}</p>${safeUrl?'<a href="'+escape(safeUrl)+'">'+text(template.button_text || 'Learn more')+'</a>':''}</body></html>`;
  }
  return {subject,html};
}
function createEmailTemplateService(db) {
  async function load(name) {
    if(typeof name!=='string'||!name||name.includes('/')||name.length>160)fail(400,'Choose a valid template.');
    const direct=await db.doc('email_templates/'+name).get();
    let records=direct.exists?[direct]:[];
    if(!records.length)for(const field of ['slug','template_name']){
      const snapshot=await db.collection('email_templates').where(field,'==',name).get();
      records=snapshot.docs.filter(d=>d.data().is_active!==false);
      if(records.length)break;
    }
    if(!records.length)fail(404,'Template not found: '+name);
    if(records.length>1)fail(409,'Multiple templates match; select an exact template version.');
    const template=records[0].data();
    if(template.is_active===false)fail(409,'The selected template is inactive.');
    return {...template,id:records[0].id};
  }
  async function prepare(name,variables) {return renderTemplate(await load(name),variables);}
  return {load,prepare};
}
module.exports={createEmailTemplateService,renderTemplate};
