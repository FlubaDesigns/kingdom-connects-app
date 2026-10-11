/**
 * Pro Checkout - Dynamic pricing from Firestore
 */

import { db } from '../../js/firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let currentUser = null;
let businessId = null;
let pricingSettings = null;
let selectedPlan = 'monthly'; // default
let stripe = null;

// Initialize Stripe from platform settings
async function initStripe() {
  try {
    const settingsDoc = await getDoc(doc(db, 'platform_settings', 'stripe'));
    if (settingsDoc.exists() && settingsDoc.data().publishable_key) {
      stripe = Stripe(settingsDoc.data().publishable_key);
    } else {
      console.error('Stripe publishable key not configured in platform_settings');
      window.showToast('Payment system not configured. Please contact support.', 'error');
    }
  } catch (error) {
    console.error('Error loading Stripe settings:', error);
  }
}

requireAuth({ requireBusiness: true }, async (userContext, firebaseUser, businessContext) => {
  currentUser = firebaseUser;
  
  // Get business ID from context
  if (businessContext && businessContext.length > 0) {
    const activeBusiness = businessContext.find(b => !['suspended','rejected'].includes(b.listing_status));
    if (activeBusiness) {
      businessId = activeBusiness.id;
    }
  }
  
  await initStripe();
  await loadPricingSettings();
  setupEventListeners();
});

/**
 * Load business data for current user
 */
async function loadBusinessData() {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      businessId = userData.business_id || null;
      
      if (!businessId) {
        console.warn('No business_id found for user');
      }
    }
  } catch (error) {
    console.error('Error loading business data:', error);
  }
}

/**
 * Load dynamic pricing from Firestore
 */
async function loadPricingSettings() {
  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    
    if (pricingDoc.exists()) {
      pricingSettings = pricingDoc.data();
      displayPricing();
    } else {
      console.error('Pricing settings not found - using defaults');
      pricingSettings = {
        monthly_price: 8.99,
        annual_price: 74.99,
        free_trial_days: 30
      };
      displayPricing();
    }
  } catch (error) {
    console.error('Error loading pricing:', error);
    window.showToast('Unable to load pricing. Please try again.', 'error');
  }
}

/**
 * Display pricing dynamically
 */
function displayPricing() {
  const monthlyPrice = parseFloat(pricingSettings.monthly_price) || 8.99;
  const annualPrice = parseFloat(pricingSettings.annual_price) || 74.99;
  const trialDays = parseInt(pricingSettings.free_trial_days) || 30;
  
  // Calculate monthly equivalent for annual plan
  const annualMonthly = (annualPrice / 12).toFixed(2);
  const savings = ((monthlyPrice * 12) - annualPrice).toFixed(2);
  const savingsPercent = (((monthlyPrice * 12 - annualPrice) / (monthlyPrice * 12)) * 100).toFixed(0);

  // Update pricing display
  const pricingContainer = document.getElementById('pricing-container');
  pricingContainer.innerHTML = `
    <div class="pricing-options">
      <div class="pricing-option" data-plan="monthly">
        <input type="radio" name="plan" id="monthly-plan" value="monthly" checked>
        <label for="monthly-plan">
          <h4>Monthly Plan</h4>
          <p class="price">$${monthlyPrice.toFixed(2)}/month</p>
          <p class="trial-info">${trialDays}-day free trial</p>
        </label>
      </div>
      
      <div class="pricing-option recommended" data-plan="annual">
        <span class="badge">BEST VALUE</span>
        <input type="radio" name="plan" id="annual-plan" value="annual">
        <label for="annual-plan">
          <h4>Annual Plan</h4>
          <p class="price">$${annualPrice.toFixed(2)}/year</p>
          <p class="equivalent">Just $${annualMonthly}/month</p>
          <p class="savings">Save $${savings} (${savingsPercent}%)</p>
          <p class="trial-info">${trialDays}-day free trial + FREE swag</p>
        </label>
      </div>
    </div>
  `;

  // Add change listeners
  document.querySelectorAll('input[name="plan"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectedPlan = e.target.value;
      document.querySelectorAll('.pricing-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      e.target.closest('.pricing-option').classList.add('selected');
      
      // Update button text
      const btn = document.getElementById('checkout-button');
      if (selectedPlan === 'annual') {
        btn.textContent = `Start ${trialDays}-Day Free Trial - Annual Plan`;
      } else {
        btn.textContent = `Start ${trialDays}-Day Free Trial - Monthly Plan`;
      }
    });
  });

  // Set initial selection
  document.querySelector('.pricing-option[data-plan="monthly"]').classList.add('selected');
  document.getElementById('checkout-button').textContent = `Start ${trialDays}-Day Free Trial - Monthly Plan`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const queryParams = new URLSearchParams(window.location.search);
  const promo = queryParams.get("promo");
  const utmSource = queryParams.get("utm_source") || "";
  const utmCampaign = queryParams.get("utm_campaign") || "";

  if (promo) {
    document.getElementById("promo_section").classList.remove("hidden");
    document.getElementById("promo_code").value = promo;
  }

  document.getElementById("utm_source").value = utmSource;
  document.getElementById("utm_campaign").value = utmCampaign;

  document.getElementById("checkout-button").addEventListener("click", handleCheckout);
}

/**
 * Handle checkout button click
 */
async function handleCheckout() {
  if (!stripe) {
    window.showToast('Payment system not ready. Please refresh and try again.', 'error');
    return;
  }

  const queryParams = new URLSearchParams(window.location.search);
  const referrerId = queryParams.get("ref") || "";
  const promoCodeInput = document.getElementById("promo_code");
  const promoCode = promoCodeInput && promoCodeInput.value.trim();
  const utmSource = document.getElementById("utm_source").value;
  const utmCampaign = document.getElementById("utm_campaign").value;

  // Get church_id if available
  let churchId = "";
  try {
    if (businessId) {
      const businessDoc = await getDoc(doc(db, 'business_listings_public', businessId));
      if (businessDoc.exists()) {
        churchId = businessDoc.data().church_id || "";
      }
    }
  } catch (error) {
    console.error('Error fetching church_id:', error);
  }

  // Get user's ID token for authentication
  const idToken = await currentUser.getIdToken();
  
  const payload = {
    businessId: businessId || currentUser.uid,
    billingCycle: selectedPlan // 'monthly' or 'annual'
  };

  try {
    // Use relative URL - Firebase Hosting rewrites handle routing to Cloud Functions
    const response = await fetch("/api/createCheckoutSession", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify(payload),
    });

    const session = await response.json();
    
    if (session.error) {
      throw new Error(session.error);
    }
    
    if (!session.url) {
      throw new Error('No checkout URL returned from server');
    }

    // Redirect to Stripe Checkout
    window.location.href = session.url;
  } catch (error) {
    console.error("Checkout error:", error);
    window.showToast("Payment error. Please try again or contact support.", 'error');
  }
}
