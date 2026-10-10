/**
 * Upload Verify Engines
 * 
 * VERIFY engines: Re-runs the exact checks affected and confirms the fix worked.
 * May have controlled side effects (test uploads with cleanup).
 */

import { VerifyEngine } from '../../core/engine.js';

export class VerifySmallUpload extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.uploads.smallUpload',
      name: 'Small Upload Verification',
      description: 'Attempts a small test upload to verify the fix worked'
    });
  }
  
  async run(ctx) {
    try {
      const storage = window.firebase?.storage?.();
      if (!storage) {
        return this.fail('Firebase Storage not available', { storage: false });
      }
      
      const auth = window.firebase?.auth?.();
      const user = auth?.currentUser;
      if (!user) {
        return this.fail('No authenticated user', { user: false });
      }
      
      const testData = new Blob(['nexus-verify-test'], { type: 'text/plain' });
      const testPath = `_kc_healthchecks/verify/${user.uid}/${Date.now()}.txt`;
      const ref = storage.ref(testPath);
      
      const uploadTask = ref.put(testData);
      
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          null,
          reject,
          resolve
        );
      });
      
      const snapshot = await ref.getMetadata();
      
      await ref.delete();
      
      return this.pass({
        path: testPath,
        size: snapshot.size,
        contentType: snapshot.contentType,
        uploaded: true,
        deleted: true
      });
    } catch (error) {
      return this.fail(`Upload verification failed: ${error.message}`, {
        error: error.code || error.message,
        stack: error.stack
      });
    }
  }
}

export class VerifyGetDownloadURL extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.uploads.getDownloadURL',
      name: 'Get Download URL Verification',
      description: 'Verifies that download URLs can be generated for uploaded files'
    });
  }
  
  async run(ctx) {
    try {
      const storage = window.firebase?.storage?.();
      if (!storage) {
        return this.fail('Firebase Storage not available', { storage: false });
      }
      
      const auth = window.firebase?.auth?.();
      const user = auth?.currentUser;
      if (!user) {
        return this.fail('No authenticated user', { user: false });
      }
      
      const testData = new Blob(['nexus-url-test'], { type: 'text/plain' });
      const testPath = `_kc_healthchecks/verify-url/${user.uid}/${Date.now()}.txt`;
      const ref = storage.ref(testPath);
      
      await ref.put(testData);
      
      const downloadURL = await ref.getDownloadURL();
      
      await ref.delete();
      
      if (!downloadURL || !downloadURL.startsWith('https://')) {
        return this.fail('Invalid download URL format', {
          url: downloadURL,
          valid: false
        });
      }
      
      return this.pass({
        path: testPath,
        urlGenerated: true,
        urlFormat: 'valid',
        cleaned: true
      });
    } catch (error) {
      return this.fail(`URL verification failed: ${error.message}`, {
        error: error.code || error.message
      });
    }
  }
}

export class VerifyCleanupDelete extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.uploads.cleanupDelete',
      name: 'Cleanup Delete Verification',
      description: 'Verifies that test files can be deleted (cleanup works)'
    });
  }
  
  async run(ctx) {
    try {
      const storage = window.firebase?.storage?.();
      if (!storage) {
        return this.fail('Firebase Storage not available', { storage: false });
      }
      
      const auth = window.firebase?.auth?.();
      const user = auth?.currentUser;
      if (!user) {
        return this.fail('No authenticated user', { user: false });
      }
      
      const testData = new Blob(['nexus-cleanup-test'], { type: 'text/plain' });
      const testPath = `_kc_healthchecks/verify-cleanup/${user.uid}/${Date.now()}.txt`;
      const ref = storage.ref(testPath);
      
      await ref.put(testData);
      
      await ref.delete();
      
      try {
        await ref.getMetadata();
        return this.fail('File still exists after delete', {
          path: testPath,
          deleted: false
        });
      } catch (e) {
        if (e.code === 'storage/object-not-found') {
          return this.pass({
            path: testPath,
            deleted: true,
            cleanupWorking: true
          });
        }
        throw e;
      }
    } catch (error) {
      return this.fail(`Cleanup verification failed: ${error.message}`, {
        error: error.code || error.message
      });
    }
  }
}

export const uploadVerify = [
  new VerifySmallUpload(),
  new VerifyGetDownloadURL(),
  new VerifyCleanupDelete()
];
