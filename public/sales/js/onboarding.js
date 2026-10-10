import { requireSalesAgent } from "./sales-auth-guard.js";

const API_BASE = '';

let currentUser = null;
let stripeConnectInstance = null;

requireSalesAgent((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  checkOnboardingStatus();
});

async function getAuthToken() {
  if (!currentUser) return null;
  return await currentUser.getIdToken();
}

async function checkOnboardingStatus() {
  try {
    const token = await getAuthToken();
    const response = await fetch(`${API_BASE}/api/stripe/account-status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to check account status');
    }

    const data = await response.json();

    hideAllStates();

    if (!data.hasAccount) {
      showState('no-account-state');
      return;
    }

    if (data.onboardingComplete) {
      showState('success-state');
      return;
    }

    showState('welcome-state');
    document.getElementById('start-onboarding-btn').addEventListener('click', startEmbeddedOnboarding);

  } catch (error) {
    console.error('Error checking onboarding status:', error);
    hideAllStates();
    showState('error-state');
    document.getElementById('error-message').textContent = error.message;
  }
}

async function startEmbeddedOnboarding() {
  try {
    const btn = document.getElementById('start-onboarding-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading...';
    }

    const token = await getAuthToken();

    const keyResponse = await fetch(`${API_BASE}/api/stripe/publishable-key`);
    if (!keyResponse.ok) {
      throw new Error('Failed to get Stripe configuration');
    }
    const { publishableKey } = await keyResponse.json();

    const fetchClientSecret = async () => {
      const response = await fetch(`${API_BASE}/api/stripe/create-account-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      const data = await response.json();
      return data.clientSecret;
    };

    stripeConnectInstance = StripeConnect.init({
      publishableKey: publishableKey,
      fetchClientSecret: fetchClientSecret,
      appearance: {
        overlays: 'dialog',
        variables: {
          colorPrimary: '#c9a227',
          colorBackground: '#1a1a2e',
          colorText: '#f5f5f5',
          colorDanger: '#df4759',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          borderRadius: '8px',
          spacingUnit: '4px'
        }
      }
    });

    hideAllStates();
    showState('onboarding-container');

    const onboardingComponent = stripeConnectInstance.create('account-onboarding');
    
    onboardingComponent.setOnExit(() => {
      console.log('User completed or exited onboarding');
      checkOnboardingStatus();
    });

    const container = document.getElementById('stripe-onboarding');
    container.appendChild(onboardingComponent);

    document.getElementById('check-status-btn').addEventListener('click', checkOnboardingStatus);

  } catch (error) {
    console.error('Error starting embedded onboarding:', error);
    hideAllStates();
    showState('error-state');
    document.getElementById('error-message').textContent = error.message;
  }
}

function hideAllStates() {
  const states = ['loading-state', 'welcome-state', 'onboarding-container', 'success-state', 'no-account-state', 'error-state'];
  states.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showState(stateId) {
  const el = document.getElementById(stateId);
  if (el) el.classList.remove('hidden');
}
