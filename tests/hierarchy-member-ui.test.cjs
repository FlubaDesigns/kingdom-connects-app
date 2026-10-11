const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the actual page event handlers with controlled network failures.
function page(file, overrides = {}) {
  const elements = new Map();
  const element = () => ({value:'', textContent:'', disabled:false, checked:true, children:[], dataset:{},
    classList:{add(){},remove(){}}, handlers:{}, attributes:{},
    addEventListener(event, handler){this.handlers[event]=handler;},
    setAttribute(k,v){this.attributes[k]=v;}, getAttribute(k){return this.attributes[k];},
    appendChild(child){this.children.push(child);}, replaceChildren(){},
  });
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
  const calls=[];
  const context=vm.createContext({document, console:{error(){},warn(){}}, window:{}, db:{},
    requireMember(){}, setTimeout(){}, formatPhoneNumber:v=>v, setupPhoneFormatting(){},
    doc:(db,...parts)=>parts.join('/'), getDoc:async()=>({exists:()=>true,data:()=>({home_church_id:'original',church_membership_status:'approved'})}),
    updateDoc:async(...args)=>calls.push(['profile',...args]),
    changeHierarchy:async(...args)=>{calls.push(['hierarchy',...args]);return {status:'pending'};},
    fetchActiveChurches:async()=>[], populateChurchDropdown(){}, ...overrides});
  const source=fs.readFileSync(path.join(__dirname,'../public/member/js',file),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(source,context);
  return {context, calls, el:id=>document.getElementById(id), run:code=>vm.runInContext(code,context)};
}

async function settings(overrides) {
  const p=page('member-settings.js',overrides);
  await p.run("currentUser={uid:'test'}; loadSettings(currentUser)");
  await p.run('loadChurches()');
  p.run('setupSaveSettings()');
  p.el('displayName').value='Updated name';
  return p;
}

test('profile save preserves church affiliation when church loading fails',async()=>{
  const p=await settings({fetchActiveChurches:async()=>{throw Error('offline');}});
  assert.equal(p.el('homeChurchSelect').disabled,true);
  await p.el('saveSettings').handlers.click();
  assert.equal(p.calls.filter(c=>c[0]==='hierarchy').length,0);
  assert.equal(p.calls.filter(c=>c[0]==='profile').length,1);
  assert.match(p.el('churchLoadStatus').textContent,/affiliation will be kept/);
});

test('unlisted current church is preserved while editing a profile',async()=>{
  const p=await settings();
  assert.equal(p.el('homeChurchSelect').value,'original');
  assert.equal(p.el('homeChurchSelect').children[0].value,'original');
  await p.el('saveSettings').handlers.click();
  assert.equal(p.calls.filter(c=>c[0]==='hierarchy').length,0);
});

test('explicit church change updates membership display and is not resubmitted',async()=>{
  const p=await settings();
  p.el('homeChurchSelect').value='new-church';
  await p.el('saveSettings').handlers.click();
  assert.equal(p.calls[0][0],'hierarchy');
  assert.equal(p.calls[0][2].churchId,'new-church');
  assert.equal(p.el('membershipStatus').textContent,'Membership: pending');
  await p.el('saveSettings').handlers.click();
  assert.equal(p.calls.filter(c=>c[0]==='hierarchy').length,1);
});

test('failed profile load does not report a successful initialization',async()=>{
  const p=page('member-settings.js',{getDoc:async()=>{throw Error('offline');}});
  assert.equal(await p.run("loadSettings({uid:'test'})"),false);
});

test('removing the last favorite updates the page without a reload',async()=>{
  const notices=[];let deleted=false,removed=false,empty=false;
  const p=page('favorites.js',{deleteDoc:async()=>{deleted=true;},confirm:()=>true,showToast:(...args)=>notices.push(args)});
  p.el('emptyState').classList.remove=()=>{empty=true;};
  p.context.card={remove(){removed=true;}};p.context.button={disabled:false};
  await p.run("handleUnsave('test-favorite',card,button)");
  assert(deleted&&removed&&empty);
  assert.equal(notices[0][1],'success');
});

test('failed favorite removal keeps the card and permits retry',async()=>{
  const notices=[];
  const p=page('favorites.js',{deleteDoc:async()=>{throw Error('offline');},confirm:()=>true,showToast:(...args)=>notices.push(args)});
  p.context.card={remove(){assert.fail('failed deletion removed the card');}};p.context.button={disabled:false};
  await p.run("handleUnsave('test-favorite',card,button)");
  assert.equal(p.context.button.disabled,false);
  assert.equal(notices[0][1],'error');
});
