/**
 * Kingdom Connects - Shared Utility Functions
 * Centralized helpers to avoid code duplication across forms
 */

/**
 * Password Validation
 * Validates password meets security requirements
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, checks: object, errors: array }
 */
export function validatePassword(password) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password)
  };
  
  const valid = checks.length && checks.uppercase && checks.number;
  const errors = [];
  
  if (!checks.length) errors.push('At least 8 characters');
  if (!checks.uppercase) errors.push('At least one uppercase letter');
  if (!checks.number) errors.push('At least one number');
  
  return { valid, checks, errors };
}

/**
 * Setup Password Validation UI
 * Attaches real-time validation feedback to password fields
 * Shows requirements in RED, turning GREEN as each is satisfied
 * @param {string} passwordInputId - ID of password input element
 * @param {string} requirementsId - ID of requirements display element
 */
export function setupPasswordValidation(passwordInputId, requirementsId) {
  const passwordInput = document.getElementById(passwordInputId);
  const passwordRequirements = document.getElementById(requirementsId);
  
  if (!passwordInput || !passwordRequirements) {
    console.warn(`setupPasswordValidation: Missing elements ${passwordInputId} or ${requirementsId}`);
    return;
  }
  
  // Function to update requirement display
  const updateRequirements = () => {
    const password = passwordInput.value;
    const result = validatePassword(password);
    
    passwordRequirements.innerHTML = `
      <div class="password-requirement ${result.checks.length ? 'met' : 'unmet'}">
        ${result.checks.length ? '✓' : '✗'} At least 8 characters
      </div>
      <div class="password-requirement ${result.checks.uppercase ? 'met' : 'unmet'}">
        ${result.checks.uppercase ? '✓' : '✗'} At least one uppercase letter (A-Z)
      </div>
      <div class="password-requirement ${result.checks.number ? 'met' : 'unmet'}">
        ${result.checks.number ? '✓' : '✗'} At least one number (0-9)
      </div>
    `;
    
    passwordRequirements.classList.remove('hidden');
  };
  
  // Show requirements on focus
  passwordInput.addEventListener('focus', updateRequirements);
  
  // Update as user types
  passwordInput.addEventListener('input', updateRequirements);
  
  // Hide when field loses focus and is empty
  passwordInput.addEventListener('blur', () => {
    if (passwordInput.value.length === 0) {
      passwordRequirements.classList.add('hidden');
    }
  });
}

/**
 * Setup Confirm Password Validation
 * Validates password confirmation matches original password
 * @param {string} passwordInputId - ID of password input
 * @param {string} confirmPasswordInputId - ID of confirm password input
 * @param {string} errorElementId - ID of error message element
 */
export function setupConfirmPasswordValidation(passwordInputId, confirmPasswordInputId, errorElementId) {
  const passwordInput = document.getElementById(passwordInputId);
  const confirmPasswordInput = document.getElementById(confirmPasswordInputId);
  const confirmPasswordError = document.getElementById(errorElementId);
  
  if (!confirmPasswordInput || !confirmPasswordError) {
    console.warn(`setupConfirmPasswordValidation: Missing elements`);
    return;
  }
  
  confirmPasswordInput.addEventListener('input', () => {
    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = confirmPasswordInput.value;
    
    if (confirmPassword.length === 0) {
      confirmPasswordError.classList.add('hidden');
      return;
    }
    
    if (password !== confirmPassword) {
      confirmPasswordError.textContent = '✗ Passwords do not match';
      confirmPasswordError.classList.remove('hidden');
    } else {
      confirmPasswordError.classList.add('hidden');
    }
  });
}

/**
 * Show Status Message
 * Displays a status message with appropriate styling
 * @param {HTMLElement} element - Element to display message in
 * @param {string} message - Message text
 * @param {string} type - Message type: 'pending', 'success', 'error'
 */
export function showStatusMessage(element, message, type = 'pending') {
  if (!element) {
    console.warn('showStatusMessage: No element provided');
    return;
  }
  
  // Remove all status classes
  element.classList.remove('status-pending', 'status-success', 'status-error', 'hidden');
  
  // Add appropriate class
  element.classList.add(`status-${type}`);
  element.textContent = message;
}

/**
 * Show Toast Notification
 * Displays a friendly, temporary message that auto-dismisses
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 * @param {number} duration - How long to show (ms), default 3000
 */
export function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background:${type === 'success' ? '#2d5016' : type === 'error' ? '#8b1a1a' : '#1a3a5c'};
    color:#fff;padding:12px 24px;border-radius:8px;margin-top:8px;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:14px;text-align:center;
    animation:toastIn 0.3s ease;
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Hide Element
 * Utility to hide an element by adding 'hidden' class
 * @param {HTMLElement|string} elementOrId - Element or element ID
 */
export function hideElement(elementOrId) {
  const element = typeof elementOrId === 'string' 
    ? document.getElementById(elementOrId) 
    : elementOrId;
    
  if (element) {
    element.classList.add('hidden');
  }
}

/**
 * Show Element
 * Utility to show an element by removing 'hidden' class
 * @param {HTMLElement|string} elementOrId - Element or element ID
 */
export function showElement(elementOrId) {
  const element = typeof elementOrId === 'string' 
    ? document.getElementById(elementOrId) 
    : elementOrId;
    
  if (element) {
    element.classList.remove('hidden');
  }
}

/**
 * Toggle Element Visibility
 * Shows or hides element based on condition
 * @param {HTMLElement|string} elementOrId - Element or element ID
 * @param {boolean} show - True to show, false to hide
 */
export function toggleElement(elementOrId, show) {
  if (show) {
    showElement(elementOrId);
  } else {
    hideElement(elementOrId);
  }
}

/**
 * Escape HTML
 * Prevents XSS by escaping HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

/**
 * Format Phone Number
 * Formats phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
}

/**
 * Debounce Function
 * Delays function execution until after wait time has elapsed since last call
 * @param {function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {function} - Debounced function
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Get URL Parameter
 * Retrieves query parameter value from current URL
 * @param {string} name - Parameter name
 * @returns {string|null} - Parameter value or null
 */
export function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

/**
 * Redirect After Delay
 * Redirects to URL after specified delay
 * @param {string} url - URL to redirect to
 * @param {number} delay - Delay in milliseconds (default 2000)
 */
export function redirectAfterDelay(url, delay = 2000) {
  setTimeout(() => {
    window.location.href = url;
  }, delay);
}

/**
 * Setup Phone Formatting
 * Automatically formats phone number input as user types (###-###-####)
 * @param {string|HTMLElement} inputElement - Phone input element or ID
 */
export function setupPhoneFormatting(inputElement) {
  const phoneInput = typeof inputElement === 'string' 
    ? document.getElementById(inputElement) 
    : inputElement;
  
  if (!phoneInput) return;
  
  phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) value = value.slice(0, 10);
    
    if (value.length >= 6) {
      e.target.value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6);
    } else if (value.length >= 3) {
      e.target.value = value.slice(0, 3) + '-' + value.slice(3);
    } else {
      e.target.value = value;
    }
  });
}

/**
 * Setup All Phone Inputs
 * Automatically applies phone formatting to all phone inputs on the page
 */
export function setupAllPhoneInputs() {
  const phoneInputs = document.querySelectorAll('input[type="tel"], input[id*="phone" i]');
  phoneInputs.forEach(input => setupPhoneFormatting(input));
}

// Make showToast globally available for non-module scripts
window.showToast = showToast;

/**
 * Show Confirmation Dialog
 * Modern confirmation dialog that replaces browser confirm()
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} confirmText - Confirm button text (default: 'Delete')
 * @param {string} type - Dialog type: 'danger', 'warning', 'info'
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function showConfirmDialog(title, message, confirmText = 'Delete', type = 'danger') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-gold' : type === 'success' ? 'btn-success' : 'btn-secondary';
    
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-message">${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">Cancel</button>
          <button class="btn ${btnClass} confirm-ok">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    
    const cleanup = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(false));
    overlay.querySelector('.confirm-ok').addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}
window.showConfirmDialog = showConfirmDialog;

/**
 * Show Success Animation
 * Brief visual feedback when an action completes
 * @param {string} message - Success message
 */
export function showSuccessAnimation(message = 'Saved!') {
  const anim = document.createElement('div');
  anim.className = 'success-animation';
  anim.innerHTML = `
    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
    <span>${message}</span>
  `;
  document.body.appendChild(anim);
  requestAnimationFrame(() => anim.classList.add('active'));
  
  setTimeout(() => {
    anim.classList.remove('active');
    setTimeout(() => anim.remove(), 300);
  }, 1500);
}
window.showSuccessAnimation = showSuccessAnimation;

/**
 * Create Empty State HTML
 * Generates consistent empty state messaging
 * @param {string} icon - SVG icon name or emoji
 * @param {string} title - Empty state title
 * @param {string} message - Helpful message
 * @param {string} actionText - Optional action button text
 * @param {string} actionHref - Optional action button href
 * @returns {string} - HTML string
 */
export function createEmptyState(icon, title, message, actionText = '', actionHref = '') {
  const iconHtml = icon.startsWith('<') ? icon : `<span class="empty-icon">${icon}</span>`;
  const actionHtml = actionText ? `<a href="${actionHref}" class="btn btn-gold">${actionText}</a>` : '';
  
  return `
    <div class="empty-state">
      ${iconHtml}
      <h3 class="empty-title">${title}</h3>
      <p class="empty-message">${message}</p>
      ${actionHtml}
    </div>
  `;
}
window.createEmptyState = createEmptyState;

/**
 * Show Options Dialog
 * A modal dialog with radio button options for user selection
 * @param {string} title - Dialog title
 * @param {string} message - Description message
 * @param {Array} options - Array of {value, label, description?} objects
 * @param {string} confirmText - Confirm button text
 * @param {string} type - Button type: 'success', 'warning', 'danger'
 * @returns {Promise<string|null>} - Selected option value or null if cancelled
 */
export function showOptionsDialog(title, message, options, confirmText = 'Confirm', type = 'success') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-gold' : type === 'success' ? 'btn-success' : 'btn-secondary';
    
    const optionsHtml = options.map((opt, i) => `
      <label class="option-radio">
        <input type="radio" name="dialog-option" value="${opt.value}" ${i === 0 ? 'checked' : ''}>
        <span class="option-label">${opt.label}</span>
        ${opt.description ? `<span class="option-desc">${opt.description}</span>` : ''}
      </label>
    `).join('');
    
    overlay.innerHTML = `
      <div class="confirm-dialog options-dialog">
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-message">${message}</p>
        <div class="options-list">
          ${optionsHtml}
        </div>
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">Cancel</button>
          <button class="btn ${btnClass} confirm-ok">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    
    const cleanup = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(null));
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
      const selected = overlay.querySelector('input[name="dialog-option"]:checked');
      cleanup(selected ? selected.value : null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
  });
}
window.showOptionsDialog = showOptionsDialog;

/**
 * Show Input Dialog
 * A modal dialog with a text input or textarea for user input
 * @param {string} title - Dialog title
 * @param {string} message - Description message
 * @param {string} defaultValue - Default value for the input
 * @param {Object} options - Options: {placeholder, multiline, confirmText, type}
 * @returns {Promise<string|null>} - Input value or null if cancelled
 */
export function showInputDialog(title, message, defaultValue = '', options = {}) {
  const { placeholder = '', multiline = false, confirmText = 'Save', type = 'success' } = options;
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-gold' : type === 'success' ? 'btn-success' : 'btn-secondary';
    
    const inputHtml = multiline 
      ? `<textarea class="input-dialog-field" placeholder="${placeholder}" rows="4">${defaultValue}</textarea>`
      : `<input type="text" class="input-dialog-field" placeholder="${placeholder}" value="${defaultValue}">`;
    
    overlay.innerHTML = `
      <div class="confirm-dialog input-dialog">
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-message">${message}</p>
        ${inputHtml}
        <div class="confirm-actions">
          <button class="btn btn-secondary confirm-cancel">Cancel</button>
          <button class="btn ${btnClass} confirm-ok">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      overlay.querySelector('.input-dialog-field').focus();
    });
    
    const cleanup = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    
    const inputField = overlay.querySelector('.input-dialog-field');
    
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(null));
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
      cleanup(inputField.value);
    });
    
    if (!multiline) {
      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cleanup(inputField.value);
        if (e.key === 'Escape') cleanup(null);
      });
    }
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
  });
}
window.showInputDialog = showInputDialog;

/**
 * Setup Pull to Refresh
 * Adds mobile pull-to-refresh functionality to a page
 * @param {function} refreshCallback - Function to call when refresh is triggered
 */
export function setupPullToRefresh(refreshCallback) {
  let startY = 0;
  let pulling = false;
  const threshold = 80;
  
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator';
  indicator.innerHTML = '<div class="pull-refresh-spinner"></div><span>Pull to refresh</span>';
  document.body.prepend(indicator);
  
  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].pageY;
      pulling = true;
    }
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const pullDistance = e.touches[0].pageY - startY;
    
    if (pullDistance > 0 && pullDistance < threshold * 2) {
      indicator.style.transform = `translateY(${Math.min(pullDistance, threshold)}px)`;
      indicator.classList.toggle('ready', pullDistance > threshold);
    }
  }, { passive: true });
  
  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    
    if (indicator.classList.contains('ready')) {
      indicator.classList.add('refreshing');
      indicator.querySelector('span').textContent = 'Refreshing...';
      
      try {
        await refreshCallback();
      } catch (e) {
        console.error('Refresh failed:', e);
      }
      
      indicator.classList.remove('refreshing', 'ready');
      indicator.querySelector('span').textContent = 'Pull to refresh';
    }
    
    indicator.style.transform = '';
  });
}
window.setupPullToRefresh = setupPullToRefresh;

/**
 * Show Loading Skeleton
 * Displays skeleton loading placeholders
 * @param {HTMLElement} container - Container to show skeletons in
 * @param {number} count - Number of skeleton cards to show
 */
export function showLoadingSkeleton(container, count = 3) {
  if (!container) return;
  
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-header">
          <div class="skeleton-title"></div>
          <div class="skeleton-badge"></div>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}
window.showLoadingSkeleton = showLoadingSkeleton;

/**
 * Setup Inline Validation
 * Adds real-time validation feedback to form fields
 * @param {HTMLFormElement} form - Form element to validate
 */
export function setupInlineValidation(form) {
  if (!form) return;
  
  const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
  
  inputs.forEach(input => {
    input.addEventListener('blur', () => validateField(input));
    input.addEventListener('input', () => {
      if (input.classList.contains('input-error')) {
        validateField(input);
      }
    });
  });
  
  function validateField(input) {
    const isValid = input.checkValidity();
    const errorEl = input.parentElement.querySelector('.field-error');
    
    input.classList.toggle('input-error', !isValid);
    input.classList.toggle('input-valid', isValid && input.value);
    
    if (!isValid && !errorEl) {
      const error = document.createElement('span');
      error.className = 'field-error';
      error.textContent = input.validationMessage || 'This field is required';
      input.parentElement.appendChild(error);
    } else if (isValid && errorEl) {
      errorEl.remove();
    } else if (errorEl) {
      errorEl.textContent = input.validationMessage || 'This field is required';
    }
  }
}
window.setupInlineValidation = setupInlineValidation;
