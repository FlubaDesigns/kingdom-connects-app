// Password visibility toggle utility
// Works with both auto-generated and pre-existing password toggle buttons

function initPasswordToggles() {
  // Handle pre-existing password toggle buttons (like in add_to_directory.html)
  const existingButtons = document.querySelectorAll('.password-toggle-btn');
  existingButtons.forEach(button => {
    const wrapper = button.closest('.password-field-wrapper');
    if (!wrapper) return;
    
    const field = wrapper.querySelector('input[type="password"], input[type="text"]');
    if (!field) return;
    
    // Eye-slash icon SVG (password hidden - you CAN'T see it)
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    
    // Eye icon SVG (password visible - you CAN see it)
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    
    // Attach click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (field.type === 'password') {
        field.type = 'text';
        button.innerHTML = eyeIcon;
        button.setAttribute('aria-label', 'Hide password');
      } else {
        field.type = 'password';
        button.innerHTML = eyeSlashIcon;
        button.setAttribute('aria-label', 'Show password');
      }
    });
  });
  
  // Handle bare password fields that need wrappers created (like login.html)
  const barePasswordFields = document.querySelectorAll('input[type="password"]');
  barePasswordFields.forEach(field => {
    // Skip if already wrapped
    if (field.closest('.password-field-wrapper')) return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'password-field-wrapper';
    
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);
    
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'password-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Show password');
    
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    
    toggleBtn.innerHTML = eyeSlashIcon;
    
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (field.type === 'password') {
        field.type = 'text';
        toggleBtn.innerHTML = eyeIcon;
        toggleBtn.setAttribute('aria-label', 'Hide password');
      } else {
        field.type = 'password';
        toggleBtn.innerHTML = eyeSlashIcon;
        toggleBtn.setAttribute('aria-label', 'Show password');
      }
    });
    
    wrapper.appendChild(toggleBtn);
  });
}

// Run immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPasswordToggles);
} else {
  initPasswordToggles();
}
