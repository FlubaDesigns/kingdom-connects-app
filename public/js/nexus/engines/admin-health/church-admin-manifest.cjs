const CHURCH_ADMIN_MANIFEST = {
  name: 'church-admin',
  basePath: '/church-admin',
  pages: [
    {
      id: 'index',
      path: '/church-admin/index.html',
      name: 'Dashboard',
      jsFile: 'js/dashboard.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'users', 'business_listings_public'],
      criticalElements: ['#header', '#main', '#footer'],
      expectedLinks: [
        '/church-admin/profile.html',
        '/church-admin/activities.html',
        '/church-admin/events.html',
        '/church-admin/businesses.html'
      ]
    },
    {
      id: 'profile',
      path: '/church-admin/profile.html',
      name: 'Church Profile',
      jsFile: 'js/profile.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches'],
      criticalElements: ['#churchForm', '#header'],
      hasImageUpload: true,
      hasVideoUpload: false,
      ignoreLinks: ['/admin/contact.html']
    },
    {
      id: 'activities',
      path: '/church-admin/activities.html',
      name: 'Activities',
      jsFile: 'js/activities.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'church_activities'],
      criticalElements: ['#activitiesList', '#activityModal'],
      hasImageUpload: true,
      hasVideoUpload: true
    },
    {
      id: 'events',
      path: '/church-admin/events.html',
      name: 'Events',
      jsFile: 'js/events.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'events'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'announcements',
      path: '/church-admin/announcements.html',
      name: 'Announcements',
      jsFile: 'js/announcements.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'announcements'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'businesses',
      path: '/church-admin/businesses.html',
      name: 'Affiliated Businesses',
      jsFile: 'js/businesses.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'business_listings_public'],
      criticalElements: ['#businessList', '#contentArea']
    },
    {
      id: 'periodic-message',
      path: '/church-admin/periodic-message.html',
      name: 'Periodic Messages',
      jsFile: 'js/periodic-message.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'church_messages'],
      criticalElements: ['#header', '#main'],
      hasImageUpload: true
    },
    {
      id: 'analytics',
      path: '/church-admin/analytics.html',
      name: 'Analytics',
      jsFile: 'js/analytics.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'business_listings_public', 'pricing_settings'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'church-insights',
      path: '/church-admin/church-insights.html',
      name: 'Church Insights',
      jsFile: 'js/church-insights.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'page-settings',
      path: '/church-admin/page-settings.html',
      name: 'Page Settings',
      jsFile: 'js/page-settings.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'tithings',
      path: '/church-admin/tithings.html',
      name: 'Tithings',
      jsFile: 'js/tithings.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: ['churches', 'commission_ledger', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'user-manual',
      path: '/church-admin/user-manual.html',
      name: 'User Manual',
      jsFile: 'js/user-manual.js',
      requiresAuth: true,
      requiresRole: 'church_admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isDocumentation: true
    }
  ],
  sharedDependencies: [
    { file: 'js/header.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/footer.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/church-auth-guard.js', required: true }
  ],
  sharedStyles: [
    '/styles/layout.css',
    '/styles/theme.css',
    '/styles/buttons.css',
    '/styles/forms.css'
  ]
};

module.exports = { CHURCH_ADMIN_MANIFEST };
