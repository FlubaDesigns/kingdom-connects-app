import { renderBusinessBenefits } from '/js/benefits/business-benefits.js';

document.addEventListener('DOMContentLoaded', () => {
  renderBusinessBenefits('benefitsContainer');
  
  const params = new URLSearchParams(window.location.search);
  const churchName = params.get('church');
  
  const churchApproval = document.getElementById('churchApprovalNeeded');
  const platformReview = document.getElementById('platformReviewOnly');
  
  if (churchName && churchApproval) {
    churchApproval.classList.remove('hidden');
    const msg = document.getElementById('churchApprovalMessage');
    if (msg) {
      msg.textContent = churchName + ' needs to approve your affiliation before your listing can go live.';
    }
  } else if (platformReview) {
    platformReview.classList.remove('hidden');
  }
});
