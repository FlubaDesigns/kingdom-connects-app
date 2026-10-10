import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, orderBy, doc, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireMember } from "../../js/auth/access-control.js";

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

requireMember((userContext, firebaseUser) => {
  loadReviews(firebaseUser.uid);
});

async function loadReviews(userId) {
  const loadingMessage = document.getElementById('loadingMessage');
  const contentArea = document.getElementById('contentArea');
  const emptyState = document.getElementById('emptyState');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const reviewsQuery = query(
      collection(db, "reviews"), 
      where("user_id", "==", userId)
    );
    const reviewsSnapshot = await getDocs(reviewsQuery);

    if (reviewsSnapshot.empty) {
      loadingMessage.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    const reviews = [];

    for (const reviewDoc of reviewsSnapshot.docs) {
      const review = reviewDoc.data();
      review.id = reviewDoc.id;

      const businessDoc = await getDoc(doc(db, "business_listings_public", review.business_id));
      if (businessDoc.exists()) {
        review.businessData = businessDoc.data();
        review.businessDocId = businessDoc.id;
        reviews.push(review);
      }
    }

    // Sort client-side by created_at descending
    reviews.sort((a, b) => {
      const aTime = a.created_at?.seconds || 0;
      const bTime = b.created_at?.seconds || 0;
      return bTime - aTime;
    });

    updateStats(reviews);
    renderReviews(reviews);

    loadingMessage.classList.add('hidden');
    contentArea.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading reviews:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

function updateStats(reviews) {
  const totalEl = document.getElementById('totalReviewCount');
  const avgEl = document.getElementById('avgRatingGiven');
  
  if (totalEl) {
    totalEl.textContent = reviews.length;
  }
  
  if (avgEl && reviews.length > 0) {
    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avg = (totalRating / reviews.length).toFixed(1);
    avgEl.textContent = avg + ' ⭐';
  }
}

function renderReviews(reviews) {
  const container = document.getElementById('reviewsList');
  container.textContent = '';

  const cardList = document.createElement('div');
  cardList.className = 'card-list';
  
  reviews.forEach(review => {
    const business = review.businessData;
    const stars = '⭐'.repeat(review.rating || 0);
    const reviewDate = review.created_at ? 
      (review.created_at.toDate ? review.created_at.toDate() : new Date(review.created_at)).toLocaleDateString() : 
      'N/A';
    
    const card = document.createElement('article');
    card.className = 'card';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex-between';

    const nameHeading = document.createElement('h4');
    nameHeading.textContent = business.business_name || 'Unknown Business';
    headerDiv.appendChild(nameHeading);

    const statusBadge = document.createElement('span');
    if (review.status === 'approved') {
      statusBadge.className = 'badge-green';
      statusBadge.textContent = 'Approved';
    } else if (review.status === 'pending') {
      statusBadge.className = 'badge-orange';
      statusBadge.textContent = 'Pending';
    } else {
      statusBadge.className = 'badge-red';
      statusBadge.textContent = 'Flagged';
    }
    headerDiv.appendChild(statusBadge);

    card.appendChild(headerDiv);

    const ratingP = document.createElement('p');
    ratingP.className = 'gold';
    ratingP.textContent = `${stars} (${review.rating || 0}/5)`;
    card.appendChild(ratingP);

    const reviewTextP = document.createElement('p');
    reviewTextP.textContent = review.review_text || 'No review text';
    card.appendChild(reviewTextP);

    const dateP = document.createElement('p');
    dateP.className = 'text-sm text-muted';
    dateP.textContent = `Reviewed on ${reviewDate}`;
    card.appendChild(dateP);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const viewLink = document.createElement('a');
    viewLink.href = `../business.html?id=${review.businessDocId}`;
    viewLink.className = 'btn btn-gold btn-small';
    viewLink.textContent = 'View Business';
    btnRow.appendChild(viewLink);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-gold btn-small';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editReview(review.id, review.review_text, review.rating));
    btnRow.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-red btn-small';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteReview(review.id));
    btnRow.appendChild(deleteBtn);

    card.appendChild(btnRow);
    cardList.appendChild(card);
  });
  
  container.appendChild(cardList);
}

async function editReview(reviewId, currentText, currentRating) {
  const newText = prompt('Edit your review:', currentText);
  if (!newText || newText === currentText) return;

  try {
    await updateDoc(doc(db, "reviews", reviewId), {
      review_text: newText,
      updated_at: new Date()
    });
    window.location.reload();
  } catch (error) {
    console.error('Error updating review:', error);
    window.showToast('Error updating review. Please try again.', 'error');
  }
}

async function deleteReview(reviewId) {
  if (!confirm('Are you sure you want to delete this review? This cannot be undone.')) return;

  try {
    await deleteDoc(doc(db, "reviews", reviewId));
    window.location.reload();
  } catch (error) {
    console.error('Error deleting review:', error);
    window.showToast('Error deleting review. Please try again.', 'error');
  }
}
