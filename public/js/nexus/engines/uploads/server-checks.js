/**
 * Server-Side Upload Check Engines
 * 
 * CHECK engines for Node.js context using Firebase Admin SDK.
 * Uses canonical base classes from engine.cjs.js
 */

const { CheckEngine } = require('../../core/engine.cjs.js');

class CheckAdminSdkReady extends CheckEngine {
  constructor() {
    super({
      id: 'check.server.adminSdk',
      name: 'Admin SDK Ready Check',
      description: 'Verifies Firebase Admin SDK is initialized'
    });
  }
  
  async run(ctx) {
    try {
      const admin = ctx.admin;
      if (!admin) {
        return this.fail('Firebase Admin not provided in context', { admin: false });
      }
      
      const apps = admin.apps;
      if (!apps || apps.length === 0) {
        return this.fail('No Firebase Admin apps initialized', { apps: 0 });
      }
      
      const projectId = apps[0].options.projectId;
      
      return this.pass({
        initialized: true,
        projectId,
        appCount: apps.length
      });
    } catch (error) {
      return this.fail(`Admin SDK check error: ${error.message}`, { error: error.stack });
    }
  }
}

class CheckStorageBucketAccess extends CheckEngine {
  constructor() {
    super({
      id: 'check.server.storageBucket',
      name: 'Storage Bucket Access Check',
      description: 'Verifies Firebase Storage bucket is accessible via Admin SDK'
    });
  }
  
  async run(ctx) {
    try {
      const admin = ctx.admin;
      const expectedBucket = 'kingdom-commerce.firebasestorage.app';
      
      const bucket = admin.storage().bucket(expectedBucket);
      const [exists] = await bucket.exists();
      
      if (!exists) {
        return this.fail('Storage bucket does not exist', { bucket: expectedBucket, exists: false });
      }
      
      return this.pass({
        bucket: expectedBucket,
        exists: true,
        accessible: true
      });
    } catch (error) {
      return this.fail(`Bucket access error: ${error.message}`, { error: error.message });
    }
  }
}

class CheckCorsConfig extends CheckEngine {
  constructor() {
    super({
      id: 'check.server.corsConfig',
      name: 'CORS Configuration Check',
      description: 'Verifies CORS is configured with required origins'
    });
  }
  
  async run(ctx) {
    try {
      const admin = ctx.admin;
      const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
      
      const [metadata] = await bucket.getMetadata();
      const cors = metadata.cors || [];
      
      if (cors.length === 0) {
        return this.fail('No CORS configuration found', { cors: [] });
      }
      
      const origins = cors[0]?.origin || [];
      const hasWildcard = origins.includes('*');
      const hasFirebase = origins.some(o => o.includes('kingdom-commerce'));
      
      const requiredOrigins = [
        'https://kingdomconnects.org',
        'https://kingdom-commerce.web.app'
      ];
      
      const missingOrigins = requiredOrigins.filter(o => !origins.includes(o) && !hasWildcard);
      
      if (missingOrigins.length > 0 && !hasWildcard) {
        return this.warn(`Missing some required origins`, {
          origins,
          missing: missingOrigins,
          hasWildcard
        });
      }
      
      return this.pass({
        originCount: origins.length,
        origins,
        hasWildcard,
        hasFirebase
      });
    } catch (error) {
      return this.fail(`CORS check error: ${error.message}`, { error: error.message });
    }
  }
}

class CheckImageUploadPath extends CheckEngine {
  constructor() {
    super({
      id: 'check.server.imageUploadPath',
      name: 'Image Upload Path Check',
      description: 'Verifies image upload paths are accessible'
    });
  }
  
  async run(ctx) {
    try {
      const admin = ctx.admin;
      const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
      const testPath = '_kc_healthchecks/images/';
      
      const [files] = await bucket.getFiles({ prefix: testPath, maxResults: 1 });
      
      return this.pass({
        path: testPath,
        accessible: true,
        existingFiles: files.length
      });
    } catch (error) {
      return this.fail(`Image path check error: ${error.message}`, { error: error.message });
    }
  }
}

class CheckVideoUploadPath extends CheckEngine {
  constructor() {
    super({
      id: 'check.server.videoUploadPath',
      name: 'Video Upload Path Check',
      description: 'Verifies video upload paths are accessible'
    });
  }
  
  async run(ctx) {
    try {
      const admin = ctx.admin;
      const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
      const testPath = '_kc_healthchecks/videos/';
      
      const [files] = await bucket.getFiles({ prefix: testPath, maxResults: 1 });
      
      return this.pass({
        path: testPath,
        accessible: true,
        existingFiles: files.length
      });
    } catch (error) {
      return this.fail(`Video path check error: ${error.message}`, { error: error.message });
    }
  }
}

const serverUploadChecks = [
  new CheckAdminSdkReady(),
  new CheckStorageBucketAccess(),
  new CheckCorsConfig(),
  new CheckImageUploadPath(),
  new CheckVideoUploadPath()
];

module.exports = {
  CheckAdminSdkReady,
  CheckStorageBucketAccess,
  CheckCorsConfig,
  CheckImageUploadPath,
  CheckVideoUploadPath,
  serverUploadChecks
};
