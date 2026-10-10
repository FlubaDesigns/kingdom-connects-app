/* Kingdom Connects – breadcrumbs.js */
/* Auto-generates breadcrumbs based on page hierarchy */
(() => {
  const breadcrumbContainer = document.getElementById('breadcrumbs');
  if (!breadcrumbContainer) return;

  const path = window.location.pathname;
  const segments = path.split('/').filter(s => s && s !== 'index.html');
  const urlParams = new URLSearchParams(window.location.search);
  
  // Define dashboard section names
  const sectionNames = {
    'member': { label: 'Member Admin', home: '/member/index.html' },
    'business-admin': { label: 'Business Dashboard', home: '/business-admin/index.html' },
    'church-admin': { label: 'Church Dashboard', home: '/church-admin/index.html' },
    'sales': { label: 'Sales Admin', home: '/sales/index.html' },
    'sales-agent': { label: 'Sales Admin', home: '/sales/index.html' },
    'marketing-manager': { label: 'Marketing Dashboard', home: '/marketing-manager/index.html' },
    'admin': { label: 'Admin Dashboard', home: '/admin/index.html' }
  };

  // Dynamic breadcrumb labels for add_to_directory based on URL params
  function getAddToDirectoryLabel() {
    const role = urlParams.get('role');
    const tier = urlParams.get('tier');
    
    if (role === 'business' && tier === 'pro') return 'List Business (Pro)';
    if (role === 'business') return 'List Business';
    if (role === 'church') return 'Register Church';
    if (role === 'member') return 'Join as Member';
    return 'Join'; // Default when no role specified
  }

  // Define page friendly names
  const pageNames = {
    'index.html': 'Home',
    'business_directory.html': 'Businesses',
    'business.html': 'Business Details',
    'church_directory.html': 'Churches',
    'church.html': 'Church Details',
    'submit_review.html': 'Submit Review',
    'about.html': 'About',
    'contact.html': 'Contact',
    'faq.html': 'Help & FAQ',
    'privacy.html': 'Privacy Policy',
    'terms.html': 'Terms of Service',
    'login.html': 'Login',
    'search_businesses.html': 'Search Results',
    'favorites.html': 'My Favorites',
    'reviews.html': 'My Reviews',
    'profile.html': 'Profile',
    'settings.html': 'Settings',
    'edit-listing.html': 'Edit Listing',
    'upgrade.html': 'Upgrade',
    'pro_checkout.html': 'Pro Checkout',
    'questionnaire.html': 'Questionnaire',
    'suggest-category.html': 'Suggest Category',
    'page-builder.html': 'Page Builder',
    'periodic-message.html': 'Periodic Message',
    'tithings.html': 'Tithings',
    'activities.html': 'Activities',
    'church-insights.html': 'Church Insights',
    'business-insights.html': 'Business Insights',
    'businesses.html': 'Businesses',
    'churches.html': 'Churches',
    'categories.html': 'Categories',
    'payments.html': 'Payments',
    'management.html': 'User Management',
    'review_moderation.html': 'Review Moderation',
    'pricing-settings.html': 'Pricing',
    'commission-settings.html': 'Commissions',
    'email-campaigns.html': 'Email Campaigns',
    'factoids.html': 'Factoids',
    'testimonials.html': 'Testimonials',
    'reports.html': 'Reports',
    'team.html': 'Team',
    'leads.html': 'Leads',
    'pipeline.html': 'Pipeline',
    'sales-applications.html': 'Sales Applications'
  };

  // Build breadcrumb trail
  const breadcrumbs = [{ label: 'Home', url: '/' }];
  
  // Check if we're in a dashboard section
  const firstSegment = segments[0];
  const section = sectionNames[firstSegment];
  
  if (section) {
    // We're in a dashboard section
    const currentPage = segments[segments.length - 1] || 'index.html';
    const isHome = currentPage === 'index.html' || segments.length === 1;
    
    if (isHome) {
      // On the dashboard home
      breadcrumbs.push({ label: section.label, url: null });
    } else {
      // On a subpage within the dashboard
      breadcrumbs.push({ label: section.label, url: section.home });
      const pageName = pageNames[currentPage] || currentPage.replace('.html', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      breadcrumbs.push({ label: pageName, url: null });
    }
  } else {
    // Regular public page
    const currentPage = segments[segments.length - 1] || 'index.html';
    
    // Special handling for add_to_directory.html - use dynamic label based on URL params
    let pageName;
    if (currentPage === 'add_to_directory.html') {
      pageName = getAddToDirectoryLabel();
    } else {
      pageName = pageNames[currentPage] || currentPage.replace('.html', '').replace(/_/g, ' ');
    }
    
    // For detail pages with ID parameter, add intermediate level
    const hasId = urlParams.get('id') || urlParams.get('slug');
    
    if (currentPage === 'church.html' && hasId) {
      breadcrumbs.push({ label: 'Churches', url: '/church_directory.html' });
      breadcrumbs.push({ label: 'Church Details', url: null });
    } else if (currentPage === 'business.html' && hasId) {
      breadcrumbs.push({ label: 'Businesses', url: '/business_directory.html' });
      breadcrumbs.push({ label: 'Business Details', url: null });
    } else if (currentPage !== 'index.html') {
      breadcrumbs.push({ label: pageName, url: null });
    }
  }

  // Don't render text on homepage - keep container structure for consistent spacing
  if (path === '/' || path === '/index.html' || path === '') {
    breadcrumbContainer.innerHTML = '<nav class="breadcrumbs" aria-hidden="true">&nbsp;</nav>';
    return;
  }

  // Render breadcrumbs
  const html = breadcrumbs.map((crumb, index) => {
    const isLast = index === breadcrumbs.length - 1;
    
    if (isLast || !crumb.url) {
      return `<span class="current">${crumb.label}</span>`;
    } else {
      return `<a href="${crumb.url}">${crumb.label}</a><span class="separator">›</span>`;
    }
  }).join('');

  breadcrumbContainer.innerHTML = `<nav class="breadcrumbs" aria-label="Breadcrumb">${html}</nav>`;
})();
