import { db } from '../../js/firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let MONTHLY_PRICE = 9;
let ANNUAL_PRICE = 69.99;
let CHURCH_TITHE = 10;

const defaultContent = {
  hero_title: 'Grow Your Business with Kingdom Connects',
  hero_description: 'Connect with Christian customers who want to support faith-based businesses. Your Pro listing puts you in front of church members actively looking for trusted services.'
};

let editableContent = { ...defaultContent };

async function loadSettings() {
  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    if (pricingDoc.exists()) {
      const pricing = pricingDoc.data();
      MONTHLY_PRICE = pricing.monthly_price ?? 9;
      ANNUAL_PRICE = pricing.annual_price ?? 69.99;
    }

    const commissionDoc = await getDoc(doc(db, 'commission_policies', 'default'));
    if (commissionDoc.exists()) {
      const data = commissionDoc.data();
      CHURCH_TITHE = data.church_percentage ?? 10;
    }

    const manualDoc = await getDoc(doc(db, 'public_manuals', 'business_admin'));
    if (manualDoc.exists()) {
      editableContent = { ...defaultContent, ...manualDoc.data() };
    }
  } catch (error) {
    // Silently use defaults if not authenticated
  }
  
  updateManualContent();
}

function replaceVariables(text) {
  return text
    .replace(/\{\{monthly_price\}\}/g, '$' + MONTHLY_PRICE)
    .replace(/\{\{annual_price\}\}/g, '$' + ANNUAL_PRICE)
    .replace(/\{\{church_tithe\}\}/g, CHURCH_TITHE + '%');
}

function updateManualContent() {
  const heroTitleEl = document.getElementById('heroTitle');
  if (heroTitleEl) {
    heroTitleEl.textContent = replaceVariables(editableContent.hero_title);
  }

  const heroDescEl = document.getElementById('heroDescription');
  if (heroDescEl) {
    heroDescEl.innerHTML = replaceVariables(editableContent.hero_description);
  }

  const monthlyPriceEls = document.querySelectorAll('.monthly-price');
  monthlyPriceEls.forEach(el => {
    el.textContent = '$' + MONTHLY_PRICE;
  });

  const annualPriceEls = document.querySelectorAll('.annual-price');
  annualPriceEls.forEach(el => {
    el.textContent = '$' + ANNUAL_PRICE;
  });

  const churchTitheEls = document.querySelectorAll('.church-tithe');
  churchTitheEls.forEach(el => {
    el.textContent = CHURCH_TITHE + '%';
  });
}

loadSettings();
