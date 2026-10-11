import { db } from '../../js/firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let MONTHLY_PRICE = 9;
let ANNUAL_PRICE = 69.99;
let AGENT_COMMISSION = 20;
let DIRECTOR_COMMISSION = 15;
let CHURCH_TITHE = 10;

const defaultContent = {
  hero_title: 'Build Passive Income That Pays Forever',
  hero_description: 'Every Pro subscription you sell pays you <strong>{{agent_commission}} commission every single month</strong> for as long as that business stays subscribed. Stop trading time for money. Start building wealth that compounds.'
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
      AGENT_COMMISSION = data.salesperson_percentage ?? 20;
      DIRECTOR_COMMISSION = data.sales_director_percentage ?? 15;
      CHURCH_TITHE = data.church_percentage ?? 10;
    }


  } catch (error) {
    // Silently use defaults if not authenticated - expected for public viewing
  }

  try {
    const manualDoc = await getDoc(doc(db, 'public_manuals', 'sales_agent'));
    if (manualDoc.exists()) {
      editableContent = { ...defaultContent, ...manualDoc.data() };
    }
  } catch (error) {
    console.error('Unable to load published manual content:', error);
  }

  updateManualContent();
}

function formatCurrency(amount) {
  return '$' + amount.toFixed(2).replace(/\.00$/, '');
}

function calculateIncome(subs) {
  return (subs * MONTHLY_PRICE * AGENT_COMMISSION / 100);
}

function replaceVariables(text) {
  return text
    .replace(/\{\{agent_commission\}\}/g, AGENT_COMMISSION + '%')
    .replace(/\{\{director_commission\}\}/g, DIRECTOR_COMMISSION + '%')
    .replace(/\{\{monthly_price\}\}/g, '$' + MONTHLY_PRICE)
    .replace(/\{\{annual_price\}\}/g, '$' + ANNUAL_PRICE)
    .replace(/\{\{church_tithe\}\}/g, CHURCH_TITHE + '%');
}

function updateManualContent() {
  document.querySelectorAll('[data-manual-field]').forEach(element => {
    const value = editableContent[element.dataset.manualField];
    if (typeof value === 'string' && value) {
      element.innerHTML = replaceVariables(value);
      element.classList.remove('hidden');
    }
  });
  const heroTitleEl = document.getElementById('heroTitle');
  if (heroTitleEl) {
    heroTitleEl.textContent = replaceVariables(editableContent.hero_title);
  }

  const heroDescEl = document.getElementById('heroDescription');
  if (heroDescEl) {
    heroDescEl.innerHTML = replaceVariables(editableContent.hero_description);
  }

  const commissionEl = document.getElementById('commissionPercent');
  if (commissionEl) {
    commissionEl.textContent = AGENT_COMMISSION + '%';
  }

  const allCommissionEls = document.querySelectorAll('.commission-percent');
  allCommissionEls.forEach(el => {
    el.textContent = AGENT_COMMISSION + '%';
  });

  const monthlyPriceEls = document.querySelectorAll('.monthly-price');
  monthlyPriceEls.forEach(el => {
    el.textContent = '$' + MONTHLY_PRICE;
  });

  const scenarios = [
    { id: 'parttime', salesPerMonth: 5 },
    { id: 'sidebiz', salesPerMonth: 15 },
    { id: 'fulltime', salesPerMonth: 30 }
  ];

  scenarios.forEach(scenario => {
    const tableBody = document.getElementById(scenario.id + '-table');
    if (!tableBody) return;

    const rows = [
      { label: 'Month 3', subs: scenario.salesPerMonth * 3 },
      { label: 'Month 6', subs: scenario.salesPerMonth * 6 },
      { label: 'Year 1', subs: scenario.salesPerMonth * 12 },
      { label: 'Year 2', subs: scenario.salesPerMonth * 24 },
      { label: 'Year 3', subs: scenario.salesPerMonth * 36 }
    ];

    if (scenario.id === 'fulltime') {
      rows.push({ label: 'Year 5', subs: scenario.salesPerMonth * 60 });
    }

    let html = '<tr><th>Month</th><th>Active Subs</th><th>Monthly Income</th></tr>';
    rows.forEach(row => {
      const income = calculateIncome(row.subs);
      html += `<tr><td>${row.label}</td><td>${row.subs}</td><td class="gold">${formatCurrency(income)}/mo</td></tr>`;
    });

    tableBody.innerHTML = html;

    const yearlyEl = document.getElementById(scenario.id + '-yearly');
    if (yearlyEl) {
      const year3Subs = scenario.salesPerMonth * 36;
      const yearlyIncome = calculateIncome(year3Subs) * 12;
      yearlyEl.textContent = formatCurrency(yearlyIncome);
    }
  });

  const exampleCalcEl = document.getElementById('example-calc');
  if (exampleCalcEl) {
    const subs = 10;
    const mrr = subs * MONTHLY_PRICE;
    const commission = mrr * AGENT_COMMISSION / 100;
    exampleCalcEl.innerHTML = `${subs} subscriptions at $${MONTHLY_PRICE}/month = $${mrr} MRR → ${formatCurrency(commission)}/month commission`;
  }
}

loadSettings();
