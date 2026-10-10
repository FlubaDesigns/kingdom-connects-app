module.exports = {
  name: 'marketing',
  admin: 'marketing',
  basePath: '/marketing-manager',
  authPattern: 'es-module',
  sharedDependencies: [
    { file: 'js/header.js', required: true },
    { file: 'js/footer.js', required: true }
  ],
  sharedStyles: [
    '/styles/layout.css',
    '/styles/theme.css',
    '/styles/buttons.css',
    '/styles/forms.css'
  ],
  pages: [
    {
      id: 'index',
      path: '/marketing-manager/index.html',
      name: 'Dashboard',
      jsFile: 'js/index.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: ['users', 'business_listings_public', 'payments', 'commission_ledger'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'analytics',
      path: '/marketing-manager/analytics.html',
      name: 'Analytics',
      jsFile: 'js/analytics.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: ['business_listings_public', 'payments', 'commission_ledger'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'reports',
      path: '/marketing-manager/reports.html',
      name: 'Reports',
      jsFile: 'js/reports.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: ['users', 'business_listings_public', 'churches', 'commission_ledger'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'team',
      path: '/marketing-manager/team.html',
      name: 'Team',
      jsFile: 'js/team.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: ['users', 'business_listings_public', 'commission_ledger'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'sales-applications',
      path: '/marketing-manager/sales-applications.html',
      name: 'Sales Applications',
      jsFile: 'js/sales-applications.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: ['users', 'sales_applications'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'documentation',
      path: '/marketing-manager/documentation.html',
      name: 'Documentation',
      jsFile: 'js/documentation.js',
      requiresAuth: true,
      requiresRole: 'marketing_manager',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    }
  ]
};
