const HEALTH_CHECK_CRITERIA = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  
  description: 'Deep health checking criteria for Kingdom Connects admin dashboards',
  
  checks: [
    {
      id: 'auth-guard',
      name: 'Authentication Guard',
      description: 'Verifies page has auth guard script to protect against unauthorized access',
      severity: 'critical',
      pattern: 'Script tag with auth-guard.js (e.g., member-auth-guard.js, church-auth-guard.js)',
      autoRepair: true,
      repairAction: 'Add missing auth guard script before </body>'
    },
    {
      id: 'page-ready',
      name: 'Page Ready Signal',
      description: 'Checks for pageFullyLoaded flag that signals page initialization complete',
      severity: 'warning',
      pattern: 'window.pageFullyLoaded = true in main JS file',
      autoRepair: true,
      repairAction: 'Append pageFullyLoaded signal to end of main JS'
    },
    {
      id: 'firestore-collection',
      name: 'Firestore Collection References',
      description: 'Validates JS code references correct Firestore collections as defined in manifest',
      severity: 'error',
      pattern: 'collection(db, "collectionName") or doc(db, "collectionName", id)',
      autoRepair: false,
      note: 'Also recognizes subcollections like churches/${id}/events and template literals'
    },
    {
      id: 'shared-scripts',
      name: 'Shared Script Dependencies',
      description: 'Ensures required shared scripts (header.js, footer.js, etc.) are loaded',
      severity: 'error',
      pattern: '<script> tags referencing shared dependencies from manifest',
      autoRepair: true,
      repairAction: 'Add missing shared script imports',
      alternatives: 'Some pages use components.js as alternative to header.js/footer.js'
    },
    {
      id: 'shared-styles',
      name: 'Shared CSS Dependencies',
      description: 'Verifies required stylesheets are linked (layout.css, theme.css, etc.)',
      severity: 'warning',
      pattern: '<link rel="stylesheet"> tags for core CSS files',
      autoRepair: false
    },
    {
      id: 'critical-elements',
      name: 'Critical HTML Elements',
      description: 'Checks for presence of critical DOM elements defined in manifest',
      severity: 'error',
      pattern: 'Elements matching selectors like #header, #main, .content',
      autoRepair: false
    },
    {
      id: 'external-deps',
      name: 'External Dependency Hardening',
      description: 'Validates external scripts have fallback/error handling',
      severity: 'warning',
      pattern: 'onerror handlers on external CDN scripts',
      autoRepair: true,
      repairAction: 'Add onerror fallback handlers'
    },
    {
      id: 'upload-function',
      name: 'Upload Function Validation',
      description: 'For pages with file uploads, validates correct upload function is used',
      severity: 'error',
      pattern: 'uploadChurchImage for church admin, uploadBusinessImage for business admin',
      autoRepair: false
    }
  ],
  
  severityLevels: {
    critical: 'Blocks page access or causes security vulnerability',
    error: 'Breaks core functionality',
    warning: 'Degrades user experience but page still works'
  },
  
  manifestStructure: {
    name: 'Admin type identifier (church, business, member)',
    basePath: 'URL base path for this admin section',
    pages: [
      {
        id: 'Unique page identifier',
        path: 'Full path to HTML file',
        name: 'Human-readable page name',
        jsFile: 'Main JavaScript file for page',
        requiresAuth: 'Whether page needs authentication',
        requiresRole: 'Required user role',
        firestoreCollections: 'Array of Firestore collections used',
        criticalElements: 'Array of required DOM selectors',
        hasFileUpload: 'Optional: true if page has file uploads',
        ignoreLinks: 'Optional: array of links to skip checking'
      }
    ],
    sharedDependencies: [
      {
        file: 'Path to dependency',
        alternatives: 'Optional: alternative files that satisfy this dep',
        required: 'Whether dependency is mandatory'
      }
    ],
    sharedStyles: 'Array of required CSS files'
  },
  
  endpoints: {
    runCheck: {
      method: 'POST',
      path: '/api/nexus/_internal/run-test',
      body: { module: 'church-admin-health|business-admin-health|member-admin-health', target: 'local|production' },
      returns: 'Full health check results with issues array and summary'
    },
    getCriteria: {
      method: 'GET',
      path: '/api/nexus/health-criteria',
      returns: 'This criteria document'
    }
  }
};

function getCriteria() {
  return HEALTH_CHECK_CRITERIA;
}

function getSummaryForDashboard() {
  return {
    totalChecks: HEALTH_CHECK_CRITERIA.checks.length,
    checks: HEALTH_CHECK_CRITERIA.checks.map(c => ({
      id: c.id,
      name: c.name,
      severity: c.severity,
      autoRepair: c.autoRepair
    })),
    adminTypes: ['church', 'business', 'member', 'sales', 'marketing'],
    endpoints: HEALTH_CHECK_CRITERIA.endpoints
  };
}

module.exports = { 
  HEALTH_CHECK_CRITERIA, 
  getCriteria,
  getSummaryForDashboard
};
