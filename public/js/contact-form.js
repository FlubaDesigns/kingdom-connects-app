import { submitContact } from './services/contact-service.js';
import { onAuthChange } from './auth/access-control.js';
import { initSpamProtection } from './utils/spam-protection.js';
import { handleFormError, getFriendlyMessage } from './utils/error-handler.js';

const SUBCATEGORIES = {
  general: [
    { value: 'feedback', label: 'Feedback' },
    { value: 'partnerships', label: 'Partnerships' },
    { value: 'chapters', label: 'Starting a Chapter' },
    { value: 'other', label: 'Other' }
  ],
  support: [
    { value: 'account', label: 'Account Issues' },
    { value: 'listing', label: 'Listing Help' },
    { value: 'pro_upgrade', label: 'Pro Upgrade' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'other', label: 'Other' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const categorySelect = document.getElementById('category');
  const subcategoryGroup = document.getElementById('subcategory-group');
  const subcategorySelect = document.getElementById('subcategory');
  const submitBtn = document.getElementById('submit-btn');
  const formStatus = document.getElementById('form-status');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');

  const urlParams = new URLSearchParams(window.location.search);
  const sourceParam = urlParams.get('source') || 'form';
  const dashboardParam = urlParams.get('dashboard') || null;

  const spamProtection = initSpamProtection(form, 'contact_form');

  let currentUser = null;

  onAuthChange((user) => {
    currentUser = user;
    if (user) {
      if (user.displayName && !nameInput.value) {
        nameInput.value = user.displayName;
      }
      if (user.email && !emailInput.value) {
        emailInput.value = user.email;
      }
    }
  });

  categorySelect.addEventListener('change', (e) => {
    const category = e.target.value;
    
    if (category && SUBCATEGORIES[category]) {
      subcategorySelect.innerHTML = '<option value="">Select a topic...</option>';
      SUBCATEGORIES[category].forEach(sub => {
        const option = document.createElement('option');
        option.value = sub.value;
        option.textContent = sub.label;
        subcategorySelect.appendChild(option);
      });
      subcategoryGroup.classList.remove('hidden');
      subcategorySelect.required = true;
    } else {
      subcategoryGroup.classList.add('hidden');
      subcategorySelect.required = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const spamCheck = spamProtection.validate();
    if (!spamCheck.valid) {
      formStatus.className = 'form-error';
      formStatus.innerHTML = `<span>${getFriendlyMessage(spamCheck.reason)}</span>`;
      formStatus.classList.remove('hidden');
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    formStatus.classList.add('hidden');

    try {
      const formData = {
        category: categorySelect.value,
        subcategory: subcategorySelect.value,
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        subject: document.getElementById('subject').value.trim(),
        message: document.getElementById('message').value.trim(),
        source: sourceParam,
        dashboard: dashboardParam,
        page_url: window.location.href,
      };

      await submitContact(formData, currentUser);
      
      spamProtection.recordSubmission();

      form.reset();
      subcategoryGroup.classList.add('hidden');
      
      formStatus.className = 'form-success';
      formStatus.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Message sent! We'll get back to you soon.</span>
      `;
      formStatus.classList.remove('hidden');

    } catch (error) {
      const message = error.contactMessage || handleFormError(error, form);
      formStatus.className = 'form-error';
      formStatus.textContent = message;
      formStatus.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  });
});
