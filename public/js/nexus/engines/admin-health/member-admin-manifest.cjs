const MEMBER_ADMIN_MANIFEST = {
  name: 'member',
  basePath: '/member',
  pages: [
    {
      id: 'index',
      path: '/member/index.html',
      name: 'Dashboard',
      jsFile: 'js/member-dashboard.js',
      requiresAuth: true,
      requiresRole: 'member',
      firestoreCollections: ['users', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'favorites',
      path: '/member/favorites.html',
      name: 'Favorites',
      jsFile: 'js/favorites.js',
      requiresAuth: true,
      requiresRole: 'member',
      firestoreCollections: ['favorite_businesses', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'reviews',
      path: '/member/reviews.html',
      name: 'Reviews',
      jsFile: 'js/reviews.js',
      requiresAuth: true,
      requiresRole: 'member',
      firestoreCollections: ['reviews', 'business_listings_public'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'settings',
      path: '/member/settings.html',
      name: 'Settings',
      jsFile: 'js/member-settings.js',
      requiresAuth: true,
      requiresRole: 'member',
      firestoreCollections: ['users'],
      criticalElements: ['#header', '#main']
    },
    {
      id: 'user-manual',
      path: '/member/user-manual.html',
      name: 'User Manual',
      jsFile: 'js/user-manual.js',
      requiresAuth: true,
      requiresRole: 'member',
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      isDocumentation: true
    }
  ],
  sharedDependencies: [
    { file: 'js/header.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/footer.js', alternatives: ['js/components.js', '/js/components.js'], required: true },
    { file: 'js/member-auth-guard.js', required: true }
  ],
  sharedStyles: [
    '/styles/layout.css',
    '/styles/theme.css',
    '/styles/buttons.css',
    '/styles/forms.css'
  ]
};

module.exports = { MEMBER_ADMIN_MANIFEST };
