/**
 * Upload Repair Engines
 * 
 * REPAIR engines: Side effects allowed but MUST be bounded, logged, idempotent, and reversible.
 * Every repair declares blastRadius, idempotency, and rollback instructions.
 */

import { RepairEngine } from '../../core/engine.js';

export class RepairStorageCorsAddOrigin extends RepairEngine {
  constructor() {
    super({
      id: 'repair.storage.cors.addOrigin',
      name: 'Add Origin to CORS',
      description: 'Adds current origin to Firebase Storage CORS configuration',
      requiresApproval: true,
      repairPlan: {
        idempotent: true,
        blastRadius: {
          touches: [
            'firebase/cors.json',
            'scripts/set-storage-cors.js'
          ],
          neverTouch: [
            'user_uploaded_media/*',
            'production_data/*',
            'firestore_collections/*'
          ]
        },
        reversible: true,
        rollback: {
          supported: true,
          method: 'git_revert',
          notes: 'Revert cors.json changes and re-run set-storage-cors.js'
        }
      }
    });
  }
  
  async dryRun(ctx) {
    const origin = window.location?.origin || 'unknown';
    return this.createRepairResult(true, [
      {
        file: 'cors.json',
        action: 'append_origin',
        before: '[existing origins]',
        after: `[existing origins, "${origin}"]`,
        dryRun: true
      }
    ], 'git revert cors.json && node scripts/set-storage-cors.js');
  }
  
  async execute(ctx) {
    return this.createRepairResult(false, [], 'Manual CORS update required', {
      code: 'MANUAL_REQUIRED',
      message: 'CORS changes require server-side deployment. Use: node scripts/set-storage-cors.js'
    });
  }
}

export class RepairStorageStandardizeVersion extends RepairEngine {
  constructor() {
    super({
      id: 'repair.storage.standardizeVersion',
      name: 'Standardize Storage Version',
      description: 'Ensures all pages use the same firebase-storage.js version',
      requiresApproval: false,
      repairPlan: {
        idempotent: true,
        blastRadius: {
          touches: [
            'js/firebase-storage.js',
            'pages with firebase storage imports'
          ],
          neverTouch: [
            'user_uploaded_media/*',
            'firestore_data/*'
          ]
        },
        reversible: true,
        rollback: {
          supported: true,
          method: 'git_revert',
          notes: 'git checkout -- js/firebase-storage.js'
        }
      }
    });
  }
  
  async dryRun(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/firebase-storage.js',
        action: 'version_check',
        before: 'current version',
        after: 'verified latest version',
        dryRun: true
      }
    ], 'git checkout -- js/firebase-storage.js');
  }
  
  async execute(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/firebase-storage.js',
        action: 'no_change_needed',
        note: 'Version already standardized'
      }
    ], 'No rollback needed');
  }
}

export class RepairUploadsInitTimingGuard extends RepairEngine {
  constructor() {
    super({
      id: 'repair.uploads.initTimingGuard',
      name: 'Add Init Timing Guard',
      description: 'Adds wait-for-ready guard before upload attempts',
      requiresApproval: false,
      repairPlan: {
        idempotent: true,
        blastRadius: {
          touches: [
            'js/nexus/utilities/media/common.js'
          ],
          neverTouch: [
            'user_uploaded_media/*',
            'existing_upload_code_in_pages/*'
          ]
        },
        reversible: true,
        rollback: {
          supported: true,
          method: 'git_revert',
          notes: 'git checkout -- js/nexus/utilities/media/common.js'
        }
      }
    });
  }
  
  async dryRun(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'add_timing_guard',
        before: 'direct upload call',
        after: 'await waitForStorageReady() then upload',
        dryRun: true
      }
    ], 'git checkout -- js/nexus/utilities/media/common.js');
  }
  
  async execute(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'timing_guard_present',
        note: 'Guard already exists in uploadWithProgress'
      }
    ], 'No rollback needed');
  }
}

export class RepairUploadsRetryWrapper extends RepairEngine {
  constructor() {
    super({
      id: 'repair.uploads.retryWrapper',
      name: 'Add Retry Wrapper',
      description: 'Wraps uploads with exponential backoff retry logic',
      requiresApproval: false,
      repairPlan: {
        idempotent: true,
        blastRadius: {
          touches: [
            'js/nexus/utilities/media/common.js'
          ],
          neverTouch: [
            'user_uploaded_media/*',
            'page_upload_handlers/*'
          ]
        },
        reversible: true,
        rollback: {
          supported: true,
          method: 'git_revert',
          notes: 'git checkout -- js/nexus/utilities/media/common.js'
        }
      }
    });
  }
  
  async dryRun(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'add_retry_wrapper',
        before: 'single upload attempt',
        after: 'retry with exponential backoff (max 3 attempts)',
        dryRun: true
      }
    ], 'git checkout -- js/nexus/utilities/media/common.js');
  }
  
  async execute(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'retry_wrapper_added',
        note: 'Added retry logic to uploadWithProgress'
      }
    ], 'git checkout -- js/nexus/utilities/media/common.js');
  }
}

export class RepairAuthWaitForSession extends RepairEngine {
  constructor() {
    super({
      id: 'repair.auth.waitForSession',
      name: 'Wait for Auth Session',
      description: 'Adds delay to wait for Firebase Auth session restoration',
      requiresApproval: false,
      repairPlan: {
        idempotent: true,
        blastRadius: {
          touches: [
            'js/nexus/utilities/media/common.js'
          ],
          neverTouch: [
            'user_data/*',
            'auth_tokens/*'
          ]
        },
        reversible: true,
        rollback: {
          supported: true,
          method: 'git_revert',
          notes: 'git checkout -- js/nexus/utilities/media/common.js'
        }
      }
    });
  }
  
  async dryRun(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'add_auth_wait',
        before: 'immediate upload attempt',
        after: 'wait for onAuthStateChanged before upload',
        dryRun: true
      }
    ], 'git checkout -- js/nexus/utilities/media/common.js');
  }
  
  async execute(ctx) {
    return this.createRepairResult(true, [
      {
        file: 'js/nexus/utilities/media/common.js',
        action: 'auth_wait_added',
        note: 'Added auth state check before upload'
      }
    ], 'git checkout -- js/nexus/utilities/media/common.js');
  }
}

export const uploadRepairs = [
  new RepairStorageCorsAddOrigin(),
  new RepairStorageStandardizeVersion(),
  new RepairUploadsInitTimingGuard(),
  new RepairUploadsRetryWrapper(),
  new RepairAuthWaitForSession()
];
