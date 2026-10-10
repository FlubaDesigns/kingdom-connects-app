import { validateEmail } from "./email-validator.js";
import { initSpamProtection, validateSpamProtection } from "./utils/spam-protection.js";

export { initSpamProtection, validateSpamProtection };

export function validateForm(formElement, options = {}) {
  const {
    onSuccess = null,
    onError = null,
    showInlineErrors = true
  } = options;

  let isValid = true;
  const errors = [];

  clearAllErrors(formElement);

  const requiredFields = formElement.querySelectorAll('[required]');
  
  requiredFields.forEach(field => {
    // Skip validation for fields that are not visible
    // offsetParent is null for hidden elements (display:none or visibility:hidden ancestors)
    if (!field.offsetParent && field.type !== 'hidden') {
      return;
    }
    
    // Skip fields in inactive wizard steps
    const wizardStep = field.closest('.form-step');
    if (wizardStep && !wizardStep.classList.contains('active')) {
      return;
    }
    
    // Skip fields in hidden sections
    const section = field.closest('[id$="Section"]');
    if (section && section.classList.contains('hidden')) {
      return;
    }
    const value = field.value.trim();
    const fieldName = field.getAttribute('id') || field.getAttribute('name') || 'Field';
    const label = formElement.querySelector(`label[for="${field.id}"]`)?.textContent || fieldName;

    if (!value) {
      isValid = false;
      const errorMsg = `${label.replace('*', '').trim()} is required`;
      errors.push(errorMsg);
      
      if (showInlineErrors) {
        showFieldError(field, errorMsg);
      }
      return;
    }

    if (field.type === 'email' && !validateEmail(value)) {
      isValid = false;
      const errorMsg = 'Please enter a valid email address';
      errors.push(errorMsg);
      
      if (showInlineErrors) {
        showFieldError(field, errorMsg);
      }
      return;
    }

    if (field.hasAttribute('pattern')) {
      const pattern = new RegExp(field.getAttribute('pattern'));
      if (!pattern.test(value)) {
        isValid = false;
        const errorMsg = field.getAttribute('title') || `${label} format is invalid`;
        errors.push(errorMsg);
        
        if (showInlineErrors) {
          showFieldError(field, errorMsg);
        }
        return;
      }
    }

    if (field.type === 'url' && value) {
      try {
        new URL(value);
      } catch {
        isValid = false;
        const errorMsg = 'Please enter a valid URL';
        errors.push(errorMsg);
        
        if (showInlineErrors) {
          showFieldError(field, errorMsg);
        }
      }
    }
  });

  if (isValid && onSuccess) {
    onSuccess();
  } else if (!isValid && onError) {
    onError(errors);
  }

  return { isValid, errors };
}

function showFieldError(field, message) {
  field.classList.add('error-border');
  field.setAttribute('aria-invalid', 'true');
  
  let errorDiv = field.nextElementSibling;
  if (!errorDiv || !errorDiv.classList.contains('field-error')) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    field.parentNode.insertBefore(errorDiv, field.nextSibling);
  }
  errorDiv.textContent = message;
  
  field.addEventListener('input', () => clearFieldError(field), { once: true });
}

function clearFieldError(field) {
  field.classList.remove('error-border');
  field.removeAttribute('aria-invalid');
  
  const errorDiv = field.nextElementSibling;
  if (errorDiv && errorDiv.classList.contains('field-error')) {
    errorDiv.remove();
  }
}

function clearAllErrors(formElement) {
  const errorDivs = formElement.querySelectorAll('.field-error');
  errorDivs.forEach(div => div.remove());
  
  const fields = formElement.querySelectorAll('[aria-invalid]');
  fields.forEach(field => {
    field.classList.remove('error-border');
    field.removeAttribute('aria-invalid');
  });
}

export function setupFormValidation(formElement, onSubmitCallback) {
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('📋 Form submit event triggered');
    
    // Get submit button and add immediate loading state
    const submitBtn = formElement.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    
    // Immediate feedback - button changes right away
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Validating...';
      submitBtn.classList.add('btn-loading');
    }
    
    const validation = validateForm(formElement);
    
    if (validation.isValid) {
      // Update button for processing
      if (submitBtn) {
        submitBtn.textContent = 'Processing...';
      }
      
      try {
        if (onSubmitCallback) {
          await onSubmitCallback(e);
        }
      } finally {
        // Re-enable button after submission completes (success or error)
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          submitBtn.classList.remove('btn-loading');
        }
      }
    } else {
      // Re-enable button on validation failure
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        submitBtn.classList.remove('btn-loading');
      }
      
      // Show validation error summary
      const statusDiv = document.getElementById('statusMessage');
      if (statusDiv) {
        statusDiv.textContent = `Please fix the following errors: ${validation.errors.join(', ')}`;
        statusDiv.classList.remove('hidden', 'status-success', 'status-pending');
        statusDiv.classList.add('status-error');
      }
      
      const firstError = formElement.querySelector('[aria-invalid]');
      if (firstError) {
        firstError.focus();
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}
