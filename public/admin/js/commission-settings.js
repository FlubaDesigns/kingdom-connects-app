import { adminReady } from './admin-auth-guard.js';
await adminReady;
import { db } from '../../js/firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let MONTHLY_PRO_PRICE = 8.99;
let YEARLY_PRO_PRICE = 74.99;

const churchInput = document.getElementById('churchPercent');
const salespersonInput = document.getElementById('salespersonPercent');
const directorInput = document.getElementById('directorPercent');
const kcPercentDisplay = document.getElementById('kcPercent');
const totalPercentDisplay = document.getElementById('totalPercent');
const totalCheck = document.getElementById('totalCheck');

const originationFeeInput = document.getElementById('originationFee');

const agentTier1Threshold = document.getElementById('agentTier1Threshold');
const agentTier1Bonus = document.getElementById('agentTier1Bonus');
const agentTier2Threshold = document.getElementById('agentTier2Threshold');
const agentTier2Bonus = document.getElementById('agentTier2Bonus');
const agentTier3Threshold = document.getElementById('agentTier3Threshold');
const agentTier3Bonus = document.getElementById('agentTier3Bonus');

const directorTier1Threshold = document.getElementById('directorTier1Threshold');
const directorTier1Bonus = document.getElementById('directorTier1Bonus');
const directorTier2Threshold = document.getElementById('directorTier2Threshold');
const directorTier2Bonus = document.getElementById('directorTier2Bonus');
const directorTier3Threshold = document.getElementById('directorTier3Threshold');
const directorTier3Bonus = document.getElementById('directorTier3Bonus');

async function loadSettings() {
  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    if (pricingDoc.exists()) {
      const pricing = pricingDoc.data();
      MONTHLY_PRO_PRICE = pricing.monthly_price ?? 8.99;
      YEARLY_PRO_PRICE = pricing.annual_price ?? 74.99;
    }

    const policyDoc = await getDoc(doc(db, 'commission_policies', 'default'));
    
    if (policyDoc.exists()) {
      const data = policyDoc.data();
      churchInput.value = data.church_percentage ?? 10;
      salespersonInput.value = data.salesperson_percentage ?? 20;
      directorInput.value = data.sales_director_percentage ?? 15;
      
      if (originationFeeInput) {
        originationFeeInput.value = data.origination_fee ?? 20;
      }
      
      if (agentTier1Threshold) {
        agentTier1Threshold.value = data.agent_tier1_threshold ?? 5;
        agentTier1Bonus.value = data.agent_tier1_bonus ?? 25;
        agentTier2Threshold.value = data.agent_tier2_threshold ?? 10;
        agentTier2Bonus.value = data.agent_tier2_bonus ?? 75;
        agentTier3Threshold.value = data.agent_tier3_threshold ?? 20;
        agentTier3Bonus.value = data.agent_tier3_bonus ?? 200;
      }
      
      if (directorTier1Threshold) {
        directorTier1Threshold.value = data.director_tier1_threshold ?? 25;
        directorTier1Bonus.value = data.director_tier1_bonus ?? 100;
        directorTier2Threshold.value = data.director_tier2_threshold ?? 50;
        directorTier2Bonus.value = data.director_tier2_bonus ?? 250;
        directorTier3Threshold.value = data.director_tier3_threshold ?? 100;
        directorTier3Bonus.value = data.director_tier3_bonus ?? 500;
      }
    }
    
    updateCalculations();
    updateTierPreviews();
  } catch (error) {
    console.error('Error loading settings:', error);
    document.getElementById('saveSettingsBtn').disabled = true;
    window.showToast('Unable to load commission settings. Refresh before saving.', 'error');
  }
}

function updateCalculations() {
  const church = Number(churchInput.value);
  const salesperson = Number(salespersonInput.value);
  const director = Number(directorInput.value);
  const kc = 100 - church - salesperson - director;
  
  kcPercentDisplay.textContent = kc.toFixed(1) + '%';
  
  document.getElementById('churchAmount').textContent = `$${(MONTHLY_PRO_PRICE * church / 100).toFixed(2)} per monthly`;
  document.getElementById('salespersonAmount').textContent = `$${(MONTHLY_PRO_PRICE * salesperson / 100).toFixed(2)} per monthly`;
  document.getElementById('directorAmount').textContent = `$${(MONTHLY_PRO_PRICE * director / 100).toFixed(2)} per monthly`;
  document.getElementById('kcAmount').textContent = `$${(MONTHLY_PRO_PRICE * kc / 100).toFixed(2)} per monthly`;
  
  const total = church + salesperson + director + kc;
  totalPercentDisplay.textContent = total.toFixed(1);
  
  if ([church, salesperson, director, kc].every(value => Number.isFinite(value) && value >= 0)) {
    totalCheck.classList.remove('invalid');
    totalCheck.querySelector('.validation-message').innerHTML = `✓ Total: ${total.toFixed(1)}%`;
  } else {
    totalCheck.classList.add('invalid');
    totalCheck.querySelector('.validation-message').innerHTML = `⚠ Total: ${total.toFixed(1)}% (must equal 100%)`;
  }
}

function updateTierPreviews() {
  const agentPreview1 = document.getElementById('agentTier1Preview');
  const agentPreview2 = document.getElementById('agentTier2Preview');
  const agentPreview3 = document.getElementById('agentTier3Preview');
  
  if (agentPreview1 && agentTier1Threshold && agentTier1Bonus) {
    agentPreview1.textContent = `${agentTier1Threshold.value}+ signups = $${agentTier1Bonus.value} bonus`;
  }
  if (agentPreview2 && agentTier2Threshold && agentTier2Bonus) {
    agentPreview2.textContent = `${agentTier2Threshold.value}+ signups = $${agentTier2Bonus.value} bonus`;
  }
  if (agentPreview3 && agentTier3Threshold && agentTier3Bonus) {
    agentPreview3.textContent = `${agentTier3Threshold.value}+ signups = $${agentTier3Bonus.value} bonus`;
  }
  
  const dirPreview1 = document.getElementById('directorTier1Preview');
  const dirPreview2 = document.getElementById('directorTier2Preview');
  const dirPreview3 = document.getElementById('directorTier3Preview');
  
  if (dirPreview1 && directorTier1Threshold && directorTier1Bonus) {
    dirPreview1.textContent = `${directorTier1Threshold.value}+ team signups = $${directorTier1Bonus.value} bonus`;
  }
  if (dirPreview2 && directorTier2Threshold && directorTier2Bonus) {
    dirPreview2.textContent = `${directorTier2Threshold.value}+ team signups = $${directorTier2Bonus.value} bonus`;
  }
  if (dirPreview3 && directorTier3Threshold && directorTier3Bonus) {
    dirPreview3.textContent = `${directorTier3Threshold.value}+ team signups = $${directorTier3Bonus.value} bonus`;
  }
}

churchInput.addEventListener('input', updateCalculations);
salespersonInput.addEventListener('input', updateCalculations);
directorInput.addEventListener('input', updateCalculations);

[agentTier1Threshold, agentTier1Bonus, agentTier2Threshold, agentTier2Bonus, 
 agentTier3Threshold, agentTier3Bonus, directorTier1Threshold, directorTier1Bonus,
 directorTier2Threshold, directorTier2Bonus, directorTier3Threshold, directorTier3Bonus
].forEach(input => {
  if (input) input.addEventListener('input', updateTierPreviews);
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const church = Number(churchInput.value);
  const salesperson = Number(salespersonInput.value);
  const director = Number(directorInput.value);
  const kc = 100 - church - salesperson - director;
  
  const total = church + salesperson + director + kc;
  
  if (Math.abs(total - 100) > 0.01) {
    window.showToast('Percentages must add up to 100%', 'error');
    return;
  }
  
  if (![church, salesperson, director, kc].every(value => Number.isFinite(value) && value >= 0)) {
    window.showToast('All percentages must be 0 or greater', 'error');
    return;
  }
  
  const tierInputs = [originationFeeInput, agentTier1Threshold, agentTier1Bonus, agentTier2Threshold, agentTier2Bonus, agentTier3Threshold, agentTier3Bonus, directorTier1Threshold, directorTier1Bonus, directorTier2Threshold, directorTier2Bonus, directorTier3Threshold, directorTier3Bonus];
  if (tierInputs.some(input => !input || input.value.trim() === '' || !Number.isFinite(Number(input.value)) || Number(input.value) < 0)) {
    window.showToast('Enter a valid nonnegative amount or threshold in every field.', 'error'); return;
  }
  for (const tiers of [[agentTier1Threshold, agentTier2Threshold, agentTier3Threshold], [directorTier1Threshold, directorTier2Threshold, directorTier3Threshold]]) {
    const values = tiers.map(input => Number(input.value));
    if (values.some(value => !Number.isInteger(value)) || values[0] >= values[1] || values[1] >= values[2]) {
      window.showToast('Tier thresholds must be whole numbers in increasing order.', 'error'); return;
    }
  }
  const saveBtn = document.getElementById('saveSettingsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    await setDoc(doc(db, 'commission_policies', 'default'), {
      policy_name: 'Default Commission Split',
      church_percentage: church,
      salesperson_percentage: salesperson,
      sales_director_percentage: director,
      kingdom_connect_percentage: kc,
      origination_fee: Number(originationFeeInput.value),
      agent_tier1_threshold: Number(agentTier1Threshold.value),
      agent_tier1_bonus: Number(agentTier1Bonus.value),
      agent_tier2_threshold: Number(agentTier2Threshold.value),
      agent_tier2_bonus: Number(agentTier2Bonus.value),
      agent_tier3_threshold: Number(agentTier3Threshold.value),
      agent_tier3_bonus: Number(agentTier3Bonus.value),
      director_tier1_threshold: Number(directorTier1Threshold.value),
      director_tier1_bonus: Number(directorTier1Bonus.value),
      director_tier2_threshold: Number(directorTier2Threshold.value),
      director_tier2_bonus: Number(directorTier2Bonus.value),
      director_tier3_threshold: Number(directorTier3Threshold.value),
      director_tier3_bonus: Number(directorTier3Bonus.value),
      active: true,
      updated_at: serverTimestamp()
    }, { merge: true });
    
    window.showToast('Commission settings saved! Changes are now live.', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    window.showToast('Error saving settings. Please try again.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
});

loadSettings();
