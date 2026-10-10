/**
 * NexusEngine - CommonJS version for Node.js server
 * 
 * Mirrors the ES module version (engine.js) for server-side use.
 * See docs/NEXUS_SELF_HEALING_GUARDRAILS.md for full specification.
 */

class NexusEngine {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.type = config.type;
    this.runtime = config.runtime || 'server';
    this.requiresApproval = config.requiresApproval || false;
    this.repairPlan = config.repairPlan || null;
    
    this.validateConfig();
  }
  
  validateConfig() {
    const validTypes = ['check', 'diagnose', 'repair', 'verify'];
    if (!validTypes.includes(this.type)) {
      throw new Error(`[NexusEngine] Invalid type "${this.type}" for engine "${this.id}". Must be one of: ${validTypes.join(', ')}`);
    }
    
    if (this.type === 'repair') {
      if (!this.repairPlan) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare a repairPlan`);
      }
      
      if (typeof this.repairPlan.idempotent !== 'boolean') {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare repairPlan.idempotent (boolean)`);
      }
      
      if (!this.repairPlan.blastRadius) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare repairPlan.blastRadius`);
      }
      
      if (!this.repairPlan.blastRadius.touches) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare blastRadius.touches`);
      }
      if (!Array.isArray(this.repairPlan.blastRadius.touches) || this.repairPlan.blastRadius.touches.length === 0) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" blastRadius.touches must be a non-empty array`);
      }
      
      if (!this.repairPlan.blastRadius.neverTouch) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare blastRadius.neverTouch`);
      }
      if (!Array.isArray(this.repairPlan.blastRadius.neverTouch)) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" blastRadius.neverTouch must be an array`);
      }
      
      if (typeof this.repairPlan.reversible !== 'boolean') {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare repairPlan.reversible (boolean)`);
      }
      
      if (!this.repairPlan.rollback) {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare repairPlan.rollback`);
      }
      if (typeof this.repairPlan.rollback.supported !== 'boolean') {
        throw new Error(`[NexusEngine] Repair engine "${this.id}" must declare rollback.supported (boolean)`);
      }
    }
  }
  
  async run(ctx) {
    throw new Error(`[NexusEngine] Engine "${this.id}" must implement run(ctx)`);
  }
  
  createResult(status, data = {}) {
    return {
      engineId: this.id,
      engineType: this.type,
      runtime: this.runtime,
      status,
      timestamp: new Date().toISOString(),
      ...data
    };
  }
}

class CheckEngine extends NexusEngine {
  constructor(config) {
    super({ ...config, type: 'check' });
  }
  
  pass(evidence = {}) {
    return this.createResult('pass', { evidence });
  }
  
  warn(message, evidence = {}) {
    return this.createResult('warn', { message, evidence });
  }
  
  fail(message, evidence = {}) {
    return this.createResult('fail', { message, evidence });
  }
}

class DiagnoseEngine extends NexusEngine {
  constructor(config) {
    super({ ...config, type: 'diagnose' });
  }
  
  createDiagnosis(issueId, failedChecks, hypotheses) {
    return this.createResult('complete', {
      diagnosis: {
        issueId,
        failedChecks,
        hypotheses: hypotheses.sort((a, b) => b.confidence - a.confidence)
      }
    });
  }
}

class RepairEngine extends NexusEngine {
  constructor(config) {
    if (!config.repairPlan) {
      throw new Error(`[RepairEngine] "${config.id}" must have a repairPlan`);
    }
    super({ ...config, type: 'repair' });
  }
  
  async run(ctx) {
    if (ctx.options.dryRun) {
      return this.dryRun(ctx);
    }
    return this.execute(ctx);
  }
  
  async dryRun(ctx) {
    throw new Error(`[RepairEngine] "${this.id}" must implement dryRun(ctx)`);
  }
  
  async execute(ctx) {
    throw new Error(`[RepairEngine] "${this.id}" must implement execute(ctx)`);
  }
  
  createRepairResult(success, changes, rollbackNotes, error = null) {
    return this.createResult(success ? 'success' : 'failed', {
      repairId: this.id,
      changes,
      rollbackNotes,
      repairPlan: this.repairPlan,
      error
    });
  }
}

class VerifyEngine extends NexusEngine {
  constructor(config) {
    super({ ...config, type: 'verify' });
  }
  
  pass(evidence = {}) {
    return this.createResult('pass', { evidence });
  }
  
  fail(message, evidence = {}) {
    return this.createResult('fail', { message, evidence });
  }
}

module.exports = {
  NexusEngine,
  CheckEngine,
  DiagnoseEngine,
  RepairEngine,
  VerifyEngine
};
