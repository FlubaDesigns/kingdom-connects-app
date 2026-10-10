/**
 * NEXUS POLICY MODULE
 * 
 * Central authority for Nexus behavior governance.
 * This module defines ALL policy decisions for the system.
 * 
 * DIRECTIVE: This file implements the Architectural Tightening Directive (Jan 6, 2026)
 */

// ============================================================
// AUTONOMY LEVELS
// ============================================================

const AUTONOMY_LEVELS = {
  CHECK_ONLY: 0,        // Run CHECK + REPORT, no repairs
  SAFE_AUTO_REPAIR: 1,  // Low-risk repairs only
  LIMITED_REPAIR: 2,    // Medium-risk, requires admin enable
  HIGH_RISK: 3          // Manual approval required
};

const AUTONOMY_LABELS = {
  0: 'CHECK_ONLY',
  1: 'SAFE_AUTO_REPAIR',
  2: 'LIMITED_REPAIR',
  3: 'HIGH_RISK'
};

// ============================================================
// FAILURE TAXONOMY
// ============================================================

const FAILURE_CODES = {
  // Auth failures
  AUTHGUARD_MISSING: 'authguard/missing',
  AUTH_TIMING: 'auth/timing',
  ROLE_DENIED: 'role/denied',
  
  // Context failures
  CONTEXT_MISSING: 'context/missing',
  
  // Dependency failures
  DEP_MISSING: 'dep/missing',
  DEP_EXTERNAL: 'dep/external',
  
  // Network failures
  NETWORK_CORS: 'network/cors',
  
  // Firestore failures
  FIRESTORE_PERMISSION: 'firestore/permission',
  
  // Runtime failures
  RUNTIME_EXCEPTION: 'runtime/exception',
  
  // Init failures
  INIT_NEVER_READY: 'init/never-ready',
  
  // File/resource failures
  FILE_MISSING: 'file/missing',
  ELEMENT_MISSING: 'element/missing',
  LINK_BROKEN: 'link/broken'
};

// ============================================================
// PAGE RESULT CLASSIFICATION
// ============================================================

const PAGE_STATUS = {
  PASS: 'pass',                     // Clean - no issues
  PASS_WITH_REPAIR: 'pass_with_repair', // Issues found and auto-fixed
  WARN: 'warn',                     // Non-blocking issues
  FAIL: 'fail'                      // Blocked - requires intervention
};

// ============================================================
// STOP CONDITIONS (ANTI-THRASH)
// ============================================================

const STOP_CONDITIONS = {
  MAX_ATTEMPTS_PER_PAGE: 3,
  MAX_RUNTIME_MS: 60000,            // 60 seconds per module
  MAX_SAME_REPAIR_REPEATS: 2,
  MIN_DIAGNOSIS_CONFIDENCE: 0.7     // 70%
};

// ============================================================
// REPAIR REGISTRY
// ============================================================

const REPAIR_REGISTRY = {
  // Canonical repair IDs (used by policy)
  'add-auth-guard': {
    id: 'add-auth-guard',
    fixes: [FAILURE_CODES.AUTHGUARD_MISSING],
    riskLevel: 'low',
    allowedAtLevels: [1, 2, 3],
    touchedFiles: [], // Populated dynamically
    neverTouch: ['js/auth/access-control.js', 'firebase.json', 'firestore.rules'],
    reversible: true,
    rollbackNotes: 'Remove <script type="module" src="/admin/js/admin-auth-guard.js"></script> from </head>'
  },
  // Legacy repair ID mapping (engine uses this format)
  'repair.auth.addGuard': {
    id: 'repair.auth.addGuard',
    fixes: [FAILURE_CODES.AUTHGUARD_MISSING],
    riskLevel: 'low',
    allowedAtLevels: [1, 2, 3],
    touchedFiles: [],
    neverTouch: ['js/auth/access-control.js', 'firebase.json', 'firestore.rules'],
    reversible: true,
    rollbackNotes: 'Remove auth guard script tag'
  },
  'add-init-guard': {
    id: 'add-init-guard',
    fixes: [FAILURE_CODES.AUTH_TIMING, FAILURE_CODES.INIT_NEVER_READY],
    riskLevel: 'low',
    allowedAtLevels: [1, 2, 3],
    touchedFiles: [],
    neverTouch: ['js/auth/access-control.js'],
    reversible: true,
    rollbackNotes: 'Remove DOMContentLoaded wrapper'
  },
  'repair.deps.addMissing': {
    id: 'repair.deps.addMissing',
    fixes: [FAILURE_CODES.DEP_MISSING],
    riskLevel: 'medium',
    allowedAtLevels: [2, 3],
    touchedFiles: [],
    neverTouch: [],
    reversible: true,
    rollbackNotes: 'Remove added dependency script tags'
  },
  'add-retry-wrapper': {
    id: 'add-retry-wrapper',
    fixes: [FAILURE_CODES.DEP_EXTERNAL, FAILURE_CODES.NETWORK_CORS],
    riskLevel: 'medium',
    allowedAtLevels: [2, 3],
    touchedFiles: [],
    neverTouch: [],
    reversible: true,
    rollbackNotes: 'Remove retry wrapper function'
  }
};

// ============================================================
// POLICY FUNCTIONS
// ============================================================

/**
 * Check if a repair is allowed at the given autonomy level
 */
function isRepairAllowed(repairId, autonomyLevel) {
  const repair = REPAIR_REGISTRY[repairId];
  if (!repair) return false;
  return repair.allowedAtLevels.includes(autonomyLevel);
}

/**
 * Validate that a repair has proper blast radius declaration
 */
function validateRepairBlastRadius(repair) {
  const required = ['touchedFiles', 'neverTouch', 'riskLevel', 'reversible', 'rollbackNotes'];
  const missing = required.filter(field => repair[field] === undefined);
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Repair missing blast radius fields: ${missing.join(', ')}`
    };
  }
  
  const validRiskLevels = ['low', 'medium', 'high'];
  if (!validRiskLevels.includes(repair.riskLevel)) {
    return {
      valid: false,
      error: `Invalid riskLevel: ${repair.riskLevel}. Must be: ${validRiskLevels.join(', ')}`
    };
  }
  
  return { valid: true };
}

/**
 * Check if repair can be applied based on diagnosis
 */
function canApplyRepair(diagnosis, repairId, autonomyLevel) {
  // Rule 1: Must have diagnosis
  if (!diagnosis || !diagnosis.failureCode) {
    return { allowed: false, reason: 'No diagnosis recorded' };
  }
  
  // Rule 2: Must map to approved repair class
  const repair = REPAIR_REGISTRY[repairId];
  if (!repair) {
    return { allowed: false, reason: `Unknown repair: ${repairId}` };
  }
  
  if (!repair.fixes.includes(diagnosis.failureCode)) {
    return { allowed: false, reason: `Repair does not fix ${diagnosis.failureCode}` };
  }
  
  // Rule 3: Must be allowed at current autonomy level
  if (!isRepairAllowed(repairId, autonomyLevel)) {
    return { allowed: false, reason: `Repair not allowed at autonomy level ${autonomyLevel}` };
  }
  
  // Validate blast radius
  const blastCheck = validateRepairBlastRadius(repair);
  if (!blastCheck.valid) {
    return { allowed: false, reason: blastCheck.error };
  }
  
  return { allowed: true };
}

/**
 * Check if stop conditions have been met
 */
function shouldStop(context) {
  const { attempts, startTime, repairHistory } = context;
  
  // Max attempts exceeded
  if (attempts >= STOP_CONDITIONS.MAX_ATTEMPTS_PER_PAGE) {
    return { stop: true, reason: 'max_attempts_exceeded', threshold: STOP_CONDITIONS.MAX_ATTEMPTS_PER_PAGE };
  }
  
  // Runtime exceeded
  const elapsed = Date.now() - startTime;
  if (elapsed >= STOP_CONDITIONS.MAX_RUNTIME_MS) {
    return { stop: true, reason: 'runtime_exceeded', threshold: STOP_CONDITIONS.MAX_RUNTIME_MS };
  }
  
  // Same repair repeating
  if (repairHistory && repairHistory.length >= STOP_CONDITIONS.MAX_SAME_REPAIR_REPEATS) {
    const lastRepairs = repairHistory.slice(-STOP_CONDITIONS.MAX_SAME_REPAIR_REPEATS);
    const allSame = lastRepairs.every(r => r === lastRepairs[0]);
    if (allSame) {
      return { stop: true, reason: 'repair_loop_detected', threshold: STOP_CONDITIONS.MAX_SAME_REPAIR_REPEATS };
    }
  }
  
  return { stop: false };
}

/**
 * Generate a run ID
 */
function generateRunId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `nexus-${date}-${time}-${rand}`;
}

/**
 * Create a run report structure
 */
function createRunReport(options = {}) {
  return {
    runId: generateRunId(),
    timestamp: new Date().toISOString(),
    autonomyLevel: options.autonomyLevel || 0,
    autonomyLabel: AUTONOMY_LABELS[options.autonomyLevel || 0],
    scope: {
      module: options.module || 'unknown',
      pagesChecked: 0,
      duration: 0
    },
    results: {
      pass: 0,
      passWithRepair: 0,
      warn: 0,
      fail: 0
    },
    failures: [],
    repairsApplied: [],
    verifications: [],
    stopCondition: null,
    finalStatus: null
  };
}

/**
 * Classify a page result based on issues and repairs
 */
function classifyPageResult(page) {
  const { issues, repairs } = page;
  const repairsApplied = repairs || page.repairsApplied || [];
  
  // No issues = PASS
  if (!issues || issues.length === 0) {
    return PAGE_STATUS.PASS;
  }
  
  // Blocking issue types (critical failures)
  const blockingTypes = [
    'missing_auth', 
    'missing_auth_guard', 
    'missing_file',
    'missing_dependencies'
  ];
  
  // Has blocking issues = FAIL
  const hasBlocking = issues.some(i => 
    i.severity === 'error' || 
    i.severity === 'critical' ||
    blockingTypes.includes(i.type)
  );
  
  if (hasBlocking && repairsApplied.length === 0) {
    return PAGE_STATUS.FAIL;
  }
  
  // Repairs applied and successful = PASS_WITH_REPAIR
  if (repairsApplied.length > 0) {
    const allRepairsSuccessful = repairsApplied.every(r => r.success !== false);
    if (allRepairsSuccessful) {
      return PAGE_STATUS.PASS_WITH_REPAIR;
    }
  }
  
  // Non-blocking issues = WARN
  return PAGE_STATUS.WARN;
}

/**
 * Map an issue type to a failure code
 */
function mapToFailureCode(issueType) {
  const mapping = {
    'missing_auth': FAILURE_CODES.AUTHGUARD_MISSING,
    'missing_auth_guard': FAILURE_CODES.AUTHGUARD_MISSING,
    'missing_js': FAILURE_CODES.DEP_MISSING,
    'missing_dependencies': FAILURE_CODES.DEP_MISSING,
    'missing_file': FAILURE_CODES.FILE_MISSING,
    'missing_elements': FAILURE_CODES.ELEMENT_MISSING,
    'broken_links': FAILURE_CODES.LINK_BROKEN,
    'invalid_collection': FAILURE_CODES.FIRESTORE_PERMISSION,
    'timing_issue': FAILURE_CODES.AUTH_TIMING,
    'cors_error': FAILURE_CODES.NETWORK_CORS,
    'runtime_error': FAILURE_CODES.RUNTIME_EXCEPTION
  };
  
  return mapping[issueType] || 'unknown/' + issueType;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Constants
  AUTONOMY_LEVELS,
  AUTONOMY_LABELS,
  FAILURE_CODES,
  PAGE_STATUS,
  STOP_CONDITIONS,
  REPAIR_REGISTRY,
  
  // Functions
  isRepairAllowed,
  validateRepairBlastRadius,
  canApplyRepair,
  shouldStop,
  generateRunId,
  createRunReport,
  classifyPageResult,
  mapToFailureCode
};
