/* Kingdom Connects - Platform Admin Manifest for Nexus Health Checks */

module.exports = {
  id: 'platform-admin',
  name: 'Platform Admin',
  basePath: '/admin',
  authPattern: 'es-module',
  
  sharedDependencies: [],
  sharedStyles: [],
  globalIgnoreLinks: [],

  pages: [
    {
      id: 'todo', path: '/admin/todo.html', name: 'To-Do List',
      jsFile: 'js/todo.js', requiresAuth: true, requiresRole: 'admin',
      firestoreCollections: ['admin_tasks'], criticalElements: ['#header', '#main', '#taskList']
    },
    {
      id: 'dashboard',
      path: '/admin/index.html',
      name: 'Dashboard',
      jsFile: 'js/dashboard.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'activity-log',
      path: '/admin/activity_log.html',
      name: 'Activity Log',
      jsFile: 'js/activity_log.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'analytics',
      path: '/admin/analytics.html',
      name: 'Analytics',
      jsFile: 'js/analytics.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'businesses',
      path: '/admin/businesses.html',
      name: 'Businesses',
      jsFile: 'js/businesses.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'business-insights',
      path: '/admin/business-insights.html',
      name: 'Business Insights',
      jsFile: 'js/business-insights.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'categories',
      path: '/admin/categories.html',
      name: 'Categories',
      jsFile: 'js/categories.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'churches',
      path: '/admin/churches.html',
      name: 'Churches',
      jsFile: 'js/churches.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'church-insights',
      path: '/admin/church-insights.html',
      name: 'Church Insights',
      jsFile: 'js/church-insights.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'church-questionnaire',
      path: '/admin/church-questionnaire.html',
      name: 'Church Questionnaire',
      jsFile: 'js/church-questionnaire.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'commission-settings',
      path: '/admin/commission-settings.html',
      name: 'Commission Settings',
      jsFile: 'js/commission-settings.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'demo-invitations',
      path: '/admin/demo-invitations.html',
      name: 'Demo Invitations',
      jsFile: 'js/demo-invitations.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'donations',
      path: '/admin/donations.html',
      name: 'Donations',
      jsFile: 'js/donations.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true,
      ignoreLinks: ['/styles/admin/styles.css']
    },
    {
      id: 'email-campaigns',
      path: '/admin/email-campaigns.html',
      name: 'Email Campaigns',
      jsFile: 'js/email-campaigns.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'email-templates',
      path: '/admin/email-templates.html',
      name: 'Email Templates',
      jsFile: 'js/email-templates.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'add-affiliation-templates',
      path: '/admin/add-affiliation-templates.html',
      name: 'Affiliation Templates',
      jsFile: 'js/add-affiliation-templates.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'add-category-email-templates',
      path: '/admin/add-category-email-templates.html',
      name: 'Category Email Templates',
      jsFile: 'js/add-category-email-templates.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'factoids',
      path: '/admin/factoids.html',
      name: 'Factoids',
      jsFile: 'js/factoids.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'management',
      path: '/admin/management.html',
      name: 'Management',
      jsFile: 'js/management.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'manual-editor',
      path: '/admin/manual-editor.html',
      name: 'Manual Editor',
      jsFile: 'js/manual-editor.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'members',
      path: '/admin/members.html',
      name: 'Members',
      jsFile: 'js/members.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'payments',
      path: '/admin/payments.html',
      name: 'Payments',
      jsFile: 'js/payments.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'presentations',
      path: '/admin/presentations.html',
      name: 'Presentations',
      jsFile: 'js/presentations.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header'],
      skipFirestoreCheck: true
    },
    {
      id: 'pricing-settings',
      path: '/admin/pricing-settings.html',
      name: 'Pricing Settings',
      jsFile: 'js/pricing-settings.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'questionnaire-manager',
      path: '/admin/questionnaire-manager.html',
      name: 'Questionnaire Manager',
      jsFile: 'js/questionnaire-manager.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'review-moderation',
      path: '/admin/review_moderation.html',
      name: 'Review Moderation',
      jsFile: 'js/review_moderation.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'sales-directors',
      path: '/admin/sales-directors.html',
      name: 'Sales Directors',
      jsFile: 'js/sales-directors.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'settings',
      path: '/admin/settings.html',
      name: 'Settings',
      jsFile: 'js/settings.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'social-sharing',
      path: '/admin/social-sharing.html',
      name: 'Social Sharing',
      jsFile: 'js/social-sharing.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'testimonials',
      path: '/admin/testimonials.html',
      name: 'Testimonials',
      jsFile: 'js/testimonials.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'tools-dashboard',
      path: '/admin/tools/index.html',
      name: 'Tools Dashboard',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header'],
      skipFirestoreCheck: true
    },
    {
      id: 'nexus',
      path: '/admin/tools/nexus.html',
      name: 'Nexus Dashboard',
      jsFile: 'js/nexus-dashboard.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header'],
      skipFirestoreCheck: true
    },
    {
      id: 'storage-manager',
      path: '/admin/tools/storage-manager.html',
      name: 'Storage Manager',
      jsFile: 'js/storage-manager.js',
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true,
      ignoreLinks: ['${f.url}']
    },
    {
      id: 'upload-test',
      path: '/admin/tools/upload-test.html',
      name: 'Upload Test',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: [],
      skipFirestoreCheck: true
    },
    {
      id: 'upload-auto-test',
      path: '/admin/tools/upload-auto-test.html',
      name: 'Upload Auto Test',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: [],
      skipFirestoreCheck: true
    },
    {
      id: 'upload-autorun',
      path: '/admin/tools/upload-autorun.html',
      name: 'Upload Autorun',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'admin',
      firestoreCollections: [],
      criticalElements: [],
      skipFirestoreCheck: true
    }
  ]
};
