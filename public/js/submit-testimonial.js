import { db } from "./firebase-config.js";
import { collection, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from './auth/access-control.js';
import { initSpamProtection } from "./utils/spam-protection.js";
import { handleFormError, getFriendlyMessage } from "./utils/error-handler.js";

const loadingMessage = document.getElementById('loadingMessage');
const contentArea = document.getElementById('contentArea');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

let currentUser = null;

onAuthChange(async (user) => {
  if (!user) {
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    return;
  }

  currentUser = user;
  await loadUserData(user);
  
  loadingMessage.classList.add('hidden');
  contentArea.classList.remove('hidden');
  setupForm();
});

async function loadUserData(user) {
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      document.getElementById('authorName').value = userData.display_name || '';
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

function setupForm() {
  const form = document.getElementById('testimonialForm');
  const testimonialText = document.getElementById('testimonialText');
  const charCount = document.getElementById('charCount');
  const spamProtection = initSpamProtection(form, 'testimonial');

  testimonialText.addEventListener('input', () => {
    charCount.textContent = testimonialText.value.length;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const spamCheck = spamProtection.validate();
    if (!spamCheck.valid) {
      if (typeof window.showToast === 'function') {
        window.showToast(getFriendlyMessage(spamCheck.reason), 'error');
      } else {
        alert(getFriendlyMessage(spamCheck.reason));
      }
      return;
    }

    if (!currentUser) {
      if (typeof window.showToast === 'function') {
        window.showToast('You must be logged in to submit a testimonial.', 'error');
      } else {
        alert('You must be logged in to submit a testimonial.');
      }
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;

    try {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';

      const testimonialData = {
        user_id: currentUser.uid,
        user_email: currentUser.email,
        author_name: document.getElementById('authorName').value.trim(),
        author_title: document.getElementById('authorTitle').value.trim(),
        entity_name: document.getElementById('entityName').value.trim() || null,
        testimonial_text: document.getElementById('testimonialText').value.trim(),
        rating: parseInt(document.getElementById('rating').value),
        member_since: document.getElementById('memberSince').value || null,
        consent_publish: document.getElementById('consentPublish').checked,
        status: 'pending',
        submitted_at: new Date(),
        approved_at: null,
        approved_by: null,
        featured: false,
        display_order: 0
      };

      await addDoc(collection(db, 'testimonials'), testimonialData);
      
      spamProtection.recordSubmission();

      contentArea.classList.add('hidden');
      successMessage.classList.remove('hidden');

    } catch (error) {
      const message = handleFormError(error, form);
      if (typeof window.showToast === 'function') {
        window.showToast(message, 'error');
      } else {
        alert(message);
      }
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}
