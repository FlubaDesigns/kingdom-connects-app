const SALES_ADMIN_MANIFEST = {
  name: 'sales',
  basePath: '/sales',
  pages: [
    {
      id: 'index',
      path: '/sales/index.html',
      name: 'Dashboard',
      jsFile: 'js/dashboard.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: ['users', 'business_listings_public', 'commission_ledger'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'agents',
      path: '/sales/agents.html',
      name: 'Agents',
      jsFile: 'js/agents.js',
      requiresAuth: true,
      requiresRole: 'sales_director',
      firestoreCollections: ['commissions'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'commissions',
      path: '/sales/commissions.html',
      name: 'Commissions',
      jsFile: 'js/commissions.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: ['commission_ledger', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'conversions',
      path: '/sales/conversions.html',
      name: 'Conversions',
      jsFile: 'js/conversions.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: ['commissions'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'director-commissions',
      path: '/sales/director-commissions.html',
      name: 'Director Commissions',
      jsFile: 'js/director-commissions.js',
      requiresAuth: true,
      requiresRole: 'sales_director',
      firestoreCollections: ['users', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'onboarding',
      path: '/sales/onboarding.html',
      name: 'Stripe Onboarding',
      jsFile: 'js/onboarding.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'referrals',
      path: '/sales/referrals.html',
      name: 'Referrals',
      jsFile: 'js/referrals.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: ['commissions', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'user-manual',
      path: '/sales/user-manual.html',
      name: 'User Manual',
      jsFile: 'js/user-manual.js',
      requiresAuth: true,
      requiresRole: 'sales_agent',
      firestoreCollections: ['pricing_settings', 'commission_policies', 'public_manuals'],
      criticalElements: ['#header', '#main'],
      isDocumentation: true
    }
  ],
  sharedDependencies: [
    { file: 'js/header.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/footer.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/sales-auth-guard.js', required: true }
  ],
  sharedStyles: [
    '/styles/layout.css',
    '/styles/theme.css',
    '/styles/buttons.css',
    '/styles/forms.css'
  ]
};

module.exports = { SALES_ADMIN_MANIFEST };
