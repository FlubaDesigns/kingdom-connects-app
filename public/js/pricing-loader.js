import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

async function loadPricingSettings() {
  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    
    if (pricingDoc.exists()) {
      const data = pricingDoc.data();
      
      const monthlyPrice = parseFloat(data.monthly_price) || 8.99;
      const annualPrice = parseFloat(data.annual_price) || 74.99;
      const freeTrialDays = parseInt(data.free_trial_days) || 30;
      
      // Update monthly price displays (with null checks)
      const monthlyPriceEl = document.getElementById('monthlyPrice');
      const monthlyPriceDetailEl = document.getElementById('monthlyPriceDetail');
      const monthlyPriceDetailEl2 = document.getElementById('monthlyPriceDetail2');
      if (monthlyPriceEl) monthlyPriceEl.textContent = `$${monthlyPrice.toFixed(2)}`;
      if (monthlyPriceDetailEl) monthlyPriceDetailEl.textContent = `$${monthlyPrice.toFixed(2)}/month`;
      if (monthlyPriceDetailEl2) monthlyPriceDetailEl2.textContent = `$${monthlyPrice.toFixed(2)}/month`;
      
      // Update annual price displays (with null checks)
      const annualPriceEl = document.getElementById('annualPrice');
      const annualPriceDetailEl = document.getElementById('annualPriceDetail');
      const annualPriceDetailEl2 = document.getElementById('annualPriceDetail2');
      if (annualPriceEl) annualPriceEl.textContent = `$${annualPrice.toFixed(2)}`;
      if (annualPriceDetailEl) annualPriceDetailEl.textContent = `$${annualPrice.toFixed(2)}/year`;
      if (annualPriceDetailEl2) annualPriceDetailEl2.textContent = `$${annualPrice.toFixed(2)}/year`;
      
      // Calculate and display savings (with null checks)
      const annualIfMonthly = monthlyPrice * 12;
      const savings = annualIfMonthly - annualPrice;
      const savingsPercent = ((savings / annualIfMonthly) * 100).toFixed(0);
      
      const savingsAmountEl = document.getElementById('savingsAmount');
      const savingsPercentEl = document.getElementById('savingsPercent');
      if (savingsAmountEl) savingsAmountEl.textContent = `$${savings.toFixed(2)}`;
      if (savingsPercentEl) savingsPercentEl.textContent = `${savingsPercent}%`;
      
      // Update free trial messaging (with null checks)
      document.querySelectorAll('.trial-days').forEach(el => {
        if (el) el.textContent = freeTrialDays;
      });
      
      console.log(`✅ Loaded pricing: $${monthlyPrice}/mo, $${annualPrice}/yr, ${freeTrialDays}-day trial`);
    }
  } catch (error) {
    console.error('Error loading pricing settings:', error);
  }
}

// Load pricing on page load
loadPricingSettings();
