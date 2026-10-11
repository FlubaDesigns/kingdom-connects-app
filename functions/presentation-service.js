'use strict';
const defaults = require('./presentation-defaults.json');
const PptxGenJS = require('pptxgenjs');
const fail = (status,message) => {throw Object.assign(new Error(message),{status});};
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createPresentationService(db) {
  async function load(role, templateId) {
    if (!Object.hasOwn(defaults, role)) fail(400,'Choose a supported presentation role.');
    let template = defaults[role];
    if (templateId) {
      if (typeof templateId !== 'string' || templateId.includes('/') || templateId.length > 160) fail(400,'Invalid template.');
      const saved = await db.doc('presentation_templates/'+templateId).get();
      if (!saved.exists) fail(404,'The selected template no longer exists.');
      template = saved.data();
      if (template.role !== role) fail(400,'The selected template belongs to another role.');
    }
    if (!template.email?.subject || !Array.isArray(template.email.highlights) || !Array.isArray(template.slides) || !template.slides.length || template.slides.length > 50) fail(400,'The presentation template is incomplete.');
    const [pricing, policy] = await Promise.all(['pricing_settings/default','commission_policies/default'].map(path=>db.doc(path).get()));
    const p=pricing.data() || {}, c=policy.data() || {};
    const money = value => '$'+Number(value).toFixed(2);
    const variables = {monthly_price:money(p.monthly_price ?? 8.99),annual_price:money(p.annual_price ?? 74.99),agent_commission:(c.salesperson_percentage ?? 20)+'%',church_tithe:(c.church_percentage ?? 10)+'%',director_commission:(c.sales_director_percentage ?? 15)+'%'};
    const resolve = value => typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g,(match,key)=>variables[key] ?? match) : Array.isArray(value) ? value.map(resolve) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v)])) : value;
    return resolve({email:template.email,slides:template.slides,title:template.name || template.email.headline,role});
  }
  function renderEmail(template) {
    const e=template.email;
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;max-width:640px;margin:auto;padding:24px"><h1>${escape(e.headline)}</h1><p>${escape(e.intro)}</p><ul>${e.highlights.map(h=>'<li>'+escape(h)+'</li>').join('')}</ul><p>${escape(e.cta)}</p><a href="https://kingdom-commerce.web.app">Visit Kingdom Connects</a></body></html>`;
  }
  async function attachment(template) {
    const deck = new PptxGenJS(); deck.layout='LAYOUT_WIDE'; deck.author='Kingdom Connects'; deck.title=template.title;
    for (const data of template.slides) {
      const slide=deck.addSlide(); slide.background={color:'10243A'};
      slide.addText(String(data.title || ''),{x:0.6,y:0.5,w:12.1,h:1.1,fontSize:30,color:'D4AF37',bold:true,breakLine:false,fit:'shrink'});
      const body = data.type==='content' ? (data.bullets || []).map(String).join('\n\n') : String(data.subtitle || data.message || '');
      slide.addText(body,{x:0.8,y:1.9,w:11.7,h:4.7,fontSize:23,color:'FFFFFF',fit:'shrink',breakLine:false});
    }
    return {filename:'kingdom-connects-'+template.role+'.pptx',content:await deck.write({outputType:'nodebuffer'})};
  }
  return {load,renderEmail,attachment};
}
module.exports={createPresentationService};
