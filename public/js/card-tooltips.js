function toggleCardTooltip(icon) {
  const tooltip = icon.nextElementSibling;
  const isOpen = tooltip.classList.contains('show');
  
  document.querySelectorAll('.card-tooltip.show').forEach(t => {
    t.classList.remove('show', 'align-left', 'align-right');
  });
  
  if (!isOpen) {
    tooltip.classList.add('show');
    
    requestAnimationFrame(() => {
      const rect = tooltip.getBoundingClientRect();
      const vw = window.innerWidth;
      
      tooltip.classList.remove('align-left', 'align-right');
      
      if (rect.right > vw - 10) {
        tooltip.classList.add('align-left');
      } else if (rect.left < 10) {
        tooltip.classList.add('align-right');
      }
    });
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.card-help-icon') && !e.target.closest('.card-tooltip')) {
    document.querySelectorAll('.card-tooltip.show').forEach(t => {
      t.classList.remove('show', 'align-left', 'align-right');
    });
  }
});
