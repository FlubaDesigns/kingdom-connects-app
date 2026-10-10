/**
 * Commission Calculator & Dynamic Commission Loader for For-Agents Page
 * Loads commission rates from Firestore and updates all dynamic displays
 * Includes interactive earnings calculator with slider
 */

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PRO_MONTHLY_PRICE = 8.99;

// Global commission values (updated from Firestore)
let bonusMin = 20;
let bonusMax = 40;
let recurringPercent = 5;

async function loadCommissionRates() {
  try {
    const policyDoc = await getDoc(doc(db, 'commission_policies', 'default'));
    
    if (policyDoc.exists()) {
      const data = policyDoc.data();
      
      bonusMin = data.agent_signup_bonus_min ?? 20;
      bonusMax = data.agent_signup_bonus_max ?? 40;
      recurringPercent = data.salesperson_percentage ?? 5;
      
      // Update all static displays
      updateStaticDisplays();
      
      // Initialize calculator with updated values
      initializeCalculator();
      
      console.log(`✅ Loaded agent commission rates: $${bonusMin}-${bonusMax} signup, ${recurringPercent}% recurring`);
    } else {
      // Use defaults and still initialize
      updateStaticDisplays();
      initializeCalculator();
    }
  } catch (error) {
    // Silently fail for unauthenticated users - just use defaults
    // This is a public page, so permission errors are expected
    updateStaticDisplays();
    initializeCalculator();
  }
}

function updateStaticDisplays() {
  // Update signup bonus displays
  const bonusRange = `$${bonusMin}-${bonusMax}`;
  const signupElements = document.querySelectorAll('#signupBonus, #signupBonusTable');
  signupElements.forEach(el => {
    if (el) el.textContent = bonusRange;
  });
  
  // Update recurring percentage displays
  const percentText = `${recurringPercent}%`;
  const recurringElements = document.querySelectorAll('#recurringPercent, #recurringPercentTable');
  recurringElements.forEach(el => {
    if (el) el.textContent = percentText;
  });
  
  // Update all spans with class agent-recurring-percent
  document.querySelectorAll('.agent-recurring-percent').forEach(el => {
    el.textContent = percentText;
  });
  
  // Calculate monthly potential (50 clients example)
  const monthlyPer50 = (50 * PRO_MONTHLY_PRICE * recurringPercent / 100).toFixed(0);
  const monthlyPotentialEl = document.getElementById('monthlyPotential');
  if (monthlyPotentialEl) {
    monthlyPotentialEl.textContent = `$${monthlyPer50}+`;
  }
  
  // Update example calculations
  updateExampleCalculations();
}

function updateExampleCalculations() {
  const calc = (clients) => {
    const recurring = (clients * PRO_MONTHLY_PRICE * recurringPercent / 100).toFixed(0);
    return `$${recurring}`;
  };
  
  const bonusRange = `$${bonusMin * 10}-${bonusMax * 10}`;
  const month1Recurring = calc(10);
  const month3Recurring = calc(30);
  const month6Recurring = calc(50);
  const month12Recurring = calc(100);
  
  const examples = document.getElementById('exampleCalculations');
  if (examples) {
    examples.innerHTML = `
      <li class="p-sm block"><strong>Month 1:</strong> Sign up 10 Pro clients → Earn ${bonusRange} upfront + ${month1Recurring}/month ongoing</li>
      <li class="p-sm block"><strong>Month 3:</strong> Total 30 Pro clients → Earning ${month3Recurring}/month recurring</li>
      <li class="p-sm block"><strong>Month 6:</strong> Total 50 Pro clients → Earning ${month6Recurring}/month recurring</li>
      <li class="p-sm block"><strong>Month 12:</strong> Total 100 Pro clients → Earning ${month12Recurring}/month recurring</li>
    `;
  }
}

function initializeCalculator() {
  const slider = document.getElementById('clientSlider');
  const clientCount = document.getElementById('clientCount');
  const calcMonthlyRecurring = document.getElementById('calcMonthlyRecurring');
  const calcYearlyRecurring = document.getElementById('calcYearlyRecurring');
  const calcUpfrontPotential = document.getElementById('calcUpfrontPotential');

  if (!slider) return; // Calculator not on this page

  function updateCalculations() {
    const clients = parseInt(slider.value);
    const recurringPerClient = PRO_MONTHLY_PRICE * (recurringPercent / 100);
    const avgBonus = (bonusMin + bonusMax) / 2;

    const monthlyRecurring = recurringPerClient * clients;
    const yearlyRecurring = monthlyRecurring * 12;
    const upfrontPotential = avgBonus * clients;

    clientCount.textContent = clients;
    calcMonthlyRecurring.textContent = `$${monthlyRecurring.toFixed(2)}`;
    calcYearlyRecurring.textContent = `$${yearlyRecurring.toFixed(2)}`;
    calcUpfrontPotential.textContent = `$${upfrontPotential.toFixed(0)}`;
  }

  slider.addEventListener('input', updateCalculations);
  
  // Initial calculation
  updateCalculations();
}

// Load commission rates and initialize on page load
loadCommissionRates();
