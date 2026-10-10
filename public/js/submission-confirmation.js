import { db } from "./firebase-config.js";
import { doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

console.log('📋 Submission Confirmation page loaded');

let unsubscribe = null;

// Get submission type and ID from URL
const params = new URLSearchParams(window.location.search);
const submissionType = params.get('type'); // 'church' or 'business'
const submissionId = params.get('id');
const categorySuggested = params.get('category_suggested') === 'true';

// Show category suggestion step if applicable
if (categorySuggested) {
  const categoryStep = document.getElementById('categorySuggestionStep');
  if (categoryStep) {
    categoryStep.style.display = 'list-item';
  }
}

if (!submissionType || !submissionId) {
  console.error('❌ Missing submission type or ID');
  showError();
} else {
  console.log(`✅ Tracking ${submissionType} submission:`, submissionId);
  startListening();
}

async function checkIfApproved() {
  const approvedCollection = submissionType === 'church' ? 'churches' : 'business_listings_public';
  const approvedRef = doc(db, approvedCollection, submissionId);
  
  try {
    const approvedDoc = await getDoc(approvedRef);
    if (approvedDoc.exists()) {
      const data = approvedDoc.data();
      // Only count as approved if listing_status is 'active'
      if (data.listing_status === 'active') {
        console.log('🎉 Found in collection with active status - submission was approved!');
        showApproved();
        return true;
      }
      console.log('⏳ Found in collection but status is:', data.listing_status);
    }
  } catch (error) {
    console.error('Error checking approved collection:', error);
  }
  return false;
}

function startListening() {
  const collectionName = submissionType === 'church' ? 'churches' : 'business_listings_public';
  const submissionRef = doc(db, collectionName, submissionId);

  document.getElementById('submissionMessage').textContent = 
    `Your ${submissionType} submission is under review by our admin team.`;

  // Real-time listener for submission status
  unsubscribe = onSnapshot(submissionRef, async (docSnap) => {
    if (!docSnap.exists()) {
      console.log('❌ Submission not found');
      showError();
      return;
    }

    const data = docSnap.data();
    const status = data.listing_status || data.status || 'pending';
    console.log('📊 Submission status:', status);

    if (status === 'active' || status === 'approved') {
      console.log('🎉 Submission approved!');
      showApproved();
    } else if (status === 'rejected' || status === 'suspended') {
      console.log('❌ Submission rejected/suspended');
      showError('Your submission was not approved. Please contact support for more information.');
    } else {
      console.log('⏳ Still pending...');
      showPending();
    }
  }, (error) => {
    console.error('❌ Error listening to submission:', error);
    showError();
  });
}

function showPending() {
  document.getElementById('pendingState').classList.remove('hidden');
  document.getElementById('approvedState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
}

function showApproved() {
  document.getElementById('pendingState').classList.add('hidden');
  document.getElementById('approvedState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');

  document.getElementById('approvalMessage').textContent = 
    `Your ${submissionType} has been approved and is now live!`;

  // Countdown redirect
  let countdown = 3;
  const countdownEl = document.getElementById('countdown');
  const interval = setInterval(() => {
    countdown--;
    countdownEl.textContent = countdown;
    if (countdown === 0) {
      clearInterval(interval);
      redirectToOnboarding();
    }
  }, 1000);

  // Manual button click
  document.getElementById('getStartedBtn').addEventListener('click', () => {
    clearInterval(interval);
    redirectToOnboarding();
  });
}

function redirectToOnboarding() {
  const onboardingUrl = submissionType === 'church' 
    ? '/church-onboarding.html' 
    : '/business-onboarding.html';
  console.log('🚀 Redirecting to:', onboardingUrl);
  window.location.href = onboardingUrl;
}

function showError(message) {
  document.getElementById('pendingState').classList.add('hidden');
  document.getElementById('approvedState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  
  if (message) {
    document.querySelector('#errorState h2').textContent = message;
  }
}

// Cleanup listener on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribe) {
    unsubscribe();
  }
});
