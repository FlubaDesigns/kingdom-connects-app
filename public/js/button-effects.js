/* Kingdom Connects - Button hover and click effects with auto-attachment */

function handleMouseOver(el) {
  el.classList.add('hovered');
}

function handleMouseOut(el) {
  el.classList.remove('hovered');
}

function handleClick(el) {
  el.classList.add('is-pressed');
  el.classList.remove('clicked');
  void el.offsetWidth;
  el.classList.add('clicked');
  setTimeout(() => el.classList.remove('is-pressed'), 140);
}

function attachButtonEffects(container = document) {
  const buttons = container.querySelectorAll('.btn, .action-button, button[type="submit"], .action-card, .login-btn');
  
  buttons.forEach(btn => {
    if (btn.dataset.effectsAttached) return;
    btn.dataset.effectsAttached = 'true';
    
    btn.addEventListener('mouseenter', () => handleMouseOver(btn));
    btn.addEventListener('mouseleave', () => handleMouseOut(btn));
    btn.addEventListener('click', () => handleClick(btn));
  });
}

function initButtonEffects() {
  attachButtonEffects(document);
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && (node.matches('.btn, .action-button, button[type="submit"], .action-card, .login-btn'))) {
            if (!node.dataset.effectsAttached) {
              node.dataset.effectsAttached = 'true';
              node.addEventListener('mouseenter', () => handleMouseOver(node));
              node.addEventListener('mouseleave', () => handleMouseOut(node));
              node.addEventListener('click', () => handleClick(node));
            }
          }
          attachButtonEffects(node);
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initButtonEffects);
} else {
  initButtonEffects();
}

window.handleMouseOver = handleMouseOver;
window.handleMouseOut = handleMouseOut;
window.handleClick = handleClick;
window.attachButtonEffects = attachButtonEffects;
