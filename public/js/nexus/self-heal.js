/**
 * Nexus Self-Heal Module
 * 
 * Main entry point for running self-healing diagnostics and repairs.
 * See docs/NEXUS_SELF_HEALING_GUARDRAILS.md for full specification.
 */

import { NexusOrchestrator } from './core/orchestrator.js';
import { uploadChecks, uploadDiagnose, uploadRepairs, uploadVerify } from './engines/uploads/index.js';

export function createUploadOrchestrator(options = {}) {
  const orchestrator = new NexusOrchestrator(options);
  
  uploadChecks.forEach(engine => orchestrator.registerCheck(engine));
  orchestrator.registerDiagnose(uploadDiagnose);
  uploadRepairs.forEach(engine => orchestrator.registerRepair(engine));
  uploadVerify.forEach(engine => orchestrator.registerVerify(engine));
  
  return orchestrator;
}

export async function runUploadDiagnostics(options = {}) {
  const defaults = {
    allowRepairs: false,
    allowSideEffects: false,
    dryRun: true
  };
  
  const orchestrator = createUploadOrchestrator({ ...defaults, ...options });
  return orchestrator.run(options.env || 'development');
}

export async function runUploadSelfHeal(options = {}) {
  const defaults = {
    allowRepairs: true,
    allowSideEffects: true,
    dryRun: false,
    maxAttemptsPerIssue: 2,
    maxTotalDurationMs: 60000
  };
  
  const orchestrator = createUploadOrchestrator({ ...defaults, ...options });
  return orchestrator.run(options.env || 'development');
}

export async function runUploadDryRun(options = {}) {
  const defaults = {
    allowRepairs: true,
    allowSideEffects: true,
    dryRun: true
  };
  
  const orchestrator = createUploadOrchestrator({ ...defaults, ...options });
  return orchestrator.run(options.env || 'development');
}

export function formatNexusReport(report) {
  const lines = [];
  
  lines.push(`═══════════════════════════════════════════════`);
  lines.push(`  NEXUS REPORT: ${report.overallStatus.toUpperCase()}`);
  lines.push(`═══════════════════════════════════════════════`);
  lines.push(`Run ID: ${report.runId}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push(`Environment: ${report.env}`);
  lines.push(`Options: repairs=${report.options.allowRepairs}, sideEffects=${report.options.allowSideEffects}, dryRun=${report.options.dryRun}`);
  lines.push(``);
  
  for (const issue of report.issues) {
    lines.push(`───────────────────────────────────────────────`);
    lines.push(`Issue: ${issue.issueId} [${issue.status.toUpperCase()}]`);
    lines.push(`───────────────────────────────────────────────`);
    
    lines.push(`\nChecks:`);
    for (const check of issue.checks) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      lines.push(`  ${icon} ${check.engineId}: ${check.status}`);
      if (check.message) lines.push(`    → ${check.message}`);
    }
    
    if (issue.diagnosis) {
      lines.push(`\nDiagnosis:`);
      lines.push(`  Failed checks: ${issue.diagnosis.failedChecks.join(', ')}`);
      lines.push(`  Hypotheses:`);
      for (const h of issue.diagnosis.hypotheses) {
        lines.push(`    • ${h.title} (confidence: ${(h.confidence * 100).toFixed(0)}%)`);
        if (h.suggestedRepairs.length) {
          lines.push(`      Suggested: ${h.suggestedRepairs.join(', ')}`);
        }
      }
    }
    
    if (issue.repairsAttempted.length > 0) {
      lines.push(`\nRepairs Attempted:`);
      for (const r of issue.repairsAttempted) {
        const icon = r.result === 'success' ? '✓' : r.result === 'skipped' ? '○' : '✗';
        const dryLabel = r.dryRun ? ' [DRY RUN]' : '';
        lines.push(`  ${icon} ${r.repairId}${dryLabel}: ${r.result}`);
        if (r.error) lines.push(`    Error: ${r.error.message}`);
        if (r.changes.length) {
          for (const c of r.changes) {
            lines.push(`    → ${c.file}: ${c.action}`);
          }
        }
      }
    }
    
    if (issue.verification.length > 0) {
      lines.push(`\nVerification:`);
      for (const v of issue.verification) {
        const icon = v.status === 'pass' ? '✓' : '✗';
        lines.push(`  ${icon} ${v.engineId}: ${v.status}`);
        if (v.message) lines.push(`    → ${v.message}`);
      }
    }
    
    lines.push(`\nSummary: ${issue.finalSummary}`);
  }
  
  lines.push(``);
  lines.push(`═══════════════════════════════════════════════`);
  lines.push(`  OVERALL: ${report.overallStatus.toUpperCase()}`);
  lines.push(`═══════════════════════════════════════════════`);
  
  return lines.join('\n');
}

export { NexusOrchestrator } from './core/orchestrator.js';
export { NexusEngine, CheckEngine, DiagnoseEngine, RepairEngine, VerifyEngine } from './core/engine.js';
