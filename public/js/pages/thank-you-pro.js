import { renderBusinessProBenefits } from '/js/benefits/business-pro-benefits.js';
import { onAuthChange, getCurrentUser } from '/js/auth/access-control.js';

document.addEventListener('DOMContentLoaded', () => {
  renderBusinessProBenefits('benefitsContainer');
  
  const params = new URLSearchParams(window.location.search);
  const billing = params.get('billing');
  const businessId = params.get('business_id');
  
  const annualNotice = document.getElementById('annualSwagNotice');
  const monthlyNotice = document.getElementById('monthlyTrialNotice');
  const welcomeMessage = document.getElementById('welcomeMessage');
  
  if (billing === 'annual') {
    if (annualNotice) annualNotice.classList.remove('hidden');
    if (welcomeMessage) welcomeMessage.textContent = 'Your Annual Pro membership is now active. Thank you for your commitment to Kingdom commerce!';
  } else {
    if (monthlyNotice) monthlyNotice.classList.remove('hidden');
    if (welcomeMessage) welcomeMessage.textContent = 'Your Monthly Pro membership is now active. Enjoy your 30-day free trial!';
  }
  
  if (businessId) {
    const dashboardLinks = document.querySelectorAll('a[href="business-admin/"]');
    dashboardLinks.forEach(link => {
      link.href = `business-admin/?business_id=${businessId}`;
    });
  }
  
  onAuthChange(async (user) => {
    if (user && businessId) {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/sendProWelcomeEmail', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            businessId: businessId,
            billingCycle: billing || 'monthly'
          })
        });
        console.log('Welcome email triggered');
      } catch (error) {
        console.error('Failed to send welcome email:', error);
      }
    }
  });
});
