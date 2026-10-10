const BUSINESS_ADMIN_MANIFEST = {
  name: 'business-admin',
  basePath: '/business-admin',
  pages: [
    {
      id: 'index',
      path: '/business-admin/index.html',
      name: 'Dashboard',
      jsFile: 'js/dashboard.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public', 'churches', 'reviews'],
      criticalElements: ['#header', '#main', '#footer'],
      expectedLinks: [
        '/business-admin/edit-listing.html',
        '/business-admin/stats.html',
        '/business-admin/reviews.html'
      ]
    },
    {
      id: 'edit-listing',
      path: '/business-admin/edit-listing.html',
      name: 'Edit Listing',
      jsFile: 'js/edit-listing.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public', 'categories', 'churches'],
      criticalElements: ['#header', '#main'],
      hasImageUpload: true
    },
    {
      id: 'find-church',
      path: '/business-admin/find-church.html',
      name: 'Find Church',
      jsFile: 'js/find-church.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public', 'churches', 'business_affiliation_requests'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'promotions',
      path: '/business-admin/promotions.html',
      name: 'Promotions',
      jsFile: 'js/promotions.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      requiresPro: true,
      firestoreCollections: ['business_listings_public', 'promotions'],
      criticalElements: ['#header', '#main'],
      hasImageUpload: false
    },
    {
      id: 'products-services',
      path: '/business-admin/products-services.html',
      name: 'Products & Services',
      jsFile: 'js/products-services.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      requiresPro: true,
      firestoreCollections: ['business_listings_public', 'products_services'],
      criticalElements: ['#header', '#main'],
      hasImageUpload: false
    },
    {
      id: 'testimonials',
      path: '/business-admin/testimonials.html',
      name: 'Testimonials',
      jsFile: 'js/testimonials.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      requiresPro: true,
      firestoreCollections: ['business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'reviews',
      path: '/business-admin/reviews.html',
      name: 'Reviews',
      jsFile: 'js/reviews.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public', 'reviews'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'stats',
      path: '/business-admin/stats.html',
      name: 'Stats',
      jsFile: 'js/stats.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'questionnaire',
      path: '/business-admin/questionnaire.html',
      name: 'Questionnaire',
      jsFile: 'js/questionnaire.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'suggest-category',
      path: '/business-admin/suggest-category.html',
      name: 'Suggest Category',
      jsFile: 'js/suggest-category.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['category_suggestions'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'upgrade',
      path: '/business-admin/upgrade.html',
      name: 'Upgrade to Pro',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isStaticInfo: true
    },
    {
      id: 'pro-checkout',
      path: '/business-admin/pro_checkout.html',
      name: 'Pro Checkout',
      jsFile: 'js/pro-checkout.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: ['business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'pro-success',
      path: '/business-admin/pro_success.html',
      name: 'Pro Success',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isStaticInfo: true
    },
    {
      id: 'pro-cancel',
      path: '/business-admin/pro_cancel.html',
      name: 'Pro Cancel',
      jsFile: null,
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isStaticInfo: true
    },
    {
      id: 'user-manual',
      path: '/business-admin/user-manual.html',
      name: 'User Manual',
      jsFile: 'js/user-manual.js',
      requiresAuth: true,
      requiresRole: 'business_owner',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isDocumentation: true
    }
  ],
  sharedDependencies: [
    { file: 'js/header.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/footer.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/business-auth-guard.js', alternatives: ['js/auth-guard.js'], required: true }
  ],
  sharedStyles: [
    '/styles/layout.css',
    '/styles/theme.css',
    '/styles/buttons.css',
    '/styles/forms.css'
  ]
};

module.exports = { BUSINESS_ADMIN_MANIFEST };
