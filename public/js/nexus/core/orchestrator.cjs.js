/**
 * NexusOrchestrator - CommonJS version for Node.js server
 * 
 * Mirrors the ES module version (orchestrator.js) for server-side use.
 * See docs/NEXUS_SELF_HEALING_GUARDRAILS.md for full specification.
 */

class NexusOrchestrator {
  constructor(options = {}) {
    this.options = {
      allowRepairs: options.allowRepairs ?? false,
      allowSideEffects: options.allowSideEffects ?? false,
      approvalToken: options.approvalToken ?? null,
      maxAttemptsPerIssue: options.maxAttemptsPerIssue ?? 2,
      maxTotalDurationMs: options.maxTotalDurationMs ?? 60000,
      backoffMs: options.backoffMs ?? 750,
      cleanupAfter: options.cleanupAfter ?? true,
      dryRun: options.dryRun ?? true,
      minConfidence: options.minConfidence ?? 0.5
    };
    
    this.checkEngines = [];
    this.diagnoseEngines = [];
    this.repairEngines = [];
    this.verifyEngines = [];
    
    this.runId = this.generateRunId();
    this.startedAt = null;
    this.attempts = new Map();
    this.logs = [];
  }
  
  generateRunId() {
    return `nexus-server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  log(message) {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${message}`);
  }
  
  registerCheck(engine) {
    if (engine.type !== 'check') throw new Error('Expected check engine');
    this.checkEngines.push(engine);
    return this;
  }
  
  registerDiagnose(engine) {
    if (engine.type !== 'diagnose') throw new Error('Expected diagnose engine');
    this.diagnoseEngines.push(engine);
    return this;
  }
  
  registerRepair(engine) {
    if (engine.type !== 'repair') throw new Error('Expected repair engine');
    this.repairEngines.push(engine);
    return this;
  }
  
  registerVerify(engine) {
    if (engine.type !== 'verify') throw new Error('Expected verify engine');
    this.verifyEngines.push(engine);
    return this;
  }
  
  async run(ctx = {}) {
    this.startedAt = new Date();
    const issues = [];
    const env = ctx.env || 'development';
    
    const runCtx = {
      ...ctx,
      env,
      options: this.options,
      runId: this.runId
    };
    
    this.log('=== Nexus Server Self-Heal Started ===');
    
    try {
      const checkResults = await this.runChecks(runCtx);
      const failedChecks = checkResults.filter(r => r.status === 'fail');
      const warnChecks = checkResults.filter(r => r.status === 'warn');
      const passChecks = checkResults.filter(r => r.status === 'pass');
      
      this.log(`Checks complete: ${passChecks.length} pass, ${warnChecks.length} warn, ${failedChecks.length} fail`);
      
      if (failedChecks.length === 0) {
        if (this.options.allowSideEffects && this.verifyEngines.length > 0) {
          this.log('All checks passed, running verifiers...');
          const verifyResults = await this.runVerification(runCtx);
          
          return this.createReport(env, [{
            issueId: 'none',
            status: 'pass',
            checks: checkResults,
            diagnosis: null,
            repairsAttempted: [],
            verification: verifyResults,
            finalSummary: 'All checks passed. Verification complete.'
          }], 'pass');
        }
        
        return this.createReport(env, [{
          issueId: 'none',
          status: 'pass',
          checks: checkResults,
          diagnosis: null,
          repairsAttempted: [],
          verification: [],
          finalSummary: 'All checks passed. No issues detected.'
        }], 'pass');
      }
      
      const diagnosis = await this.runDiagnosis(runCtx, failedChecks);
      
      if (!diagnosis || !diagnosis.diagnosis) {
        return this.createReport(env, [{
          issueId: 'unknown',
          status: 'fail',
          checks: checkResults,
          diagnosis: null,
          repairsAttempted: [],
          verification: [],
          finalSummary: 'Checks failed but diagnosis could not determine root cause. Manual investigation required.'
        }], 'fail');
      }
      
      const issue = {
        issueId: diagnosis.diagnosis.issueId,
        status: 'fail',
        checks: checkResults,
        diagnosis: diagnosis.diagnosis,
        repairsAttempted: [],
        verification: [],
        finalSummary: ''
      };
      
      if (!this.canRepair(runCtx, diagnosis.diagnosis)) {
        issue.finalSummary = this.getRepairBlockedReason(runCtx, diagnosis.diagnosis);
        issues.push(issue);
        return this.createReport(env, issues, 'fail');
      }
      
      const repairResult = await this.attemptRepairs(runCtx, diagnosis.diagnosis, issue);
      issue.repairsAttempted = repairResult.repairs;
      
      if (repairResult.success) {
        const verifyResults = await this.runVerification(runCtx);
        issue.verification = verifyResults;
        
        const allPassed = verifyResults.every(r => r.status === 'pass');
        issue.status = allPassed ? 'pass' : 'warn';
        issue.finalSummary = allPassed 
          ? 'Repairs applied and verified successfully.'
          : 'Repairs applied but some verification checks still failing.';
      } else {
        issue.finalSummary = 'Repair attempts failed or exceeded limits. Manual intervention required.';
      }
      
      issues.push(issue);
      const overallStatus = issues.every(i => i.status === 'pass') ? 'pass' : 
                           issues.some(i => i.status === 'fail') ? 'fail' : 'warn';
      
      return this.createReport(env, issues, overallStatus);
      
    } catch (error) {
      this.log(`ERROR: ${error.message}`);
      return this.createReport(env, [{
        issueId: 'orchestrator-error',
        status: 'fail',
        checks: [],
        diagnosis: null,
        repairsAttempted: [],
        verification: [],
        finalSummary: `Orchestrator error: ${error.message}`
      }], 'fail');
    }
  }
  
  async runChecks(ctx) {
    const results = [];
    for (const engine of this.checkEngines) {
      this.log(`Running check: ${engine.id}`);
      try {
        const result = await engine.run(ctx);
        results.push(result);
        this.log(`  ${engine.id}: ${result.status}`);
      } catch (error) {
        results.push({
          engineId: engine.id,
          engineType: 'check',
          status: 'fail',
          message: `Engine error: ${error.message}`,
          evidence: { error: error.stack }
        });
        this.log(`  ${engine.id}: ERROR - ${error.message}`);
      }
    }
    return results;
  }
  
  async runDiagnosis(ctx, failedChecks) {
    for (const engine of this.diagnoseEngines) {
      this.log(`Running diagnosis: ${engine.id}`);
      try {
        const result = await engine.run(ctx, failedChecks);
        if (result && result.diagnosis) {
          return result;
        }
      } catch (error) {
        this.log(`Diagnose engine ${engine.id} error: ${error.message}`);
      }
    }
    return null;
  }
  
  canRepair(ctx, diagnosis) {
    if (!ctx.options.allowRepairs) return false;
    if (!ctx.options.allowSideEffects) return false;
    
    const topHypothesis = diagnosis.hypotheses[0];
    if (!topHypothesis) return false;
    if (topHypothesis.confidence < ctx.options.minConfidence) return false;
    
    const hasMatchingRepairs = topHypothesis.suggestedRepairs?.some(repairId => 
      this.repairEngines.some(e => e.id === repairId)
    );
    
    return hasMatchingRepairs;
  }
  
  getRepairBlockedReason(ctx, diagnosis) {
    if (!ctx.options.allowRepairs) {
      return 'Repairs disabled (allowRepairs=false). Enable to attempt automatic fixes.';
    }
    if (!ctx.options.allowSideEffects) {
      return 'Side effects disabled (allowSideEffects=false). Enable to allow repairs that modify files.';
    }
    
    const topHypothesis = diagnosis.hypotheses[0];
    if (!topHypothesis) {
      return 'No hypotheses generated. Cannot determine repair strategy.';
    }
    if (topHypothesis.confidence < ctx.options.minConfidence) {
      return `Top hypothesis confidence (${topHypothesis.confidence}) below minimum (${ctx.options.minConfidence}). Manual review required.`;
    }
    
    return 'No matching repair engines for suggested repairs.';
  }
  
  async attemptRepairs(ctx, diagnosis, issue) {
    const repairs = [];
    const topHypothesis = diagnosis.hypotheses[0];
    
    for (const repairId of (topHypothesis.suggestedRepairs || [])) {
      const engine = this.repairEngines.find(e => e.id === repairId);
      if (!engine) continue;
      
      const attempts = this.attempts.get(repairId) || 0;
      if (attempts >= ctx.options.maxAttemptsPerIssue) {
        repairs.push({
          repairId,
          dryRun: ctx.options.dryRun,
          changes: [],
          rollbackNotes: 'Max attempts exceeded',
          result: 'skipped',
          error: { code: 'MAX_ATTEMPTS', message: `Exceeded ${ctx.options.maxAttemptsPerIssue} attempts` }
        });
        continue;
      }
      
      const elapsed = Date.now() - this.startedAt.getTime();
      if (elapsed > ctx.options.maxTotalDurationMs) {
        repairs.push({
          repairId,
          dryRun: ctx.options.dryRun,
          changes: [],
          rollbackNotes: 'Timeout exceeded',
          result: 'skipped',
          error: { code: 'TIMEOUT', message: `Exceeded ${ctx.options.maxTotalDurationMs}ms` }
        });
        continue;
      }
      
      if (engine.requiresApproval && !ctx.options.approvalToken) {
        repairs.push({
          repairId,
          dryRun: ctx.options.dryRun,
          changes: [],
          rollbackNotes: 'Approval required',
          result: 'skipped',
          error: { code: 'APPROVAL_REQUIRED', message: 'Engine requires approval token' }
        });
        continue;
      }
      
      try {
        this.log(`Running repair: ${repairId}`);
        this.attempts.set(repairId, attempts + 1);
        const result = await engine.run(ctx);
        repairs.push({
          repairId,
          dryRun: ctx.options.dryRun,
          changes: result.changes || [],
          rollbackNotes: engine.repairPlan?.rollback?.notes || 'No rollback notes',
          result: result.status === 'success' ? 'success' : 'failed',
          error: result.error || null
        });
        this.log(`  ${repairId}: ${result.status}`);
        
        if (result.status === 'success' && !ctx.options.dryRun) {
          await this.delay(ctx.options.backoffMs);
        }
      } catch (error) {
        repairs.push({
          repairId,
          dryRun: ctx.options.dryRun,
          changes: [],
          rollbackNotes: engine.repairPlan?.rollback?.notes || 'No rollback notes',
          result: 'failed',
          error: { code: 'EXCEPTION', message: error.message }
        });
        this.log(`  ${repairId}: ERROR - ${error.message}`);
      }
    }
    
    const success = repairs.some(r => r.result === 'success');
    return { success, repairs };
  }
  
  async runVerification(ctx) {
    const results = [];
    for (const engine of this.verifyEngines) {
      this.log(`Running verify: ${engine.id}`);
      try {
        const result = await engine.run(ctx);
        results.push(result);
        this.log(`  ${engine.id}: ${result.status}`);
      } catch (error) {
        results.push({
          engineId: engine.id,
          engineType: 'verify',
          status: 'fail',
          message: `Engine error: ${error.message}`,
          evidence: { error: error.stack }
        });
        this.log(`  ${engine.id}: ERROR - ${error.message}`);
      }
    }
    return results;
  }
  
  createReport(env, issues, overallStatus) {
    const endedAt = new Date();
    return {
      runId: this.runId,
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      env,
      options: {
        allowRepairs: this.options.allowRepairs,
        allowSideEffects: this.options.allowSideEffects,
        dryRun: this.options.dryRun
      },
      issues,
      overallStatus,
      logs: this.logs
    };
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { NexusOrchestrator };
