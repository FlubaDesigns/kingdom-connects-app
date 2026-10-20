/**
 * Upload Diagnose Engine
 * 
 * DIAGNOSE engines: No side effects. Attempts to explain WHY a check failed.
 * Outputs ranked hypotheses with confidence and evidence.
 */

import { DiagnoseEngine } from '../../core/engine.js';

export class DiagnoseUploadsRootCause extends DiagnoseEngine {
  constructor() {
    super({
      id: 'diagnose.uploads.rootcause',
      name: 'Upload Root Cause Diagnosis',
      description: 'Analyzes failed upload checks and generates ranked hypotheses'
    });
  }
  
  async run(ctx, failedChecks) {
    const hypotheses = [];
    const failedIds = failedChecks.map(c => c.engineId);
    
    if (failedIds.includes('check.auth.ready')) {
      hypotheses.push({
        title: 'User not authenticated or session expired',
        confidence: 0.95,
        evidence: failedChecks.filter(c => c.engineId === 'check.auth.ready').map(c => ({
          type: 'checkResult',
          value: c.message || 'Auth check failed'
        })),
        suggestedRepairs: ['repair.auth.waitForSession', 'repair.auth.redirectToLogin']
      });
    }
    
    if (failedIds.includes('check.storage.present')) {
      hypotheses.push({
        title: 'Firebase Storage not initialized or wrong bucket',
        confidence: 0.90,
        evidence: failedChecks.filter(c => c.engineId === 'check.storage.present').map(c => ({
          type: 'checkResult',
          value: c.message || 'Storage check failed'
        })),
        suggestedRepairs: ['repair.storage.reinitialize', 'repair.storage.fixBucket']
      });
    }
    
    const corsCheck = failedChecks.find(c => c.engineId === 'check.cors.likelihood');
    if (corsCheck && corsCheck.status !== 'pass') {
      const evidence = corsCheck.evidence || {};
      const corsRisk = evidence.corsRisk || 'unknown';
      
      hypotheses.push({
        title: 'CORS origin mismatch due to dynamic URL',
        confidence: corsRisk === 'high' ? 0.85 : corsRisk === 'medium' ? 0.65 : 0.40,
        evidence: [
          { type: 'origin', value: evidence.origin || window.location?.origin },
          { type: 'corsRisk', value: corsRisk },
          { type: 'reason', value: evidence.reason || 'CORS may block requests' }
        ],
        suggestedRepairs: ['repair.storage.cors.addOrigin', 'repair.deploy.useFirebaseHosting']
      });
    }
    
    if (hypotheses.length === 0) {
      hypotheses.push({
        title: 'Unknown upload failure - requires manual investigation',
        confidence: 0.30,
        evidence: failedChecks.map(c => ({
          type: 'failedCheck',
          value: `${c.engineId}: ${c.message || c.status}`
        })),
        suggestedRepairs: []
      });
    }
    
    return this.createDiagnosis(
      'uploads-flaky',
      failedIds,
      hypotheses
    );
  }
}

export const uploadDiagnose = new DiagnoseUploadsRootCause();
