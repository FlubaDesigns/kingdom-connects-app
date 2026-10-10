/**
 * Nexus Server-Side Self-Heal Module
 * 
 * Server-side orchestrator for autonomous testing via _internal API.
 * Uses canonical base classes from engine.cjs.js and orchestrator.cjs.js
 * 
 * See NEXUS-INDEX.md AI DIRECTIVE before modifying this file.
 */

const { NexusOrchestrator } = require('./core/orchestrator.cjs.js');
const { serverUploadChecks } = require('./engines/uploads/server-checks.js');
const { serverUploadVerify } = require('./engines/uploads/server-verify.js');

function createServerUploadOrchestrator(options = {}) {
  const orchestrator = new NexusOrchestrator({
    allowRepairs: false,
    allowSideEffects: true,
    dryRun: false,
    ...options
  });
  
  serverUploadChecks.forEach(engine => orchestrator.registerCheck(engine));
  serverUploadVerify.forEach(engine => orchestrator.registerVerify(engine));
  
  return orchestrator;
}

async function runServerMediaTests(admin, options = {}) {
  const orchestrator = createServerUploadOrchestrator(options);
  return orchestrator.run({ admin });
}

async function runImageOnlyTests(admin, options = {}) {
  const { CheckAdminSdkReady, CheckStorageBucketAccess, CheckCorsConfig, CheckImageUploadPath } = require('./engines/uploads/server-checks.js');
  const { VerifyImageUpload } = require('./engines/uploads/server-verify.js');
  
  const orchestrator = new NexusOrchestrator({
    allowSideEffects: true,
    dryRun: false,
    ...options
  });
  
  orchestrator.registerCheck(new CheckAdminSdkReady());
  orchestrator.registerCheck(new CheckStorageBucketAccess());
  orchestrator.registerCheck(new CheckCorsConfig());
  orchestrator.registerCheck(new CheckImageUploadPath());
  orchestrator.registerVerify(new VerifyImageUpload());
  
  return orchestrator.run({ admin });
}

async function runVideoOnlyTests(admin, options = {}) {
  const { CheckAdminSdkReady, CheckStorageBucketAccess, CheckCorsConfig, CheckVideoUploadPath } = require('./engines/uploads/server-checks.js');
  const { VerifyVideoUpload } = require('./engines/uploads/server-verify.js');
  
  const orchestrator = new NexusOrchestrator({
    allowSideEffects: true,
    dryRun: false,
    ...options
  });
  
  orchestrator.registerCheck(new CheckAdminSdkReady());
  orchestrator.registerCheck(new CheckStorageBucketAccess());
  orchestrator.registerCheck(new CheckCorsConfig());
  orchestrator.registerCheck(new CheckVideoUploadPath());
  orchestrator.registerVerify(new VerifyVideoUpload());
  
  return orchestrator.run({ admin });
}

async function runFullHealthTests(admin, options = {}) {
  const orchestrator = createServerUploadOrchestrator(options);
  const fullResult = await orchestrator.run({ admin });
  
  const summary = {
    adminSdk: 'unknown',
    storageBucket: 'unknown',
    corsConfig: 'unknown',
    imageUpload: 'unknown',
    videoUpload: 'unknown',
    businessImages: 'unknown',
    businessVideos: 'unknown',
    churchImages: 'unknown',
    churchVideos: 'unknown'
  };
  
  if (fullResult.issues && fullResult.issues[0]) {
    const issue = fullResult.issues[0];
    
    for (const check of (issue.checks || [])) {
      if (check.engineId === 'check.server.adminSdk') {
        summary.adminSdk = check.status;
      } else if (check.engineId === 'check.server.storageBucket') {
        summary.storageBucket = check.status;
      } else if (check.engineId === 'check.server.corsConfig') {
        summary.corsConfig = check.status;
      } else if (check.engineId === 'check.server.imageUploadPath') {
        summary.imageUpload = check.status === 'pass' ? 'accessible' : check.status;
      } else if (check.engineId === 'check.server.videoUploadPath') {
        summary.videoUpload = check.status === 'pass' ? 'accessible' : check.status;
      }
    }
    
    for (const verify of (issue.verification || [])) {
      if (verify.engineId === 'verify.server.imageUpload') {
        summary.imageUpload = verify.status;
      } else if (verify.engineId === 'verify.server.videoUpload') {
        summary.videoUpload = verify.status;
      } else if (verify.engineId === 'verify.server.businessMediaPath') {
        summary.businessImages = verify.status;
        summary.businessVideos = verify.status;
      } else if (verify.engineId === 'verify.server.churchMediaPath') {
        summary.churchImages = verify.status;
        summary.churchVideos = verify.status;
      }
    }
  }
  
  return {
    timestamp: new Date().toISOString(),
    overall: fullResult.overallStatus,
    summary,
    details: fullResult
  };
}

module.exports = {
  NexusOrchestrator,
  createServerUploadOrchestrator,
  runServerMediaTests,
  runImageOnlyTests,
  runVideoOnlyTests,
  runFullHealthTests
};
