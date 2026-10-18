(function() {
  function initFooter() {
    const footer = document.getElementById("footer");
    if (!footer) {
      setTimeout(initFooter, 50);
      return;
    }

    const path = window.location.pathname;
    
    const dashboardLinks = {
      '/admin': { name: 'Admin Dashboard', url: '/admin' },
      '/business-admin': { name: 'Business Dashboard', url: '/business-admin' },
      '/church-admin': { name: 'Church Dashboard', url: '/church-admin' },
      '/sales': { name: 'Sales Dashboard', url: '/sales' },
      '/marketing-manager': { name: 'Marketing Dashboard', url: '/marketing-manager' },
      '/member': { name: 'Member Admin', url: '/member' }
    };

    let dashboardLink = '';
    for (const [prefix, info] of Object.entries(dashboardLinks)) {
      if (path.startsWith(prefix)) {
        dashboardLink = `<a href="${info.url}">${info.name}</a>`;
        break;
      }
    }

    footer.innerHTML = `
      <footer class="site-footer">
        <div class="footer-inner">
          <nav class="footer-nav">
            ${dashboardLink}
            <a href="/about">About</a>
            <a href="/business_directory">Directory</a>
            <a href="/contact">Contact</a>
            <a href="/for-agents">Careers</a>
          </nav>
          <a class="back-to-top" href="#top">Back to top ↑</a>
          <small>Powered by <a href="https://flubadesigns.com/" target="_blank" rel="noopener noreferrer">Fluba Designs</a></small>
          <small>© ${new Date().getFullYear()} Kingdom Connects. All rights reserved.</small>
        </div>
      </footer>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooter);
  } else {
    initFooter();
  }
})();
