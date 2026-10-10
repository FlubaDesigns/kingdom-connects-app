/* Kingdom Connects - Help Tooltip System */
import { onReady } from './dom-ready.js';

function initHelpTooltips() {
  const helpIcons = document.querySelectorAll('.help-icon');
  let activeTooltip = null;

  helpIcons.forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Remove existing tooltip if any
      if (activeTooltip) {
        activeTooltip.remove();
        if (activeTooltip.helpIcon === icon) {
          activeTooltip = null;
          return;
        }
      }

      // Create tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'help-tooltip show';
      tooltip.textContent = icon.dataset.help;
      tooltip.helpIcon = icon;

      const wrapper = icon.closest('.field-help-wrapper');
      wrapper.appendChild(tooltip);
      activeTooltip = tooltip;

      // Position tooltip
      setTimeout(() => {
        const rect = icon.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Make sure tooltip doesn't go off screen
        if (tooltipRect.left < 10) {
          tooltip.style.left = '10px';
          tooltip.style.transform = 'none';
        }
        if (tooltipRect.right > window.innerWidth - 10) {
          tooltip.style.right = '10px';
          tooltip.style.left = 'auto';
          tooltip.style.transform = 'none';
        }
      }, 10);
    });
  });

  // Close tooltip when clicking outside
  document.addEventListener('click', () => {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  });
}

onReady(initHelpTooltips);
