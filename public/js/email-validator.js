export function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

export function setupEmailValidation(inputElement) {
  if (!inputElement) return;

  const showError = (message) => {
    inputElement.setCustomValidity(message);
    inputElement.classList.add('error-border');
    
    let errorDiv = inputElement.nextElementSibling;
    if (!errorDiv || !errorDiv.classList.contains('email-error')) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'email-error';
      inputElement.parentNode.insertBefore(errorDiv, inputElement.nextSibling);
    }
    errorDiv.textContent = message;
  };

  const clearError = () => {
    inputElement.setCustomValidity('');
    inputElement.classList.remove('error-border');
    
    const errorDiv = inputElement.nextElementSibling;
    if (errorDiv && errorDiv.classList.contains('email-error')) {
      errorDiv.remove();
    }
  };

  inputElement.addEventListener('blur', () => {
    const email = inputElement.value.trim();
    
    if (!email) {
      clearError();
      return;
    }

    if (!validateEmail(email)) {
      showError('Please enter a valid email address (e.g., name@example.com)');
    } else {
      clearError();
    }
  });

  inputElement.addEventListener('input', () => {
    if (inputElement.value.trim() && validateEmail(inputElement.value.trim())) {
      clearError();
    }
  });
}
