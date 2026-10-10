/**
 * NexusOrchestrator - Self-healing orchestration with guardrails
 * 
 * Enforces: DETECT → DIAGNOSE → (OPTIONAL REPAIR) → VERIFY → REPORT
 * See docs/NEXUS_SELF_HEALING_GUARDRAILS.md for full specification.
 */

export class NexusOrchestrator {
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
  }
  
  generateRunId() {
    return `nexus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
  
  async run(env = 'development') {
    this.startedAt = new Date();
    const issues = [];
    
    const ctx = {
      env,
      options: this.options,
      runId: this.runId
    };
    
    try {
      const checkResults = await this.runChecks(ctx);
      const failedChecks = checkResults.filter(r => r.status === 'fail');
      
      if (failedChecks.length === 0) {
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
      
      const diagnosis = await this.runDiagnosis(ctx, failedChecks);
      
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
      
      if (!this.canRepair(ctx, diagnosis.diagnosis)) {
        issue.finalSummary = this.getRepairBlockedReason(ctx, diagnosis.diagnosis);
        issues.push(issue);
        return this.createReport(env, issues, 'fail');
      }
      
      const repairResult = await this.attemptRepairs(ctx, diagnosis.diagnosis, issue);
      issue.repairsAttempted = repairResult.repairs;
      
      if (repairResult.success) {
        const verifyResults = await this.runVerification(ctx);
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
      try {
        const result = await engine.run(ctx);
        results.push(result);
      } catch (error) {
        results.push({
          engineId: engine.id,
          engineType: 'check',
          status: 'fail',
          message: `Engine error: ${error.message}`,
          evidence: { error: error.stack }
        });
      }
    }
    return results;
  }
  
  async runDiagnosis(ctx, failedChecks) {
    for (const engine of this.diagnoseEngines) {
      try {
        const result = await engine.run(ctx, failedChecks);
        if (result && result.diagnosis) {
          return result;
        }
      } catch (error) {
        console.error(`[NexusOrchestrator] Diagnose engine ${engine.id} error:`, error);
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
      }
    }
    
    const success = repairs.some(r => r.result === 'success');
    return { success, repairs };
  }
  
  async runVerification(ctx) {
    const results = [];
    for (const engine of this.verifyEngines) {
      try {
        const result = await engine.run(ctx);
        results.push(result);
      } catch (error) {
        results.push({
          engineId: engine.id,
          engineType: 'verify',
          status: 'fail',
          message: `Engine error: ${error.message}`,
          evidence: { error: error.stack }
        });
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
      overallStatus
    };
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
