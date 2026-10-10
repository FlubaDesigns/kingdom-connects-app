/**
 * Upload Check Engines
 * 
 * CHECK engines: No side effects. Only reads state and returns pass/warn/fail with evidence.
 */

import { CheckEngine } from '../../core/engine.js';

export class CheckAuthReady extends CheckEngine {
  constructor() {
    super({
      id: 'check.auth.ready',
      name: 'Auth Ready Check',
      description: 'Verifies Firebase Auth is initialized and user is authenticated'
    });
  }
  
  async run(ctx) {
    try {
      const auth = window.firebase?.auth?.();
      if (!auth) {
        return this.fail('Firebase Auth not initialized', {
          firebaseLoaded: !!window.firebase,
          authMethod: typeof window.firebase?.auth
        });
      }
      
      const user = auth.currentUser;
      if (!user) {
        return this.fail('No authenticated user', {
          authInitialized: true,
          currentUser: null
        });
      }
      
      return this.pass({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });
    } catch (error) {
      return this.fail(`Auth check error: ${error.message}`, { error: error.stack });
    }
  }
}

export class CheckStoragePresent extends CheckEngine {
  constructor() {
    super({
      id: 'check.storage.present',
      name: 'Storage Present Check',
      description: 'Verifies Firebase Storage is initialized with correct bucket'
    });
  }
  
  async run(ctx) {
    try {
      const storage = window.firebase?.storage?.();
      if (!storage) {
        return this.fail('Firebase Storage not initialized', {
          firebaseLoaded: !!window.firebase,
          storageMethod: typeof window.firebase?.storage
        });
      }
      
      const bucket = storage.app?.options?.storageBucket;
      const expectedBucket = 'kingdom-commerce.firebasestorage.app';
      
      if (!bucket) {
        return this.fail('Storage bucket not configured', {
          storageInitialized: true,
          bucket: null
        });
      }
      
      if (bucket !== expectedBucket) {
        return this.warn(`Unexpected bucket: ${bucket}`, {
          bucket,
          expectedBucket,
          match: false
        });
      }
      
      return this.pass({
        bucket,
        expectedBucket,
        match: true
      });
    } catch (error) {
      return this.fail(`Storage check error: ${error.message}`, { error: error.stack });
    }
  }
}

export class CheckOriginCapture extends CheckEngine {
  constructor() {
    super({
      id: 'check.origin.capture',
      name: 'Origin Capture Check',
      description: 'Captures current origin for CORS analysis'
    });
  }
  
  async run(ctx) {
    try {
      const origin = window.location?.origin;
      if (!origin) {
        return this.fail('Cannot determine origin', {
          location: !!window.location
        });
      }
      
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isReplit = origin.includes('.replit.dev') || origin.includes('.repl.co');
      const isFirebase = origin.includes('web.app') || origin.includes('firebaseapp.com');
      
      return this.pass({
        origin,
        type: isLocalhost ? 'localhost' : isReplit ? 'replit' : isFirebase ? 'firebase' : 'other',
        isLocalhost,
        isReplit,
        isFirebase
      });
    } catch (error) {
      return this.fail(`Origin check error: ${error.message}`, { error: error.stack });
    }
  }
}

export class CheckCorsLikelihood extends CheckEngine {
  constructor() {
    super({
      id: 'check.cors.likelihood',
      name: 'CORS Likelihood Check',
      description: 'Estimates likelihood of CORS issues based on origin'
    });
  }
  
  async run(ctx) {
    try {
      const origin = window.location?.origin;
      
      const knownGoodOrigins = [
        'https://kingdom-commerce.web.app',
        'https://kingdom-commerce.firebaseapp.com'
      ];
      
      if (knownGoodOrigins.includes(origin)) {
        return this.pass({
          origin,
          corsRisk: 'low',
          reason: 'Origin is in known-good list (Firebase Hosting)'
        });
      }
      
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return this.warn('Localhost may have CORS issues', {
          origin,
          corsRisk: 'medium',
          reason: 'Localhost requires explicit CORS configuration'
        });
      }
      
      if (origin.includes('.replit.dev') || origin.includes('.repl.co')) {
        return this.warn('Replit dev URLs rotate and may cause CORS issues', {
          origin,
          corsRisk: 'high',
          reason: 'Replit URLs are dynamic and may not be in CORS allowlist'
        });
      }
      
      return this.warn('Unknown origin - CORS status uncertain', {
        origin,
        corsRisk: 'unknown',
        reason: 'Origin not recognized'
      });
    } catch (error) {
      return this.fail(`CORS check error: ${error.message}`, { error: error.stack });
    }
  }
}

export class CheckBusinessIdReady extends CheckEngine {
  constructor() {
    super({
      id: 'check.businessId.ready',
      name: 'Business ID Ready Check',
      description: 'Verifies business ID is available for upload path'
    });
  }
  
  async run(ctx) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const businessId = urlParams.get('id') || urlParams.get('businessId');
      
      if (businessId) {
        return this.pass({
          businessId,
          source: 'url'
        });
      }
      
      const pageBusinessId = document.body?.dataset?.businessId || 
                             window.currentBusinessId ||
                             window.businessId;
      
      if (pageBusinessId) {
        return this.pass({
          businessId: pageBusinessId,
          source: 'page'
        });
      }
      
      return this.warn('No business ID found - using test path', {
        businessId: null,
        source: 'none',
        fallback: '_kc_healthchecks'
      });
    } catch (error) {
      return this.fail(`Business ID check error: ${error.message}`, { error: error.stack });
    }
  }
}

export const uploadChecks = [
  new CheckAuthReady(),
  new CheckStoragePresent(),
  new CheckOriginCapture(),
  new CheckCorsLikelihood(),
  new CheckBusinessIdReady()
];
