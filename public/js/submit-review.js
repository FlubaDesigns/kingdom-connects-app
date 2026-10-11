import { changeHierarchy } from './services/hierarchy-service.js';
import { db } from "./firebase-config.js";
import { collection, addDoc, getDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from './auth/access-control.js';
import { setupFormValidation } from "./form-validator.js";

const params = new URLSearchParams(window.location.search);
const businessId = params.get('id');
let currentUser = null;

const form = document.getElementById('reviewForm');
const statusDiv = document.getElementById('statusMessage');
const reviewerNameInput = document.getElementById('reviewerName');

if (!businessId) {
  document.getElementById('businessNameDisplay').textContent = 'Error: No business ID provided.';
  form.classList.add('hidden');
}

onAuthChange(async (user) => {
  if (!user) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `/login?returnUrl=${returnUrl}`;
    return;
  }
  
  currentUser = user;
  
  if (reviewerNameInput) {
    reviewerNameInput.value = user.displayName || '';
  }
  
  if (businessId) {
    try {
      const businessDoc = await getDoc(doc(db, 'business_listings_public', businessId));
      if (businessDoc.exists()) {
        const businessName = businessDoc.data().business_name;
        document.getElementById('businessNameDisplay').textContent = `Review: ${businessName}`;
      }
    } catch (error) {
      console.error('Error fetching business:', error);
    }
  }
});

setupFormValidation(form, async (e) => {
  if (!currentUser) {
    statusDiv.classList.remove('hidden');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = 'Please log in to submit a review.';
    return;
  }
  
  statusDiv.classList.remove('hidden', 'status-error');
  statusDiv.classList.add('status-pending');
  statusDiv.textContent = 'Submitting your review...';

  const reviewData = {
    business_id: businessId,
    user_id: currentUser.uid,
    user_email: currentUser.email,
    reviewer_name: reviewerNameInput.value.trim() || currentUser.displayName || 'Member',
    rating: parseInt(document.getElementById('starRating').value),
    review_text: document.getElementById('reviewText').value.trim(),
    status: "pending",
    created_at: serverTimestamp()
  };

  try {
    await changeHierarchy('saveMemberReview', { businessId, rating:reviewData.rating, reviewText:reviewData.review_text });
    window.location.href = '/thank_you_review';

  } catch (error) {
    console.error("Error submitting review:", error);
    statusDiv.classList.remove('status-pending');
    statusDiv.classList.add('status-error');
    statusDiv.textContent = `Error: ${error.message}. Please try again.`;
  }
});
