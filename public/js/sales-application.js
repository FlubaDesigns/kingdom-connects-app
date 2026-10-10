import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initSpamProtection } from "./utils/spam-protection.js";
import { handleFormError, getFriendlyMessage } from "./utils/error-handler.js";

let currentStep = 1;
const totalSteps = 4;

document.addEventListener('DOMContentLoaded', () => {
  updateProgress();
  setupNavigation();
  setupFormSubmission();
});

function updateProgress() {
  const progressFill = document.getElementById('progressFill');
  const percentage = ((currentStep - 1) / (totalSteps - 1)) * 100;
  progressFill.style.width = `${percentage}%`;
  
  document.querySelectorAll('.progress-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.remove('active', 'completed');
    if (stepNum === currentStep) {
      step.classList.add('active');
    } else if (stepNum < currentStep) {
      step.classList.add('completed');
    }
  });
  
  document.querySelectorAll('.form-step').forEach(step => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.toggle('active', stepNum === currentStep);
  });
}

function setupNavigation() {
  document.querySelectorAll('[data-action="next"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateCurrentStep()) {
        if (currentStep === 3) {
          populateReview();
        }
        currentStep++;
        updateProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
  
  document.querySelectorAll('[data-action="prev"]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentStep--;
      updateProgress();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function validateCurrentStep() {
  const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
  const requiredFields = currentStepEl.querySelectorAll('[required]');
  
  let valid = true;
  requiredFields.forEach(field => {
    if (!field.value.trim()) {
      field.classList.add('input-error');
      valid = false;
    } else {
      field.classList.remove('input-error');
    }
  });
  
  if (!valid) {
    alert('Please fill in all required fields.');
  }
  
  return valid;
}

function populateReview() {
  const reviewContent = document.getElementById('reviewContent');
  
  const data = getFormData();
  
  reviewContent.innerHTML = `
    <div class="review-card">
      <h4>Personal Information</h4>
      <p><strong>Name:</strong> ${escapeHtml(data.full_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
      <p><strong>Location:</strong> ${escapeHtml(data.location || 'Not provided')}</p>
    </div>
    
    <div class="review-card">
      <h4>Experience</h4>
      <p><strong>Sales Experience:</strong> ${escapeHtml(formatExperience(data.sales_experience))}</p>
      <p><strong>Industries:</strong> ${escapeHtml(data.industries || 'Not provided')}</p>
      <p><strong>Church Connection:</strong> ${escapeHtml(data.church_connection || 'Not provided')}</p>
    </div>
    
    <div class="review-card">
      <h4>Motivation</h4>
      <p><strong>Why Join:</strong> ${escapeHtml(data.motivation)}</p>
      <p><strong>Hours/Week:</strong> ${escapeHtml(data.hours_per_week || 'Not specified')}</p>
      <p><strong>Referral Source:</strong> ${escapeHtml(data.referral_source || 'Not provided')}</p>
    </div>
  `;
}

function formatExperience(exp) {
  const labels = {
    'none': 'No prior sales experience',
    'some': 'Some experience (1-2 years)',
    'experienced': 'Experienced (3-5 years)',
    'veteran': 'Sales veteran (5+ years)'
  };
  return labels[exp] || 'Not specified';
}

function getFormData() {
  return {
    full_name: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim().toLowerCase(),
    phone: document.getElementById('phone').value.trim(),
    location: document.getElementById('location').value.trim(),
    sales_experience: document.getElementById('salesExperience').value,
    industries: document.getElementById('industries').value.trim(),
    church_connection: document.getElementById('churchConnection').value.trim(),
    motivation: document.getElementById('motivation').value.trim(),
    hours_per_week: document.getElementById('hoursPerWeek').value,
    referral_source: document.getElementById('referralSource').value.trim()
  };
}

function setupFormSubmission() {
  const form = document.getElementById('applicationForm');
  const spamProtection = initSpamProtection(form, 'sales_application');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const spamCheck = spamProtection.validate();
    if (!spamCheck.valid) {
      if (window.showToast) {
        window.showToast(getFriendlyMessage(spamCheck.reason), 'error');
      } else {
        alert(getFriendlyMessage(spamCheck.reason));
      }
      return;
    }
    
    const agreeTerms = document.getElementById('agreeTerms');
    if (!agreeTerms.checked) {
      alert('Please agree to the Terms of Service to continue.');
      return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    try {
      const data = getFormData();
      
      const existingQuery = query(
        collection(db, "sales_applications"),
        where("email", "==", data.email),
        where("status", "==", "pending")
      );
      const existing = await getDocs(existingQuery);
      
      if (!existing.empty) {
        alert('An application with this email is already pending review.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application';
        return;
      }
      
      await addDoc(collection(db, "sales_applications"), {
        ...data,
        status: 'pending',
        created_at: serverTimestamp(),
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null
      });
      
      spamProtection.recordSubmission();
      
      document.getElementById('applicationForm').classList.add('hidden');
      document.querySelector('.progress-bar-container').classList.add('hidden');
      document.getElementById('successMessage').classList.remove('hidden');
      
    } catch (error) {
      const message = handleFormError(error, form);
      if (window.showToast) {
        window.showToast(message, 'error');
      } else {
        alert(message);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
