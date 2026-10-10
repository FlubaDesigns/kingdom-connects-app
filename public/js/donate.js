const DONATION_ENDPOINT = '/api/donate';

document.addEventListener('DOMContentLoaded', () => {
  resetPageState();
  setupDonationTiers();
  setupCustomTile();
  setupRecurringToggle();
  setupDonateButton();
  checkDonationStatus();
});

window.addEventListener('pageshow', () => {
  resetPageState();
});

function resetPageState() {
  const allTiers = document.querySelectorAll('.pricing-option');
  allTiers.forEach(t => t.style.pointerEvents = 'auto');
  
  const customTile = document.getElementById('customTile');
  const customInput = document.getElementById('customAmount');
  if (customTile) customTile.classList.remove('expanded');
  if (customInput) {
    customInput.classList.add('hidden');
    customInput.value = '';
  }
  
  const donateBtn = document.getElementById('donateBtn');
  const donateButtonText = document.getElementById('donateButtonText');
  if (donateBtn) donateBtn.disabled = true;
  if (donateButtonText) donateButtonText.textContent = 'Select an amount above';
}

function isRecurring() {
  const toggle = document.getElementById('recurringToggle');
  return toggle?.checked || false;
}

function setupRecurringToggle() {
  const toggle = document.getElementById('recurringToggle');
  if (!toggle) return;
  
  toggle.addEventListener('change', () => {
    const customInput = document.getElementById('customAmount');
    const customBtn = document.getElementById('customDonateBtn');
    const amount = parseFloat(customInput?.value || 0);
    
    if (amount >= 5 && customBtn) {
      const recurring = toggle.checked;
      customBtn.textContent = recurring ? `Donate $${amount}/mo` : `Donate $${amount}`;
    }
  });
}


function setupDonationTiers() {
  const tiers = document.querySelectorAll('.pricing-option[data-amount]');
  
  tiers.forEach(tier => {
    tier.style.cursor = 'pointer';
    tier.addEventListener('click', () => {
      const amount = parseInt(tier.dataset.amount);
      if (amount > 0) {
        processDonation(amount);
      }
    });
  });
}

function setupCustomTile() {
  const customTile = document.getElementById('customTile');
  const customInput = document.getElementById('customAmount');
  const customBtn = document.getElementById('customDonateBtn');
  
  if (!customTile || !customInput) return;
  
  customTile.addEventListener('click', (e) => {
    if (e.target === customInput || e.target === customBtn) return;
    
    customTile.classList.add('expanded');
    customInput.classList.remove('hidden');
    const hint = document.getElementById('customHint');
    if (hint) hint.classList.remove('hidden');
    customInput.focus();
  });
  
  customInput.addEventListener('input', () => {
    const amount = parseFloat(customInput.value || 0);
    if (amount >= 5 && customBtn) {
      customBtn.classList.remove('hidden');
      const recurring = isRecurring();
      customBtn.textContent = recurring ? `Donate $${amount}/mo` : `Donate $${amount}`;
    } else if (customBtn) {
      customBtn.classList.add('hidden');
    }
  });
  
  customInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  if (customBtn) {
    customBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const amount = parseFloat(customInput.value || 0);
      if (amount >= 5) {
        processDonation(amount);
      }
    });
  }
}

async function processDonation(amount) {
  const donorEmail = document.getElementById('donorEmail');
  const customBtn = document.getElementById('customDonateBtn');
  const email = donorEmail?.value?.trim() || '';
  const recurring = isRecurring();

  const allTiers = document.querySelectorAll('.pricing-option');
  allTiers.forEach(t => t.style.pointerEvents = 'none');

  if (customBtn) {
    customBtn.disabled = true;
    customBtn.textContent = 'Processing...';
  }

  try {
    const payload = {
      amount: Math.round(amount * 100),
      recurring: recurring,
      successUrl: window.location.origin + '/donate?donation=success',
      cancelUrl: window.location.origin + '/donate?donation=cancelled'
    };
    
    if (email) {
      payload.email = email;
    }

    const response = await fetch(DONATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || 'Failed to create checkout session');
    }

    const data = await response.json();
    
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL returned');
    }

  } catch (error) {
    console.error('Donation error:', error);
    alert('Sorry, there was an error processing your donation. Please try again.');
    
    allTiers.forEach(t => t.style.pointerEvents = 'auto');
    if (customBtn) {
      customBtn.disabled = false;
      customBtn.textContent = 'Try Again';
    }
  }
}

function checkDonationStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('donation');
  
  if (status === 'success') {
    alert('Thank you for your generous donation! Your support helps build Kingdom commerce.');
    window.history.replaceState({}, '', window.location.pathname);
  } else if (status === 'cancelled') {
    window.history.replaceState({}, '', window.location.pathname);
  }
}
