/* Kingdom Connects - Public Pages Manifest for Nexus Health Checks */

module.exports = {
  id: 'public-pages',
  name: 'Public Pages',
  basePath: '/',
  authPattern: 'none',
  
  sharedDependencies: [],

  sharedStyles: [],

  globalIgnoreLinks: [
    '//www.gstatic.com',
    '//firestore.googleapis.com',
    '//qrgear.com'
  ],

  pages: [
    {
      id: 'home',
      path: '/index.html',
      name: 'Home',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'about',
      path: '/about.html',
      name: 'About',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'business-directory',
      path: '/business_directory.html',
      name: 'Business Directory',
      jsFile: 'js/business_directory.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'church-directory',
      path: '/church_directory.html',
      name: 'Church Directory',
      jsFile: 'js/church_directory.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    },
    {
      id: 'business-detail',
      path: '/business.html',
      name: 'Business Detail',
      jsFile: 'js/business.js',
      requiresAuth: false,
      firestoreCollections: ['business_listings_public'],
      criticalElements: ['#header', 'main']
    },
    {
      id: 'church-detail',
      path: '/church.html',
      name: 'Church Detail',
      jsFile: 'js/church.js',
      requiresAuth: false,
      firestoreCollections: ['churches'],
      criticalElements: ['#header', 'main']
    },
    {
      id: 'contact',
      path: '/contact.html',
      name: 'Contact',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'faq',
      path: '/faq.html',
      name: 'FAQ',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'for-agents',
      path: '/for-agents.html',
      name: 'For Agents',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'for-churches',
      path: '/for-churches.html',
      name: 'For Churches',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'for-businesses',
      path: '/for-businesses.html',
      name: 'For Businesses',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'pricing',
      path: '/pricing.html',
      name: 'Pricing',
      jsFile: 'js/pricing.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'login',
      path: '/login.html',
      name: 'Login',
      jsFile: 'js/login.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'signup',
      path: '/signup.html',
      name: 'Signup',
      jsFile: 'js/signup.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'forgot-password',
      path: '/forgot-password.html',
      name: 'Forgot Password',
      jsFile: 'js/forgot-password.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'privacy',
      path: '/privacy.html',
      name: 'Privacy Policy',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'terms',
      path: '/terms.html',
      name: 'Terms of Service',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'testimonials',
      path: '/testimonials.html',
      name: 'Testimonials',
      jsFile: 'js/testimonials.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header'],
      skipFirestoreCheck: true
    },
    {
      id: 'donate',
      path: '/donate.html',
      name: 'Donate',
      jsFile: 'js/donate.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'add-to-directory',
      path: '/add_to_directory.html',
      name: 'Add to Directory',
      jsFile: 'js/add_to_directory.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'business-onboarding',
      path: '/business-onboarding.html',
      name: 'Business Onboarding',
      jsFile: 'js/business-onboarding.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'church-onboarding',
      path: '/church-onboarding.html',
      name: 'Church Onboarding',
      jsFile: 'js/church-onboarding.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'join-sales-team',
      path: '/join-sales-team.html',
      name: 'Join Sales Team',
      jsFile: 'js/join-sales-team.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'submit-review',
      path: '/submit_review.html',
      name: 'Submit Review',
      jsFile: 'js/submit_review.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'submit-testimonial',
      path: '/submit_testimonial.html',
      name: 'Submit Testimonial',
      jsFile: 'js/submit_testimonial.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'welcome',
      path: '/welcome.html',
      name: 'Welcome',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'store',
      path: '/store.html',
      name: 'Store',
      jsFile: 'js/store.js',
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: '404',
      path: '/404.html',
      name: '404 Not Found',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: [],
      skipFirestoreCheck: true,
      ignoreLinks: ['/businesses.html', '/churches.html']
    },
    {
      id: 'thank-you-business',
      path: '/thank_you_business.html',
      name: 'Thank You (Business)',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'thank-you-church',
      path: '/thank_you_church.html',
      name: 'Thank You (Church)',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'thank-you-review',
      path: '/thank_you_review.html',
      name: 'Thank You (Review)',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', 'main'],
      skipFirestoreCheck: true
    },
    {
      id: 'demo',
      path: '/demo/index.html',
      name: 'Demo Mode',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header'],
      skipFirestoreCheck: true
    },
    {
      id: 'marketing-manual',
      path: '/marketing/user-manual.html',
      name: 'Marketing User Manual',
      jsFile: null,
      requiresAuth: false,
      firestoreCollections: [],
      criticalElements: ['#header', '#main'],
      skipFirestoreCheck: true
    }
  ]
};
