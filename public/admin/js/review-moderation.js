import { changeHierarchy } from '../../js/services/hierarchy-service.js';
    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAdmin } from "./admin-auth-guard.js";
    import { sendCustomEmail } from "../../js/email/email-service.js";

    let currentUser = null;
    let allReviews = [];
    let currentReviewId = null;

    requireAdmin((userContext, firebaseUser) => {
      currentUser = firebaseUser;
      loadReviews();
    });

    document.getElementById('filterStatus').addEventListener('change', renderReviews);
    document.getElementById('sortBy').addEventListener('change', renderReviews);
    document.getElementById('btnCancelNotes').addEventListener('click', closeNotesModal);
    document.getElementById('notesForm').addEventListener('submit', saveAdminNotes);
    document.getElementById('sendEmailCheckbox').addEventListener('change', toggleEmailSection);
    document.getElementById('emailRecipient').addEventListener('change', updateRecipientEmail);

    function toggleEmailSection() {
      const checked = document.getElementById('sendEmailCheckbox').checked;
      const section = document.getElementById('emailSection');
      if (checked) {
        section.classList.remove('hidden');
        updateRecipientEmail();
      } else {
        section.classList.add('hidden');
      }
    }

    function updateRecipientEmail() {
      if (!currentReviewId) return;
      const review = allReviews.find(r => r.id === currentReviewId);
      if (!review) return;
      
      const recipient = document.getElementById('emailRecipient').value;
      const emailDisplay = document.getElementById('recipientEmail');
      
      if (recipient === 'reviewer') {
        emailDisplay.textContent = review.reviewer_email ? `(${review.reviewer_email})` : '(No email on file)';
      } else {
        emailDisplay.textContent = review.business_email ? `(${review.business_email})` : '(Will lookup from business)';
      }
    }

    async function loadReviews() {
      try {
        const reviewsQuery = collection(db, "reviews");
        const reviewsSnapshot = await getDocs(reviewsQuery);

        const reviewPromises = reviewsSnapshot.docs.map(async (reviewDoc) => {
          const review = reviewDoc.data();
          const businessId = review.business_id;

          let businessName = 'Unknown Business';
          if (businessId) {
            try {
              const businessDoc = await getDoc(doc(db, "business_listings_public", businessId));
              if (businessDoc.exists()) {
                businessName = businessDoc.data().business_name;
              }
            } catch (e) {
              console.error('Error loading business:', e);
            }
          }

          return {
            ...review,
            submitted_at: review.submitted_at || review.created_at,
            rating: review.rating ?? review.star_rating,
            id: reviewDoc.id,
            businessName
          };
        });

        allReviews = await Promise.all(reviewPromises);

        document.getElementById('emptyState').classList.toggle('hidden', allReviews.length > 0);
        updateStats();
        renderReviews();

        document.getElementById('loadingMessage').classList.add('hidden');
        document.getElementById('contentArea').classList.remove('hidden');

      } catch (error) {
        console.error('Error loading reviews:', error);
        document.getElementById('loadingMessage').classList.add('hidden');
        document.getElementById('errorMessage').classList.remove('hidden');
      }
    }

    function updateStats() {
      const totalReviews = allReviews.length;
      const pendingCount = allReviews.filter(r => (r.status || 'pending') === 'pending').length;
      const approvedCount = allReviews.filter(r => r.status === 'approved').length;
      const flaggedCount = allReviews.filter(r => r.status === 'flagged').length;

      document.getElementById('totalReviews').textContent = totalReviews;
      document.getElementById('pendingCount').textContent = pendingCount;
      document.getElementById('approvedCount').textContent = approvedCount;
      document.getElementById('flaggedCount').textContent = flaggedCount;
    }

    function renderReviews() {
      const filterStatus = document.getElementById('filterStatus').value;
      const sortBy = document.getElementById('sortBy').value;
      
      let filtered = [...allReviews];

      if (filterStatus) {
        filtered = filtered.filter(r => (r.status || 'pending') === filterStatus);
      }

      filtered.sort((a, b) => {
        if (sortBy === 'newest') {
          return (b.submitted_at?.toDate() || new Date(0)) - (a.submitted_at?.toDate() || new Date(0));
        } else if (sortBy === 'oldest') {
          return (a.submitted_at?.toDate() || new Date(0)) - (b.submitted_at?.toDate() || new Date(0));
        } else if (sortBy === 'rating-high') {
          return (b.rating || 0) - (a.rating || 0);
        } else if (sortBy === 'rating-low') {
          return (a.rating || 0) - (b.rating || 0);
        }
        return 0;
      });

      const container = document.getElementById('reviewsList');
      container.innerHTML = '';

      if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state-table">No reviews match the selected filter</p>';
        return;
      }

      filtered.forEach(review => {
        const card = document.createElement('div');
        card.className = `review-card ${review.status || 'pending'}`;

        const statusClass = `status-${review.status || 'pending'}`;
        const createdDate = review.submitted_at?.toDate ? review.submitted_at.toDate().toLocaleString() : 'Unknown';
        const moderatedDate = review.moderated_at?.toDate ? review.moderated_at.toDate().toLocaleString() : '';
        const stars = '⭐'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)));

        let adminNotesHTML = '';
        if (review.admin_notes) {
          adminNotesHTML = `
            <div class="admin-notes-section">
              <strong>Admin Notes:</strong> ${escapeHtml(review.admin_notes)}
              ${review.moderated_by ? `<br><small>By: ${escapeHtml(review.moderated_by)} on ${moderatedDate}</small>` : ''}
            </div>
          `;
        }

        let responseHTML = '';
        if (review.response_text) {
          const responseDate = review.response_date?.toDate ? review.response_date.toDate().toLocaleString() : '';
          responseHTML = `
            <div class="business-response-box">
              <strong>Business Response:</strong> ${escapeHtml(review.response_text)}
              ${responseDate ? `<br><small>${responseDate}</small>` : ''}
            </div>
          `;
        }

        card.innerHTML = `
          <div class="review-header">
            <div>
              <div class="rating-stars">${stars}</div>
              <div class="review-meta">
                <strong>Business:</strong> ${escapeHtml(review.businessName)}<br>
                <strong>Reviewer:</strong> ${escapeHtml(review.reviewer_name || 'Anonymous')}<br>
                <strong>Submitted:</strong> ${createdDate}
              </div>
            </div>
            <span class="status-badge ${statusClass}">${review.status || 'pending'}</span>
          </div>
          <div class="mb-md">
            <strong>Review:</strong><br>
            ${escapeHtml(review.review_text || 'No text provided')}
          </div>
          ${responseHTML}
          ${adminNotesHTML}
          <div class="action-buttons">
            ${(review.status || 'pending') !== 'approved' ? 
              `<button class="btn btn-small btn-success" data-action="approveReview" data-id="${review.id}">✓ Approve</button>` : ''}
            ${(review.status || 'pending') === 'flagged' ? 
              `<button class="btn btn-small btn-secondary" data-action="unflagReview" data-id="${review.id}">↩ Unflag</button>` : ''}
            ${(review.status || 'pending') !== 'flagged' && (review.status || 'pending') !== 'approved' ? 
              `<button class="btn btn-small btn-warning" data-action="flagReview" data-id="${review.id}">⚠ Flag</button>` : ''}
            ${(review.status || 'pending') !== 'approved' ? 
              `<button class="btn btn-small btn-secondary" data-action="addNotes" data-id="${review.id}">📝 Add Notes</button>` : ''}
            <button class="btn btn-small btn-danger" data-action="deleteReview" data-id="${review.id}">🗑 Delete</button>
          </div>
        `;

        container.appendChild(card);
      });
    }

    window.approveReview = async function(reviewId) {
      const confirmed = await window.showConfirmDialog('Approve Review', 'Approve this review and make it visible to the public?', 'Approve', 'success');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('moderateMemberReview', {reviewId, decision:'approved'});
        window.showToast('Review approved!', 'success');
        await loadReviews();
      } catch (error) {
        console.error('Error approving review:', error);
        window.showToast('Error approving review: ' + error.message, 'error');
      }
    };

    window.flagReview = async function(reviewId) {
      const confirmed = await window.showConfirmDialog('Flag Review', 'Flag this review for further investigation? You can add notes afterward.', 'Flag Review', 'warning');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('moderateMemberReview', {reviewId, decision:'flagged'});
        window.showToast('Review flagged!', 'success');
        await loadReviews();
      } catch (error) {
        console.error('Error flagging review:', error);
        window.showToast('Error flagging review: ' + error.message, 'error');
      }
    };

    window.unflagReview = async function(reviewId) {
      const confirmed = await window.showConfirmDialog('Unflag Review', 'Return this review to pending status for further review?', 'Unflag', 'info');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('moderateMemberReview', {reviewId, decision:'pending'});
        window.showToast('Review returned to pending!', 'success');
        await loadReviews();
      } catch (error) {
        console.error('Error unflagging review:', error);
        window.showToast('Error unflagging review: ' + error.message, 'error');
      }
    };

    window.addNotes = function(reviewId) {
      currentReviewId = reviewId;
      const review = allReviews.find(r => r.id === reviewId);
      document.getElementById('adminNotesInput').value = review?.admin_notes || '';
      document.getElementById('sendEmailCheckbox').checked = false;
      document.getElementById('emailSection').classList.add('hidden');
      document.getElementById('emailSubject').value = 'Regarding your review on Kingdom Connects';
      document.getElementById('emailMessage').value = '';
      document.getElementById('notesModal').classList.remove('hidden');
    };

    window.deleteReview = async function(reviewId) {
      const confirmed = await window.showConfirmDialog('Delete Review', 'PERMANENTLY DELETE this review? This cannot be undone.', 'Delete Forever', 'danger');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('moderateMemberReview', {reviewId, decision:'delete'});
        window.showToast('Review deleted!', 'success');
        await loadReviews();
      } catch (error) {
        console.error('Error deleting review:', error);
        window.showToast('Error deleting review: ' + error.message, 'error');
      }
    };

    function closeNotesModal() {
      document.getElementById('notesModal').classList.add('hidden');
      currentReviewId = null;
    }

    async function saveAdminNotes(e) {
      e.preventDefault();

      if (!currentReviewId) return;

      const notes = document.getElementById('adminNotesInput').value.trim();
      const sendEmail = document.getElementById('sendEmailCheckbox').checked;

      try {
        await changeHierarchy('moderateMemberReview', {reviewId:currentReviewId, decision:'notes', notes});

        if (sendEmail) {
          await sendReviewNotificationEmail();
        }

        closeNotesModal();
        window.showToast(sendEmail ? 'Notes saved & email sent!' : 'Notes saved!', 'success');
        await loadReviews();

      } catch (error) {
        console.error('Error saving notes:', error);
        window.showToast('Error: ' + error.message, 'error');
      }
    }

    async function sendReviewNotificationEmail() {
      const review = allReviews.find(r => r.id === currentReviewId);
      if (!review) throw new Error('Review not found');

      const recipient = document.getElementById('emailRecipient').value;
      const subject = document.getElementById('emailSubject').value.trim();
      const message = document.getElementById('emailMessage').value.trim();

      if (!subject || !message) {
        throw new Error('Please enter a subject and message');
      }

      let toEmail = '';
      let recipientName = '';

      if (recipient === 'reviewer') {
        toEmail = review.reviewer_email;
        recipientName = review.reviewer_name || 'Reviewer';
      } else {
        if (review.business_email) {
          toEmail = review.business_email;
        } else if (review.business_id) {
          const businessDoc = await getDoc(doc(db, "business_listings_public", review.business_id));
          if (businessDoc.exists()) {
            const biz = businessDoc.data();
            toEmail = biz.email || biz.contact_email;
            recipientName = biz.business_name || 'Business Owner';
          }
        }
      }

      if (!toEmail) {
        throw new Error('No email address found for recipient');
      }

      await sendCustomEmail(
        toEmail,
        subject,
        `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>Kingdom Connects Team</p>`
      );
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    window.addEventListener('click', (e) => {
      if (e.target.id === 'notesModal') {
        closeNotesModal();
      }
    });

    document.getElementById('reviewsList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      
      if (action === 'approveReview') {
        window.approveReview(id);
      } else if (action === 'flagReview') {
        window.flagReview(id);
      } else if (action === 'unflagReview') {
        window.unflagReview(id);
      } else if (action === 'addNotes') {
        window.addNotes(id);
      } else if (action === 'deleteReview') {
        window.deleteReview(id);
      }
    });
