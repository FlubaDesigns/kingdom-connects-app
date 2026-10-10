import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { isBusinessPro } from "../../js/role-utils.js";

let businessId = null;
let currentBusiness = null;
let allReviews = [];

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  initPage(businessContext);
});

async function initPage(businesses) {
  const loadingMessage = document.getElementById('loadingMessage');
  const noBusinessMessage = document.getElementById('noBusinessMessage');
  const reviewsContent = document.getElementById('reviewsContent');

  try {
    let activeBusiness = null;
    if (businesses) {
      for (const biz of businesses) {
        if (biz.listing_status === 'active') {
          activeBusiness = biz;
          break;
        }
      }
    }

    if (!activeBusiness) {
      loadingMessage.classList.add('hidden');
      noBusinessMessage.classList.remove('hidden');
      return;
    }

    businessId = activeBusiness.id;
    currentBusiness = activeBusiness;

    const isPro = isBusinessPro(currentBusiness);
    if (!isPro) {
      document.getElementById('upgradePromo').classList.remove('hidden');
    }

    await loadReviews();

    loadingMessage.classList.add('hidden');
    reviewsContent.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading business:', error);
    loadingMessage.textContent = 'Error loading business: ' + error.message;
    loadingMessage.classList.add('error-text');
  }
}

    async function loadReviews() {
      try {
        const q = query(collection(db, "reviews"), where("business_id", "==", businessId));
        const querySnapshot = await getDocs(q);

        allReviews = [];
        querySnapshot.forEach((doc) => {
          allReviews.push({ id: doc.id, ...doc.data() });
        });

        if (allReviews.length === 0) {
          document.getElementById('noReviews').classList.remove('hidden');
          document.getElementById('reviewsList').innerHTML = '';
          updateStats([], 0);
          return;
        }

        document.getElementById('noReviews').classList.add('hidden');

        const totalRating = allReviews.reduce((sum, r) => sum + (r.rating || 0), 0);
        const avgRating = totalRating / allReviews.length;
        const responsesCount = allReviews.filter(r => r.response_text).length;

        updateStats(allReviews, responsesCount);
        renderReviews(allReviews);

      } catch (error) {
        console.error('Error loading reviews:', error);
      }
    }

    function updateStats(reviews, responsesCount) {
      const total = reviews.length;
      const totalRating = total > 0 ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) : 0;
      const avgRating = total > 0 ? (totalRating / total).toFixed(1) : '0.0';
      const responseRate = total > 0 ? Math.round((responsesCount / total) * 100) : 0;

      document.getElementById('averageRating').textContent = avgRating;
      document.getElementById('totalReviews').textContent = total;
      document.getElementById('responseRate').textContent = responseRate + '%';
    }

    function renderReviews(reviews) {
      const reviewsList = document.getElementById('reviewsList');
      reviewsList.innerHTML = '';

      reviews.sort((a, b) => {
        const aDate = a.created_at?.toDate ? a.created_at.toDate() : new Date(a.created_at);
        const bDate = b.created_at?.toDate ? b.created_at.toDate() : new Date(b.created_at);
        return bDate - aDate;
      });

      reviews.forEach(review => {
        const reviewCard = createReviewCard(review);
        reviewsList.appendChild(reviewCard);
      });
    }

    function createReviewCard(review) {
      const card = document.createElement('div');
      card.className = 'review-card';

      const stars = '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0));
      const reviewDate = review.created_at?.toDate ? review.created_at.toDate().toLocaleDateString() : 'Unknown date';
      const reviewerName = review.reviewer_name || 'Anonymous';

      let responseHTML = '';
      if (review.response_text) {
        const responseDate = review.response_date?.toDate ? review.response_date.toDate().toLocaleDateString() : '';
        responseHTML = `
          <div class="response-box">
            <strong>Your Response:</strong> <span class="review-date">${responseDate}</span>
            <p class="mt-sm">${escapeHtml(review.response_text)}</p>
          </div>
        `;
      } else if (isBusinessPro(currentBusiness)) {
        responseHTML = `
          <div class="response-form">
            <textarea id="response_${review.id}" rows="3" class="input-dark" placeholder="Write your response..."></textarea>
            <button class="btn btn-gold mt-sm" data-action="submitResponse" data-id="${review.id}">Post Response</button>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="review-header">
          <div>
            <strong>${escapeHtml(reviewerName)}</strong>
            <div class="stars">${stars}</div>
          </div>
          <div class="review-date">${reviewDate}</div>
        </div>
        <p>${escapeHtml(review.review_text || 'No review text provided')}</p>
        ${responseHTML}
      `;

      return card;
    }

    window.submitResponse = async (reviewId) => {
      const responseText = document.getElementById(`response_${reviewId}`).value.trim();
      
      if (!responseText) {
        window.showToast('Please enter a response', 'info');
        return;
      }
      
      // Sanitize input (max 500 chars for responses)
      const sanitized = sanitizeInput(responseText, 500);

      try {
        await updateDoc(doc(db, "reviews", reviewId), {
          response_text: sanitized,
          response_date: serverTimestamp()
        });

        window.showToast('Response posted!', 'success');
        await loadReviews();

      } catch (error) {
        console.error('Error posting response:', error);
        window.showToast('Error posting response: ' + error.message, 'error');
      }
    };

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function sanitizeInput(input, maxLength = 1000) {
      if (!input) return '';
      let clean = input.trim();
      if (clean.length > maxLength) {
        clean = clean.substring(0, maxLength);
      }
      return clean;
    }
