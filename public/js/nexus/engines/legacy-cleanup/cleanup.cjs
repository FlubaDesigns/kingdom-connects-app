/**
 * Nexus Legacy Field Cleanup Engine
 * 
 * Scans and cleans legacy field names from Firestore collections.
 * Migrates data to canonical field names per FIRESTORE-MASTER-SCHEMA.md
 * 
 * Operations:
 * - scan: Read-only scan to detect legacy fields
 * - cleanup: Backfill canonical fields and delete legacy fields
 */

const BUSINESS_FIELD_MIGRATIONS = {
  phone: 'phone_number',
  website: 'website_url',
  owner_name: 'your_name',
  church_id: 'referring_church_id',
  home_church_id: 'referring_church_id',
  sales_agent_id: 'referring_salesperson_id'
};

const BUSINESS_FIELDS_TO_DELETE = [
  'is_pro',
  'test',
  '_field_priority',
  'commissions'
];

const COMMON_FIELDS_TO_DELETE = [
  'test',
  '_field_priority'
];

async function scanCollection(db, collectionName, fieldMigrations, fieldsToDelete) {
  const snapshot = await db.collection(collectionName).get();
  const issues = [];
  let cleanCount = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const docIssues = [];
    
    for (const [oldField, newField] of Object.entries(fieldMigrations)) {
      if (data[oldField] !== undefined) {
        docIssues.push({
          type: 'migration',
          field: oldField,
          targetField: newField,
          hasTargetValue: data[newField] !== undefined && data[newField] !== null && data[newField] !== ''
        });
      }
    }
    
    for (const field of fieldsToDelete) {
      if (data[field] !== undefined) {
        docIssues.push({
          type: 'delete',
          field: field,
          value: typeof data[field] === 'object' ? '[object]' : String(data[field]).substring(0, 50)
        });
      }
    }
    
    if (docIssues.length > 0) {
      issues.push({
        docId: doc.id,
        issues: docIssues
      });
    } else {
      cleanCount++;
    }
  }
  
  return {
    collection: collectionName,
    totalDocs: snapshot.docs.length,
    cleanDocs: cleanCount,
    docsWithIssues: issues.length,
    issues: issues
  };
}

async function cleanupCollection(db, FieldValue, collectionName, fieldMigrations, fieldsToDelete, dryRun = true) {
  const snapshot = await db.collection(collectionName).get();
  const results = {
    collection: collectionName,
    totalDocs: snapshot.docs.length,
    updated: 0,
    skipped: 0,
    errors: [],
    changes: []
  };
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const updates = {};
    const deletes = {};
    let needsUpdate = false;
    const docChanges = [];
    
    for (const [oldField, newField] of Object.entries(fieldMigrations)) {
      if (data[oldField] !== undefined) {
        if (data[newField] === undefined || data[newField] === null || data[newField] === '') {
          updates[newField] = data[oldField];
          docChanges.push(`${oldField} → ${newField} (backfilled)`);
        }
        deletes[oldField] = FieldValue.delete();
        docChanges.push(`${oldField} (deleted)`);
        needsUpdate = true;
      }
    }
    
    for (const field of fieldsToDelete) {
      if (data[field] !== undefined) {
        deletes[field] = FieldValue.delete();
        docChanges.push(`${field} (deleted)`);
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      if (dryRun) {
        results.changes.push({
          docId: doc.id,
          wouldChange: docChanges,
          dryRun: true
        });
        results.updated++;
      } else {
        try {
          await db.collection(collectionName).doc(doc.id).update({
            ...updates,
            ...deletes
          });
          results.changes.push({
            docId: doc.id,
            changed: docChanges,
            success: true
          });
          results.updated++;
        } catch (error) {
          results.errors.push({
            docId: doc.id,
            error: error.message
          });
        }
      }
    } else {
      results.skipped++;
    }
  }
  
  return results;
}

async function runLegacyScan(admin) {
  const startTime = Date.now();
  const db = admin.firestore();
  
  const businessResult = await scanCollection(
    db, 
    'business_listings_public', 
    BUSINESS_FIELD_MIGRATIONS, 
    BUSINESS_FIELDS_TO_DELETE
  );
  
  const churchResult = await scanCollection(
    db, 
    'churches', 
    {}, 
    COMMON_FIELDS_TO_DELETE
  );
  
  const userResult = await scanCollection(
    db, 
    'users', 
    {}, 
    COMMON_FIELDS_TO_DELETE
  );
  
  const totalIssues = businessResult.docsWithIssues + churchResult.docsWithIssues + userResult.docsWithIssues;
  const totalClean = businessResult.cleanDocs + churchResult.cleanDocs + userResult.cleanDocs;
  
  return {
    engine: { id: 'legacy-cleanup', version: '1.0.0' },
    operation: 'scan',
    status: totalIssues > 0 ? 'issues_found' : 'clean',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    summary: {
      totalDocuments: businessResult.totalDocs + churchResult.totalDocs + userResult.totalDocs,
      cleanDocuments: totalClean,
      documentsWithIssues: totalIssues
    },
    collections: {
      business_listings: businessResult,
      churches: churchResult,
      users: userResult
    },
    fieldMappings: BUSINESS_FIELD_MIGRATIONS,
    fieldsToDelete: {
      business_listings: BUSINESS_FIELDS_TO_DELETE,
      churches: COMMON_FIELDS_TO_DELETE,
      users: COMMON_FIELDS_TO_DELETE
    }
  };
}

async function runLegacyCleanup(admin, options = {}) {
  const startTime = Date.now();
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const dryRun = options.dryRun !== false;
  
  const businessResult = await cleanupCollection(
    db,
    FieldValue,
    'business_listings_public',
    BUSINESS_FIELD_MIGRATIONS,
    BUSINESS_FIELDS_TO_DELETE,
    dryRun
  );
  
  const churchResult = await cleanupCollection(
    db,
    FieldValue,
    'churches',
    {},
    COMMON_FIELDS_TO_DELETE,
    dryRun
  );
  
  const userResult = await cleanupCollection(
    db,
    FieldValue,
    'users',
    {},
    COMMON_FIELDS_TO_DELETE,
    dryRun
  );
  
  const totalUpdated = businessResult.updated + churchResult.updated + userResult.updated;
  const totalSkipped = businessResult.skipped + churchResult.skipped + userResult.skipped;
  const totalErrors = businessResult.errors.length + churchResult.errors.length + userResult.errors.length;
  
  const result = {
    engine: { id: 'legacy-cleanup', version: '1.0.0' },
    operation: dryRun ? 'dry_run' : 'cleanup',
    status: totalErrors > 0 ? 'partial' : totalUpdated > 0 ? 'success' : 'no_changes',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    dryRun: dryRun,
    summary: {
      documentsUpdated: totalUpdated,
      documentsSkipped: totalSkipped,
      errors: totalErrors
    },
    collections: {
      business_listings: businessResult,
      churches: churchResult,
      users: userResult
    }
  };
  
  try {
    await db.collection('_kc_healthchecks').doc('legacy_cleanup_latest').set({
      ...result,
      savedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('[NEXUS:legacy-cleanup] Failed to save result:', e.message);
  }
  
  return result;
}

module.exports = {
  runLegacyScan,
  runLegacyCleanup,
  BUSINESS_FIELD_MIGRATIONS,
  BUSINESS_FIELDS_TO_DELETE,
  COMMON_FIELDS_TO_DELETE
};
