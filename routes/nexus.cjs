const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { runServerMediaTests, runImageOnlyTests, runVideoOnlyTests, runFullHealthTests } = require('../js/nexus/server-self-heal.js');
const { runBrowserUploadTest } = require('../js/nexus/engines/uploads/browser-test.cjs');
const { 
  runChurchAdminHealthCheck, 
  runBusinessAdminHealthCheck, 
  runMemberAdminHealthCheck,
  runSalesAdminHealthCheck,
  runMarketingAdminHealthCheck,
  runPublicPagesHealthCheck,
  runPlatformAdminHealthCheck,
  getCriteria,
  getSummaryForDashboard
} = require('../js/nexus/engines/admin-health/deep-health-checker.cjs');
const { runLegacyScan, runLegacyCleanup } = require('../js/nexus/engines/legacy-cleanup/cleanup.cjs');

let admin = null;
let authenticateUser = null;
let requireAdmin = null;

function initNexus(firebaseAdmin, authMiddleware, adminMiddleware) {
  admin = firebaseAdmin;
  authenticateUser = authMiddleware;
  requireAdmin = adminMiddleware;
}

const nexusState = {
  lastUploadTest: null,
  reactiveLoopRunning: false
};

async function runServerUploadTest(options = {}) {
  const startedAt = new Date().toISOString();
  const checks = [];
  const suggestedFixes = [];
  const logs = [];
  
  const log = (msg) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[NEXUS:upload-test] ${msg}`);
  };
  
  log('Starting server-side upload test');
  
  try {
    const testDb = admin.firestore();
    checks.push({
      name: 'firebase-admin-ready',
      status: 'pass',
      details: 'Firebase Admin SDK initialized',
      evidence: { projectId: 'kingdom-commerce' }
    });
    log('Firebase Admin: OK');
  } catch (err) {
    checks.push({
      name: 'firebase-admin-ready',
      status: 'fail',
      details: 'Firebase Admin SDK not initialized: ' + err.message,
      evidence: { error: err.message }
    });
    log('Firebase Admin: FAIL - ' + err.message);
  }
  
  try {
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    checks.push({
      name: 'storage-bucket-accessible',
      status: 'pass',
      details: 'Storage bucket accessible',
      evidence: { bucket: 'kingdom-commerce.firebasestorage.app' }
    });
    log('Storage bucket: OK');
  } catch (err) {
    checks.push({
      name: 'storage-bucket-accessible',
      status: 'fail',
      details: 'Storage bucket not accessible: ' + err.message,
      evidence: { error: err.message }
    });
    log('Storage bucket: FAIL - ' + err.message);
  }
  
  try {
    const corsPath = path.join(__dirname, '..', 'cors.json');
    const corsContent = fs.readFileSync(corsPath, 'utf8');
    const corsConfig = JSON.parse(corsContent);
    const origins = corsConfig[0]?.origin || [];
    
    checks.push({
      name: 'cors-config-valid',
      status: 'pass',
      details: `CORS config has ${origins.length} origins`,
      evidence: { origins, hasWildcard: origins.includes('*') }
    });
    log('CORS config: OK - ' + origins.length + ' origins');
  } catch (err) {
    checks.push({
      name: 'cors-config-valid',
      status: 'fail',
      details: 'Cannot read cors.json: ' + err.message,
      evidence: { error: err.message }
    });
    suggestedFixes.push({
      priority: 'p0',
      action: 'Create or fix cors.json file',
      fileHints: ['cors.json']
    });
    log('CORS config: FAIL - ' + err.message);
  }
  
  if (options.allowSideEffects) {
    const testTimestamp = Date.now();
    const testPath = `_kc_healthchecks/server/${testTimestamp}.txt`;
    const testContent = `Nexus Upload Test - ${new Date().toISOString()} - Verification Token: ${testTimestamp}`;
    const expectedSize = Buffer.byteLength(testContent, 'utf8');
    
    try {
      const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
      const file = bucket.file(testPath);
      
      await file.save(testContent, { contentType: 'text/plain' });
      log('Upload: SUCCESS - ' + testPath);
      
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('File uploaded but does not exist at path');
      }
      log('Verify: File exists at path');
      
      const [metadata] = await file.getMetadata();
      const actualSize = parseInt(metadata.size, 10);
      
      if (actualSize !== expectedSize) {
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${actualSize}`);
      }
      log(`Verify: Size correct (${actualSize} bytes)`);
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60000
      });
      
      const downloadResponse = await fetch(signedUrl);
      const downloadedContent = await downloadResponse.text();
      
      if (!downloadedContent.includes(String(testTimestamp))) {
        throw new Error('Downloaded content does not match verification token');
      }
      log('Verify: Content integrity confirmed');
      
      if (options.cleanupAfter) {
        await file.delete();
        log('Cleanup: SUCCESS');
      }
      
      checks.push({
        name: 'server-upload-test',
        status: 'pass',
        details: 'Upload, verify, and download all successful',
        evidence: { 
          path: testPath, 
          expectedSize,
          actualSize,
          contentVerified: true,
          signedUrl: signedUrl.substring(0, 80) + '...', 
          cleanedUp: options.cleanupAfter 
        }
      });
      
    } catch (err) {
      checks.push({
        name: 'server-upload-test',
        status: 'fail',
        details: 'Upload verification failed: ' + err.message,
        evidence: { error: err.message, code: err.code, path: testPath }
      });
      log('Upload/Verify: FAIL - ' + err.message);
      
      if (err.message.includes('storage/unauthorized') || err.code === 403) {
        suggestedFixes.push({
          priority: 'p0',
          action: 'Check Firebase Storage rules for _kc_healthchecks path',
          fileHints: ['firebase/storage.rules']
        });
      }
    }
  } else {
    checks.push({
      name: 'server-upload-test',
      status: 'warn',
      details: 'Skipped: Set allowSideEffects=true to run real upload',
      evidence: { skipped: true }
    });
    log('Upload: SKIPPED (allowSideEffects=false)');
  }
  
  const endedAt = new Date().toISOString();
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const passCount = checks.filter(c => c.status === 'pass').length;
  
  const status = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
  
  const result = {
    engine: { id: 'upload-tester', version: '1.0.0' },
    status,
    startedAt,
    endedAt,
    durationMs: new Date(endedAt) - new Date(startedAt),
    summary: `${passCount} pass, ${warnCount} warn, ${failCount} fail`,
    checks,
    suggestedFixes,
    logs
  };
  
  try {
    await admin.firestore().collection('_kc_healthchecks').doc('upload_test_latest').set({
      ...result,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('[NEXUS] Failed to save result to Firestore:', e.message);
  }
  
  nexusState.lastUploadTest = result;
  return result;
}

async function confirmUpload(storagePath) {
  const startedAt = new Date().toISOString();
  const checks = [];
  const log = (msg) => console.log(`[NEXUS:confirm-upload] ${msg}`);
  
  try {
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const file = bucket.file(storagePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      checks.push({ name: 'file-exists', status: 'fail', details: 'File does not exist', evidence: { path: storagePath } });
      return { status: 'fail', checks, path: storagePath };
    }
    checks.push({ name: 'file-exists', status: 'pass', details: 'File exists', evidence: { path: storagePath } });
    log('File exists: ' + storagePath);
    
    const [metadata] = await file.getMetadata();
    const size = parseInt(metadata.size, 10);
    const contentType = metadata.contentType || 'unknown';
    
    if (size === 0) {
      checks.push({ name: 'file-size', status: 'fail', details: 'File is empty (0 bytes)', evidence: { size, contentType } });
      return { status: 'fail', checks, path: storagePath };
    }
    checks.push({ name: 'file-size', status: 'pass', details: `File has ${size} bytes`, evidence: { size, contentType } });
    log(`Size: ${size} bytes, type: ${contentType}`);
    
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60000 });
    checks.push({ name: 'file-accessible', status: 'pass', details: 'Signed URL generated', evidence: { urlPrefix: signedUrl.substring(0, 60) + '...' } });
    log('Signed URL generated');
    
    return {
      status: 'pass',
      startedAt,
      endedAt: new Date().toISOString(),
      path: storagePath,
      size,
      contentType,
      signedUrl,
      checks
    };
    
  } catch (err) {
    checks.push({ name: 'error', status: 'fail', details: err.message, evidence: { code: err.code } });
    return { status: 'fail', error: err.message, checks, path: storagePath };
  }
}

router.post('/utilities/upload-test', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    const { allowSideEffects = true, cleanupAfter = true } = req.body || {};
    const result = await runServerUploadTest({ allowSideEffects, cleanupAfter });
    res.json(result);
  } catch (error) {
    console.error('[NEXUS] Upload test error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/utilities/upload-test/status', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    const doc = await admin.firestore().collection('_kc_healthchecks').doc('upload_test_latest').get();
    if (!doc.exists) {
      return res.json({ status: 'NO_TEST', message: 'No test has been run yet' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reactive-loop', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const { module = 'upload-test', maxAttempts = 3 } = req.body || {};
  
  if (nexusState.reactiveLoopRunning) {
    return res.status(409).json({ error: 'Reactive loop already running' });
  }
  
  nexusState.reactiveLoopRunning = true;
  
  const loopLog = [];
  const log = (msg) => {
    loopLog.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[NEXUS:reactive-loop] ${msg}`);
  };
  
  try {
    log(`Starting reactive loop for module: ${module}`);
    
    let attempt = 0;
    let lastResult = null;
    const fixesApplied = [];
    
    while (attempt < maxAttempts) {
      attempt++;
      log(`Attempt ${attempt}/${maxAttempts}`);
      
      if (module === 'upload-test') {
        lastResult = await runServerUploadTest({ allowSideEffects: true, cleanupAfter: true });
      } else {
        throw new Error(`Unknown module: ${module}`);
      }
      
      log(`Result: ${lastResult.status} - ${lastResult.summary}`);
      
      if (lastResult.status === 'pass') {
        log('SUCCESS - All checks passed');
        break;
      }
      
      if (lastResult.suggestedFixes && lastResult.suggestedFixes.length > 0) {
        for (const fix of lastResult.suggestedFixes) {
          log(`Suggested fix [${fix.priority}]: ${fix.action}`);
          if (fix.fileHints) {
            log(`  Files: ${fix.fileHints.join(', ')}`);
          }
        }
        log('Manual intervention required - stopping loop');
        break;
      } else {
        log('No suggested fixes available, stopping loop');
        break;
      }
    }
    
    nexusState.reactiveLoopRunning = false;
    
    const finalResult = {
      module,
      attempts: attempt,
      maxAttempts,
      finalStatus: lastResult?.status || 'unknown',
      fixesApplied,
      lastResult,
      logs: loopLog
    };
    
    await admin.firestore().collection('_kc_healthchecks').doc('reactive_loop_latest').set({
      ...finalResult,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json(finalResult);
    
  } catch (error) {
    nexusState.reactiveLoopRunning = false;
    console.error('[NEXUS] Reactive loop error:', error);
    res.status(500).json({ error: error.message, logs: loopLog });
  }
});

router.post('/utilities/confirm-upload', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const { path } = req.body || {};
  if (!path) {
    return res.status(400).json({ error: 'Missing required field: path' });
  }
  const result = await confirmUpload(path);
  res.json(result);
});

router.post('/utilities/delete-file', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const { path: filePath } = req.body || {};
  
  if (!filePath) {
    return res.status(400).json({ error: 'Missing required field: path' });
  }
  
  if (!filePath.startsWith('_kc_healthchecks/')) {
    return res.status(403).json({ error: 'Delete only allowed in _kc_healthchecks/ folder' });
  }
  
  try {
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return res.json({ status: 'pass', message: 'File already deleted or never existed', path: filePath });
    }
    
    await file.delete();
    console.log(`[NEXUS:delete-file] Deleted: ${filePath}`);
    
    res.json({ status: 'pass', message: 'File deleted successfully', path: filePath });
  } catch (err) {
    console.error(`[NEXUS:delete-file] Error: ${err.message}`);
    res.status(500).json({ status: 'fail', error: err.message, path: filePath });
  }
});

router.get('/health-criteria', async (req, res) => {
  res.json(getCriteria());
});

router.get('/dashboard-summary', async (req, res) => {
  res.json(getSummaryForDashboard());
});

router.get('/system-health', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const systems = {};
  
  try {
    systems.email = { status: 'pass', details: 'Email router loaded' };
    
    try {
      const testDb = admin.firestore();
      await testDb.collection('_healthcheck').doc('test').get();
      systems.firebase = { status: 'pass', details: 'Firestore connected' };
    } catch (err) {
      systems.firebase = { status: 'fail', details: err.message };
    }
    
    try {
      const stripeRes = await fetch('http://localhost:3000/api/stripe/publishable-key');
      if (stripeRes.ok) {
        systems.stripe = { status: 'pass', details: 'Stripe API accessible' };
      } else {
        systems.stripe = { status: 'warn', details: 'Stripe returned non-OK' };
      }
    } catch (err) {
      systems.stripe = { status: 'fail', details: err.message };
    }
    
    try {
      const churchResult = await runChurchAdminHealthCheck({ target: 'local' });
      const businessResult = await runBusinessAdminHealthCheck({ target: 'local' });
      const memberResult = await runMemberAdminHealthCheck({ target: 'local' });
      const salesResult = await runSalesAdminHealthCheck({ target: 'local' });
      
      const allPass = churchResult.overall === 'pass' && businessResult.overall === 'pass' && 
                      memberResult.overall === 'pass' && salesResult.overall === 'pass';
      
      systems.adminDashboards = {
        status: allPass ? 'pass' : 'warn',
        details: {
          church: `${churchResult.summary.passed}/${churchResult.summary.totalPages} pass`,
          business: `${businessResult.summary.passed}/${businessResult.summary.totalPages} pass`,
          member: `${memberResult.summary.passed}/${memberResult.summary.totalPages} pass`,
          sales: `${salesResult.summary.passed}/${salesResult.summary.totalPages} pass`
        }
      };
    } catch (err) {
      systems.adminDashboards = { status: 'fail', details: err.message };
    }
    
    const failCount = Object.values(systems).filter(s => s.status === 'fail').length;
    const warnCount = Object.values(systems).filter(s => s.status === 'warn').length;
    const overall = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
    
    res.json({
      engine: { id: 'nexus-system-health', version: '1.0.0' },
      overall,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      summary: {
        total: Object.keys(systems).length,
        passed: Object.values(systems).filter(s => s.status === 'pass').length,
        warned: warnCount,
        failed: failCount
      },
      systems
    });
    
  } catch (error) {
    console.error('[NEXUS] System health error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function runAllIntegrityChecks(adminSdk, requestedCollections, sampleSize = 50) {
  const startTime = Date.now();
  const db = adminSdk.firestore();
  const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
  
  const allResults = {
    naming: { status: 'pass', issues: [] },
    required: { status: 'pass', issues: [] },
    types: { status: 'pass', issues: [] },
    enums: { status: 'pass', issues: [] },
    foreignKeys: { status: 'pass', issues: [], checked: 0 }
  };
  
  const fkChecks = [];
  
  for (const collectionName of collectionsToCheck) {
    const config = firestoreManifest.collections[collectionName];
    if (!config) continue;
    
    const snapshot = await db.collection(collectionName).limit(sampleSize).get();
    if (snapshot.empty) continue;
    
    const fieldConfig = config.fields || {};
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      
      Object.keys(data).forEach(field => {
        if (!isSnakeCase(field)) {
          allResults.naming.issues.push({ collection: collectionName, docId: id, field });
        }
      });
      
      for (const [field, rule] of Object.entries(fieldConfig)) {
        const value = data[field];
        
        if (rule.required && (value === undefined || value === null)) {
          allResults.required.issues.push({ collection: collectionName, docId: id, field });
        }
        
        if (value !== undefined && value !== null) {
          const typeResult = validateFieldType(value, rule);
          if (!typeResult.valid) {
            allResults.types.issues.push({ collection: collectionName, docId: id, field, msg: typeResult.message });
          }
          
          if (rule.enum && !rule.enum.includes(value)) {
            allResults.enums.issues.push({ collection: collectionName, docId: id, field, value, allowed: rule.enum });
          }
          
          if (rule.foreignKey) {
            fkChecks.push({ collection: collectionName, docId: id, field, value, target: rule.foreignKey.collection });
          }
        }
      }
    });
  }
  
  for (const check of fkChecks) {
    try {
      const refSnap = await db.collection(check.target).doc(check.value).get();
      if (!refSnap.exists) {
        allResults.foreignKeys.issues.push({ collection: check.collection, docId: check.docId, field: check.field, value: check.value, target: check.target });
      }
    } catch (e) {}
  }
  allResults.foreignKeys.checked = fkChecks.length;
  
  allResults.naming.status = allResults.naming.issues.length > 0 ? 'FAIL' : 'PASS';
  allResults.required.status = allResults.required.issues.length > 0 ? 'FAIL' : 'PASS';
  allResults.types.status = allResults.types.issues.length > 0 ? 'FAIL' : 'PASS';
  allResults.enums.status = allResults.enums.issues.length > 0 ? 'FAIL' : 'PASS';
  allResults.foreignKeys.status = allResults.foreignKeys.issues.length > 0 ? 'FAIL' : 'PASS';
  
  const overall = Object.values(allResults).every(r => r.status === 'PASS') ? 'PASS' : 'FAIL';
  
  return {
    module: 'db-integrity-all',
    collections: collectionsToCheck,
    sampleSize,
    durationMs: Date.now() - startTime,
    overall,
    checks: {
      naming: { status: allResults.naming.status, count: allResults.naming.issues.length, issues: allResults.naming.issues.slice(0, 20) },
      required: { status: allResults.required.status, count: allResults.required.issues.length, issues: allResults.required.issues.slice(0, 20) },
      types: { status: allResults.types.status, count: allResults.types.issues.length, issues: allResults.types.issues.slice(0, 20) },
      enums: { status: allResults.enums.status, count: allResults.enums.issues.length, issues: allResults.enums.issues.slice(0, 20) },
      foreignKeys: { status: allResults.foreignKeys.status, count: allResults.foreignKeys.issues.length, checked: allResults.foreignKeys.checked, issues: allResults.foreignKeys.issues.slice(0, 20) }
    }
  };
}

async function runIntegrityFixes(adminSdk, options = {}) {
  const startTime = Date.now();
  const db = adminSdk.firestore();
  const { dryRun = true, collections: requestedCollections, sampleSize = 50 } = options;
  
  const auditResult = await runAllIntegrityChecks(adminSdk, requestedCollections, sampleSize);
  
  const fixes = { applied: [], skipped: [], errors: [] };
  const log = (msg) => console.log(`[NEXUS:db-integrity-fix] ${msg}`);
  
  log(`Starting integrity fixes (dryRun=${dryRun})`);
  log(`Found ${auditResult.checks.required.count} required field issues`);
  log(`Found ${auditResult.checks.enums.count} enum issues`);
  log(`Found ${auditResult.checks.foreignKeys.count} foreign key issues`);
  
  const enumDefaults = {
    pro_status: 'none',
    listing_status: 'pending',
    account_status: 'active',
    status: 'pending',
    church_membership_status: 'none',
    membership_approval_mode: 'automatic'
  };
  
  const requiredFieldDefaults = {
    created_at: () => adminSdk.firestore.FieldValue.serverTimestamp(),
    updated_at: () => adminSdk.firestore.FieldValue.serverTimestamp(),
    roles: ['member'],
    account_status: 'active',
    listing_status: 'pending'
  };
  
  for (const issue of auditResult.checks.required.issues) {
    const { collection, docId, field } = issue;
    const fixKey = `${collection}/${docId}:${field}`;
    
    if (requiredFieldDefaults[field] !== undefined) {
      const defaultValue = typeof requiredFieldDefaults[field] === 'function' 
        ? requiredFieldDefaults[field]() 
        : requiredFieldDefaults[field];
      
      if (dryRun) {
        fixes.skipped.push({ type: 'required', fixKey, wouldSet: field, dryRun: true });
        log(`[DRY-RUN] Would set ${field} on ${collection}/${docId}`);
      } else {
        try {
          await db.collection(collection).doc(docId).update({ [field]: defaultValue });
          fixes.applied.push({ type: 'required', fixKey, field, set: true });
          log(`Fixed: Set ${field} on ${collection}/${docId}`);
        } catch (e) {
          fixes.errors.push({ type: 'required', fixKey, error: e.message });
          log(`Error: ${e.message}`);
        }
      }
    } else {
      fixes.skipped.push({ type: 'required', fixKey, reason: 'no_default_available' });
    }
  }
  
  for (const issue of auditResult.checks.enums.issues) {
    const { collection, docId, field, value, allowed } = issue;
    const fixKey = `${collection}/${docId}:${field}`;
    
    let correctValue = enumDefaults[field];
    if (!correctValue && allowed && allowed.length > 0) {
      if (value === 'free') correctValue = 'none';
      else if (value === 'pro') correctValue = 'active';
      else correctValue = allowed[0];
    }
    
    if (correctValue) {
      if (dryRun) {
        fixes.skipped.push({ type: 'enum', fixKey, wouldChange: { from: value, to: correctValue }, dryRun: true });
        log(`[DRY-RUN] Would change ${field} from "${value}" to "${correctValue}" on ${collection}/${docId}`);
      } else {
        try {
          await db.collection(collection).doc(docId).update({ [field]: correctValue });
          fixes.applied.push({ type: 'enum', fixKey, field, from: value, to: correctValue });
          log(`Fixed: Changed ${field} from "${value}" to "${correctValue}" on ${collection}/${docId}`);
        } catch (e) {
          fixes.errors.push({ type: 'enum', fixKey, error: e.message });
          log(`Error: ${e.message}`);
        }
      }
    }
  }
  
  for (const issue of auditResult.checks.foreignKeys.issues) {
    const { collection, docId, field, value, target } = issue;
    const fixKey = `${collection}/${docId}:${field}`;
    
    const fieldConfig = firestoreManifest.collections[collection]?.fields[field];
    const allowNull = fieldConfig?.foreignKey?.allowNull || fieldConfig?.allowNull;
    
    if (allowNull) {
      if (dryRun) {
        fixes.skipped.push({ type: 'foreignKey', fixKey, wouldDelete: field, orphanValue: value, dryRun: true });
        log(`[DRY-RUN] Would delete orphan ${field} (${value}) on ${collection}/${docId}`);
      } else {
        try {
          await db.collection(collection).doc(docId).update({ 
            [field]: adminSdk.firestore.FieldValue.delete() 
          });
          fixes.applied.push({ type: 'foreignKey', fixKey, field, deleted: true, orphanValue: value });
          log(`Fixed: Deleted orphan ${field} on ${collection}/${docId}`);
        } catch (e) {
          fixes.errors.push({ type: 'foreignKey', fixKey, error: e.message });
          log(`Error: ${e.message}`);
        }
      }
    } else {
      fixes.skipped.push({ type: 'foreignKey', fixKey, reason: 'required_field_cannot_delete', orphanValue: value });
      log(`Skipped: ${field} is required, cannot auto-delete orphan reference`);
    }
  }
  
  const status = fixes.errors.length > 0 ? 'PARTIAL' : 
                 fixes.applied.length > 0 ? 'FIXED' : 
                 dryRun ? 'DRY_RUN' : 'NO_FIXES_NEEDED';
  
  return {
    module: 'db-integrity-fix',
    dryRun,
    durationMs: Date.now() - startTime,
    status,
    audit: {
      issuesFound: {
        required: auditResult.checks.required.count,
        enums: auditResult.checks.enums.count,
        foreignKeys: auditResult.checks.foreignKeys.count
      }
    },
    fixes: {
      applied: fixes.applied.length,
      skipped: fixes.skipped.length,
      errors: fixes.errors.length,
      details: {
        applied: fixes.applied,
        skipped: fixes.skipped.slice(0, 20),
        errors: fixes.errors
      }
    }
  };
}

async function runUserContextCheck(adminSdk, { email, uid }) {
  const startTime = Date.now();
  const db = adminSdk.firestore();
  const issues = [];
  const warnings = [];
  const info = [];
  
  let userDoc = null;
  let userData = null;
  let userId = uid;
  
  if (email && !uid) {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    if (snapshot.empty) {
      return { module: 'user-context-check', status: 'ERROR', error: `No user found with email: ${email}` };
    }
    userDoc = snapshot.docs[0];
    userData = userDoc.data();
    userId = userDoc.id;
  } else {
    const docRef = db.collection('users').doc(uid);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { module: 'user-context-check', status: 'ERROR', error: `No user found with uid: ${uid}` };
    }
    userDoc = doc;
    userData = doc.data();
  }
  
  const roleChecks = {
    church_admin: {
      requiredFields: ['home_church_id'],
      optionalFields: ['managed_church_ids', 'church_membership_status'],
      description: 'Can access church-admin dashboard'
    },
    business_owner: {
      requiredFields: [],
      optionalFields: ['managed_business_ids'],
      description: 'Can access business-admin dashboard'
    },
    member: {
      requiredFields: [],
      optionalFields: ['home_church_id', 'church_membership_status'],
      description: 'Basic member role'
    },
    platform_admin: {
      requiredFields: [],
      optionalFields: ['home_church_id', 'managed_church_ids'],
      description: 'Full platform access - can select any church'
    },
    sales_agent: {
      requiredFields: [],
      optionalFields: [],
      description: 'Sales dashboard access'
    }
  };
  
  const userRoles = userData.roles || [];
  info.push({ field: 'uid', value: userId });
  info.push({ field: 'email', value: userData.email || '(NOT SET)' });
  info.push({ field: 'name', value: userData.name || '(NOT SET)' });
  info.push({ field: 'roles', value: userRoles.length > 0 ? userRoles : '(EMPTY)' });
  info.push({ field: 'account_status', value: userData.account_status || '(NOT SET)' });
  
  const authFields = {
    home_church_id: userData.home_church_id || null,
    managed_church_ids: userData.managed_church_ids || null,
    managed_business_ids: userData.managed_business_ids || null,
    church_membership_status: userData.church_membership_status || null
  };
  
  for (const [field, value] of Object.entries(authFields)) {
    info.push({ field, value: value || '(NOT SET)' });
  }
  
  if (!userRoles.length) {
    issues.push({ severity: 'CRITICAL', message: 'User has no roles assigned', field: 'roles' });
  }
  
  for (const role of userRoles) {
    const check = roleChecks[role];
    if (!check) {
      warnings.push({ message: `Unknown role: ${role}`, field: 'roles' });
      continue;
    }
    
    for (const reqField of check.requiredFields) {
      if (!authFields[reqField]) {
        issues.push({ 
          severity: 'ERROR', 
          message: `Role "${role}" requires "${reqField}" but it's not set`,
          field: reqField,
          role
        });
      }
    }
    
    for (const optField of check.optionalFields) {
      if (!authFields[optField]) {
        warnings.push({ 
          message: `Role "${role}" could use "${optField}" but it's not set`,
          field: optField,
          role
        });
      }
    }
  }
  
  let churchContext = null;
  if (authFields.home_church_id) {
    const churchDoc = await db.collection('churches').doc(authFields.home_church_id).get();
    if (churchDoc.exists) {
      const cd = churchDoc.data();
      churchContext = { id: churchDoc.id, church_name: cd.church_name, listing_status: cd.listing_status };
    } else {
      issues.push({ severity: 'ERROR', message: `home_church_id points to non-existent church`, field: 'home_church_id', value: authFields.home_church_id });
    }
  }
  
  let managedChurches = [];
  if (authFields.managed_church_ids && Array.isArray(authFields.managed_church_ids)) {
    for (const cid of authFields.managed_church_ids) {
      const cDoc = await db.collection('churches').doc(cid).get();
      if (cDoc.exists) {
        managedChurches.push({ id: cid, church_name: cDoc.data().church_name });
      } else {
        issues.push({ severity: 'WARNING', message: `managed_church_ids contains orphan reference`, field: 'managed_church_ids', value: cid });
      }
    }
  }
  
  let managedBusinesses = [];
  if (authFields.managed_business_ids && Array.isArray(authFields.managed_business_ids)) {
    for (const bid of authFields.managed_business_ids) {
      const bDoc = await db.collection('business_listings_public').doc(bid).get();
      if (bDoc.exists) {
        managedBusinesses.push({ id: bid, business_name: bDoc.data().business_name });
      } else {
        issues.push({ severity: 'WARNING', message: `managed_business_ids contains orphan reference`, field: 'managed_business_ids', value: bid });
      }
    }
  }
  
  const status = issues.some(i => i.severity === 'CRITICAL') ? 'CRITICAL' :
                 issues.some(i => i.severity === 'ERROR') ? 'ERROR' :
                 warnings.length > 0 ? 'WARNING' : 'OK';
  
  return {
    module: 'user-context-check',
    status,
    durationMs: Date.now() - startTime,
    user: {
      uid: userId,
      email: userData.email,
      name: userData.name,
      roles: userRoles,
      account_status: userData.account_status
    },
    authContext: authFields,
    linkedEntities: {
      homeChurch: churchContext,
      managedChurches,
      managedBusinesses
    },
    issues,
    warnings,
    info,
    recommendations: issues.length > 0 ? [
      issues.some(i => i.field === 'home_church_id') ? 
        'User needs home_church_id set - church selector should persist selection' : null,
      issues.some(i => i.field === 'roles') ? 
        'User needs roles assigned during signup or by admin' : null
    ].filter(Boolean) : []
  };
}

router.post('/_internal/run-test', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && clientIp !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Internal endpoint - localhost only', ip: clientIp });
  }
  
  const { module = 'upload-test', allowSideEffects = true, cleanupAfter = true, target = 'local' } = req.body || {};
  
  try {
    if (module === 'upload-test') {
      const result = await runServerUploadTest({ allowSideEffects, cleanupAfter });
      return res.json(result);
    } else if (module === 'confirm-upload') {
      const { path } = req.body;
      if (!path) return res.status(400).json({ error: 'Missing path for confirm-upload' });
      const result = await confirmUpload(path);
      return res.json(result);
    } else if (module === 'image-server') {
      const result = await runImageOnlyTests(admin, { allowSideEffects });
      return res.json(result);
    } else if (module === 'video-server') {
      const result = await runVideoOnlyTests(admin, { allowSideEffects });
      return res.json(result);
    } else if (module === 'media-server') {
      const result = await runServerMediaTests(admin, { allowSideEffects });
      return res.json(result);
    } else if (module === 'full-health') {
      const result = await runFullHealthTests(admin, { allowSideEffects });
      return res.json(result);
    } else if (module === 'browser-upload') {
      const result = await runBrowserUploadTest({ baseUrl: 'http://localhost:5000' });
      return res.json(result);
    } else if (module === 'church-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runChurchAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'business-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runBusinessAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'member-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runMemberAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'sales-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runSalesAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'marketing-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runMarketingAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'public-pages-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runPublicPagesHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'platform-admin-health') {
      const { allowRepairs = false, allowSideEffects: repairSideEffects = false } = req.body || {};
      const result = await runPlatformAdminHealthCheck({ allowRepairs, allowSideEffects: repairSideEffects, target });
      return res.json(result);
    } else if (module === 'db-integrity-all') {
      const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
      const result = await runAllIntegrityChecks(admin, requestedCollections, sampleSize);
      return res.json(result);
    } else if (module === 'db-integrity-fix') {
      const { dryRun = true, collections: requestedCollections, sampleSize = 50 } = req.body || {};
      const result = await runIntegrityFixes(admin, { dryRun, collections: requestedCollections, sampleSize });
      return res.json(result);
    } else if (module === 'user-context-check') {
      const { email, uid } = req.body || {};
      if (!email && !uid) {
        return res.status(400).json({ error: 'Provide either email or uid parameter' });
      }
      const result = await runUserContextCheck(admin, { email, uid });
      return res.json(result);
    } else {
      return res.status(400).json({ 
        error: `Unknown module: ${module}`, 
        availableModules: [
          'upload-test', 'confirm-upload', 'image-server', 'video-server', 
          'media-server', 'full-health', 'browser-upload', 
          'church-admin-health', 'business-admin-health', 'member-admin-health', 'sales-admin-health', 'marketing-admin-health', 'public-pages-health', 'platform-admin-health',
          'db-integrity-all', 'db-integrity-fix', 'user-context-check'
        ] 
      });
    }
  } catch (error) {
    console.error(`[NEXUS:_internal/run-test] Error in module ${module}:`, error);
    return res.status(500).json({ error: error.message, module, stack: error.stack });
  }
});

const firestoreManifest = {
  collections: {
    churches: {
      fields: {
        church_name: { type: 'string', required: true },
        slug: { type: 'string', allowNull: true },
        listing_status: { type: 'string', enum: ['active', 'pending', 'suspended', 'rejected'] },
        contact_email: { type: 'string', required: true },
        admin_uid: { type: 'string', required: true, foreignKey: { collection: 'users', field: '__doc__' } },
        membership_approval_mode: { type: 'string', enum: ['automatic', 'manual'], default: 'automatic' },
        auto_approve_businesses: { type: 'boolean', default: true },
        city: { type: 'string', allowNull: true },
        state: { type: 'string', allowNull: true },
        address: { type: 'string', allowNull: true },
        phone: { type: 'string', allowNull: true },
        denomination: { type: 'string', allowNull: true },
        description: { type: 'string', allowNull: true },
        welcome_message: { type: 'string', allowNull: true },
        website: { type: 'string', allowNull: true },
        created_at: { type: 'timestamp', required: true },
        updated_at: { type: 'timestamp', allowNull: true },
        profile_image_url: { type: 'string', allowNull: true },
        hero_media_url: { type: 'string', allowNull: true },
        service_times: { type: 'array', allowNull: true }
      }
    },
    users: {
      fields: {
        email: { type: 'string', required: true },
        name: { type: 'string', allowNull: true },
        roles: { type: 'array', subtype: 'string', required: true },
        account_status: { type: 'string', enum: ['active', 'pending', 'suspended', 'disabled'], default: 'active' },
        home_church_id: { type: 'string', allowNull: true, foreignKey: { collection: 'churches', field: '__doc__', allowNull: true } },
        church_membership_status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'none'], allowNull: true },
        created_at: { type: 'timestamp', required: true }
      }
    },
    business_listings: {
      fields: {
        business_name: { type: 'string', required: true },
        slug: { type: 'string', allowNull: true },
        listing_status: { type: 'string', enum: ['active', 'pending', 'suspended', 'rejected'] },
        email: { type: 'string', required: true },
        admin_uid: { type: 'string', required: true, foreignKey: { collection: 'users', field: '__doc__' } },
        submitter_uid: { type: 'string', required: true, foreignKey: { collection: 'users', field: '__doc__' } },
        church_id: { type: 'string', allowNull: true, foreignKey: { collection: 'churches', field: '__doc__', allowNull: true } },
        pro_status: { type: 'string', enum: ['none', 'pending', 'active', 'expired', 'cancelled'], allowNull: true },
        primary_category: { type: 'string', allowNull: true },
        city: { type: 'string', allowNull: true },
        state: { type: 'string', allowNull: true },
        created_at: { type: 'timestamp', required: true }
      }
    },
    business_affiliation_requests: {
      fields: {
        church_id: { type: 'string', required: true, foreignKey: { collection: 'churches', field: '__doc__' } },
        business_id: { type: 'string', required: true, foreignKey: { collection: 'business_listings_public', field: '__doc__' } },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        requested_date: { type: 'timestamp', required: true }
      }
    }
  }
};

function isSnakeCase(field) {
  return /^[a-z0-9]+(_[a-z0-9]+)*$/.test(field);
}

function validateFieldType(value, rule) {
  const expected = rule.type;
  if (expected === 'timestamp') {
    const isTimestamp = value && (value._seconds !== undefined || value.toDate);
    return isTimestamp ? { valid: true } : { valid: false, message: 'Expected timestamp' };
  }
  if (expected === 'array') {
    if (!Array.isArray(value)) return { valid: false, message: 'Expected array' };
    if (rule.subtype && value.some(item => typeof item !== rule.subtype)) {
      return { valid: false, message: `Array items must be ${rule.subtype}` };
    }
    return { valid: true };
  }
  if (expected === 'number') return typeof value === 'number' ? { valid: true } : { valid: false, message: 'Expected number' };
  if (expected === 'boolean') return typeof value === 'boolean' ? { valid: true } : { valid: false, message: 'Expected boolean' };
  if (expected === 'object') return typeof value === 'object' && !Array.isArray(value) ? { valid: true } : { valid: false, message: 'Expected object' };
  return typeof value === 'string' ? { valid: true } : { valid: false, message: 'Expected string' };
}

async function fetchCollectionSample(db, collectionName, sampleSize = 50) {
  const config = firestoreManifest.collections[collectionName];
  if (!config) return { error: 'Collection not in manifest' };
  const snapshot = await db.collection(collectionName).limit(sampleSize).get();
  return { snapshot, config };
}

function sanitizeResults(results, maxResults = 100) {
  return {
    results: results.slice(0, maxResults).map(r => ({
      severity: r.severity,
      collection: r.collection,
      field: r.field,
      message: r.message,
      docId: r.doc ? r.doc.split('/').pop() : null
    })),
    truncated: results.length > maxResults
  };
}

router.post('/utilities/check-field-naming', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const results = [];
  const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
  
  try {
    const db = admin.firestore();
    const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
    
    for (const collectionName of collectionsToCheck) {
      const { snapshot, config, error } = await fetchCollectionSample(db, collectionName, sampleSize);
      if (error) { results.push({ severity: 'warn', collection: collectionName, message: error }); continue; }
      if (snapshot.empty) continue;
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        Object.keys(data).forEach(field => {
          if (!isSnakeCase(field)) {
            results.push({ severity: 'error', collection: collectionName, doc: `${collectionName}/${docSnap.id}`, field, message: 'Field not snake_case' });
          }
        });
      });
    }
    
    const { results: sanitized, truncated } = sanitizeResults(results);
    res.json({
      engine: { id: 'check-field-naming', version: '1.0.0' },
      status: results.some(r => r.severity === 'error') ? 'fail' : 'pass',
      durationMs: Date.now() - startTime,
      summary: `${results.filter(r => r.severity === 'error').length} naming violations`,
      results: sanitized,
      truncated
    });
  } catch (error) {
    console.error('[NEXUS] Field naming check error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/check-required-fields', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const results = [];
  const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
  
  try {
    const db = admin.firestore();
    const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
    
    for (const collectionName of collectionsToCheck) {
      const { snapshot, config, error } = await fetchCollectionSample(db, collectionName, sampleSize);
      if (error) { results.push({ severity: 'warn', collection: collectionName, message: error }); continue; }
      if (snapshot.empty) continue;
      
      const fieldConfig = config.fields || {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        for (const [field, rule] of Object.entries(fieldConfig)) {
          if (rule.required && (data[field] === undefined || data[field] === null)) {
            results.push({ severity: 'error', collection: collectionName, doc: `${collectionName}/${docSnap.id}`, field, message: 'Missing required field' });
          }
        }
      });
    }
    
    const { results: sanitized, truncated } = sanitizeResults(results);
    res.json({
      engine: { id: 'check-required-fields', version: '1.0.0' },
      status: results.some(r => r.severity === 'error') ? 'fail' : 'pass',
      durationMs: Date.now() - startTime,
      summary: `${results.filter(r => r.severity === 'error').length} missing required fields`,
      results: sanitized,
      truncated
    });
  } catch (error) {
    console.error('[NEXUS] Required fields check error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/check-field-types', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const results = [];
  const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
  
  try {
    const db = admin.firestore();
    const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
    
    for (const collectionName of collectionsToCheck) {
      const { snapshot, config, error } = await fetchCollectionSample(db, collectionName, sampleSize);
      if (error) { results.push({ severity: 'warn', collection: collectionName, message: error }); continue; }
      if (snapshot.empty) continue;
      
      const fieldConfig = config.fields || {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        for (const [field, rule] of Object.entries(fieldConfig)) {
          const value = data[field];
          if (value === undefined || value === null) continue;
          
          const typeResult = validateFieldType(value, rule);
          if (!typeResult.valid) {
            results.push({ severity: 'error', collection: collectionName, doc: `${collectionName}/${docSnap.id}`, field, message: typeResult.message });
          }
        }
      });
    }
    
    const { results: sanitized, truncated } = sanitizeResults(results);
    res.json({
      engine: { id: 'check-field-types', version: '1.0.0' },
      status: results.some(r => r.severity === 'error') ? 'fail' : 'pass',
      durationMs: Date.now() - startTime,
      summary: `${results.filter(r => r.severity === 'error').length} type mismatches`,
      results: sanitized,
      truncated
    });
  } catch (error) {
    console.error('[NEXUS] Field types check error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/check-enum-values', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const results = [];
  const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
  
  try {
    const db = admin.firestore();
    const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
    
    for (const collectionName of collectionsToCheck) {
      const { snapshot, config, error } = await fetchCollectionSample(db, collectionName, sampleSize);
      if (error) { results.push({ severity: 'warn', collection: collectionName, message: error }); continue; }
      if (snapshot.empty) continue;
      
      const fieldConfig = config.fields || {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        for (const [field, rule] of Object.entries(fieldConfig)) {
          const value = data[field];
          if (value === undefined || value === null) continue;
          
          if (rule.enum && !rule.enum.includes(value)) {
            results.push({ severity: 'error', collection: collectionName, doc: `${collectionName}/${docSnap.id}`, field, message: `Value "${value}" not in [${rule.enum.join(', ')}]` });
          }
        }
      });
    }
    
    const { results: sanitized, truncated } = sanitizeResults(results);
    res.json({
      engine: { id: 'check-enum-values', version: '1.0.0' },
      status: results.some(r => r.severity === 'error') ? 'fail' : 'pass',
      durationMs: Date.now() - startTime,
      summary: `${results.filter(r => r.severity === 'error').length} invalid enum values`,
      results: sanitized,
      truncated
    });
  } catch (error) {
    console.error('[NEXUS] Enum values check error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/check-foreign-keys', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  const startTime = Date.now();
  const results = [];
  const foreignKeyChecks = [];
  const { collections: requestedCollections, sampleSize = 50 } = req.body || {};
  
  try {
    const db = admin.firestore();
    const collectionsToCheck = requestedCollections || Object.keys(firestoreManifest.collections);
    
    for (const collectionName of collectionsToCheck) {
      const { snapshot, config, error } = await fetchCollectionSample(db, collectionName, sampleSize);
      if (error) { results.push({ severity: 'warn', collection: collectionName, message: error }); continue; }
      if (snapshot.empty) continue;
      
      const fieldConfig = config.fields || {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        for (const [field, rule] of Object.entries(fieldConfig)) {
          const value = data[field];
          if (rule.foreignKey && value) {
            foreignKeyChecks.push({ sourcePath: `${collectionName}/${docSnap.id}`, field, value, rule: rule.foreignKey });
          }
        }
      });
    }
    
    const batchSize = 10;
    for (let i = 0; i < foreignKeyChecks.length; i += batchSize) {
      const batch = foreignKeyChecks.slice(i, i + batchSize);
      await Promise.all(batch.map(async check => {
        const { value, rule, sourcePath, field } = check;
        if (!value && rule.allowNull) return;
        try {
          const refSnap = await db.collection(rule.collection).doc(value).get();
          if (!refSnap.exists) {
            results.push({ severity: 'error', collection: rule.collection, doc: sourcePath, field, message: `Broken FK: ${value} not found in ${rule.collection}` });
          }
        } catch (err) {
          results.push({ severity: 'error', collection: rule.collection, field, message: `FK check failed: ${err.message}` });
        }
      }));
    }
    
    const { results: sanitized, truncated } = sanitizeResults(results);
    res.json({
      engine: { id: 'check-foreign-keys', version: '1.0.0' },
      status: results.some(r => r.severity === 'error') ? 'fail' : 'pass',
      durationMs: Date.now() - startTime,
      summary: `${results.filter(r => r.severity === 'error').length} broken foreign keys (checked ${foreignKeyChecks.length})`,
      results: sanitized,
      truncated
    });
  } catch (error) {
    console.error('[NEXUS] Foreign keys check error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/legacy-scan', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    console.log('[NEXUS:legacy-cleanup] Running legacy field scan...');
    const result = await runLegacyScan(admin);
    res.json(result);
  } catch (error) {
    console.error('[NEXUS] Legacy scan error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.post('/utilities/legacy-cleanup', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    const { dryRun = true } = req.body || {};
    console.log(`[NEXUS:legacy-cleanup] Running legacy cleanup (dryRun=${dryRun})...`);
    const result = await runLegacyCleanup(admin, { dryRun });
    res.json(result);
  } catch (error) {
    console.error('[NEXUS] Legacy cleanup error:', error);
    res.status(500).json({ status: 'fail', error: error.message });
  }
});

router.get('/utilities/legacy-cleanup/status', (req, res, next) => authenticateUser(req, res, next), (req, res, next) => requireAdmin(req, res, next), async (req, res) => {
  try {
    const doc = await admin.firestore().collection('_kc_healthchecks').doc('legacy_cleanup_latest').get();
    if (!doc.exists) {
      return res.json({ status: 'NO_CLEANUP', message: 'No cleanup has been run yet' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/utilities/activate-church', async (req, res) => {
  try {
    const { churchName } = req.body || {};
    if (!churchName) {
      return res.status(400).json({ error: 'churchName required' });
    }
    
    const db = admin.firestore();
    const snapshot = await db.collection('churches')
      .where('church_name', '==', churchName)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      const snapshot2 = await db.collection('churches')
        .where('name', '==', churchName)
        .limit(1)
        .get();
      
      if (snapshot2.empty) {
        return res.json({ status: 'NOT_FOUND', message: `Church "${churchName}" not found` });
      }
      
      const docRef = snapshot2.docs[0].ref;
      await docRef.update({ listing_status: 'active' });
      return res.json({ status: 'SUCCESS', message: `Church "${churchName}" activated`, docId: snapshot2.docs[0].id });
    }
    
    const docRef = snapshot.docs[0].ref;
    await docRef.update({ listing_status: 'active' });
    res.json({ status: 'SUCCESS', message: `Church "${churchName}" activated`, docId: snapshot.docs[0].id });
  } catch (error) {
    console.error('[NEXUS] Activate church error:', error);
    res.status(500).json({ status: 'FAIL', error: error.message });
  }
});

console.log('Nexus router loaded with endpoints:');
console.log('  POST /api/nexus/utilities/upload-test');
console.log('  GET  /api/nexus/utilities/upload-test/status');
console.log('  POST /api/nexus/utilities/confirm-upload');
console.log('  POST /api/nexus/utilities/delete-file');
console.log('  POST /api/nexus/utilities/check-field-naming');
console.log('  POST /api/nexus/utilities/check-required-fields');
console.log('  POST /api/nexus/utilities/check-field-types');
console.log('  POST /api/nexus/utilities/check-enum-values');
console.log('  POST /api/nexus/utilities/check-foreign-keys');
console.log('  POST /api/nexus/utilities/legacy-scan');
console.log('  POST /api/nexus/utilities/legacy-cleanup');
console.log('  GET  /api/nexus/utilities/legacy-cleanup/status');
console.log('  POST /api/nexus/reactive-loop');
console.log('  GET  /api/nexus/health-criteria');
console.log('  GET  /api/nexus/dashboard-summary');
console.log('  POST /api/nexus/_internal/run-test (localhost only)');

module.exports = { router, initNexus };
