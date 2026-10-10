function createFeedbackWidget() {
  const currentPath = window.location.pathname;
  let dashboard = 'unknown';
  
  if (currentPath.includes('/admin')) dashboard = 'admin';
  else if (currentPath.includes('/member')) dashboard = 'member';
  else if (currentPath.includes('/business-admin')) dashboard = 'business';
  else if (currentPath.includes('/church-admin')) dashboard = 'church';
  else if (currentPath.includes('/sales')) dashboard = 'sales';
  else if (currentPath.includes('/marketing-manager')) dashboard = 'marketing';

  const widget = document.createElement('div');
  widget.id = 'feedback-widget';
  widget.innerHTML = `
    <a href="/contact?source=widget&dashboard=${dashboard}" class="feedback-toggle" aria-label="Send Feedback" title="Send Feedback">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="8" width="16" height="12" rx="2" fill="#d4af37" stroke="#b8860b" stroke-width="1.5"/>
        <path d="M4 10 L12 15 L20 10" stroke="#b8860b" stroke-width="1.5" fill="none"/>
        <rect x="7" y="4" width="10" height="5" rx="1" fill="#b8860b"/>
        <path d="M9 6 L15 6" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </a>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #feedback-widget {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
    }
    .feedback-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
      border: 1px solid #d4af37;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      text-decoration: none;
    }
    .feedback-toggle:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(212,175,55,0.3);
      border-color: #ffd700;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(widget);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFeedbackWidget);
} else {
  createFeedbackWidget();
}

export { createFeedbackWidget };
