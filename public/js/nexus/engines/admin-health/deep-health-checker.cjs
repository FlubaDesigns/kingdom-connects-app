const fs = require('fs');
const path = require('path');
const { CHURCH_ADMIN_MANIFEST } = require('./church-admin-manifest.cjs');
const { BUSINESS_ADMIN_MANIFEST } = require('./business-admin-manifest.cjs');
const { MEMBER_ADMIN_MANIFEST } = require('./member-admin-manifest.cjs');
const { SALES_ADMIN_MANIFEST } = require('./sales-admin-manifest.cjs');
const MARKETING_ADMIN_MANIFEST = require('./marketing-admin-manifest.cjs');
const PUBLIC_PAGES_MANIFEST = require('./public-pages-manifest.cjs');
const PLATFORM_ADMIN_MANIFEST = require('./platform-admin-manifest.cjs');
const { getCriteria, getSummaryForDashboard } = require('./health-check-criteria.cjs');
const Policy = require('../../core/policy.cjs');

class DeepHealthChecker {
  constructor(manifest, options = {}) {
    this.manifest = manifest;
    this.adminType = manifest.name;
    this.basePath = manifest.basePath;
    
    // Autonomy level controls what repairs are allowed
    this.autonomyLevel = options.autonomyLevel || Policy.AUTONOMY_LEVELS.CHECK_ONLY;
    
    this.options = {
      allowRepairs: this.autonomyLevel >= Policy.AUTONOMY_LEVELS.SAFE_AUTO_REPAIR,
      allowSideEffects: this.autonomyLevel >= Policy.AUTONOMY_LEVELS.SAFE_AUTO_REPAIR,
      maxAttemptsPerPage: Policy.STOP_CONDITIONS.MAX_ATTEMPTS_PER_PAGE,
      ...options
    };
    
    // Create run report with proper structure
    this.runReport = Policy.createRunReport({
      autonomyLevel: this.autonomyLevel,
      module: manifest.name
    });
    
    this.startTime = Date.now();
    this.repairHistory = [];
    
    this.results = {
      admin: manifest.name,
      timestamp: new Date().toISOString(),
      runId: this.runReport.runId,
      autonomyLevel: this.autonomyLevel,
      autonomyLabel: Policy.AUTONOMY_LABELS[this.autonomyLevel],
      overall: 'pass',
      pages: [],
      issues: [],
      repairs: [],
      summary: {}
    };
  }

  async runFullCheck() {
    console.log(`[NEXUS:DeepHealth] Starting ${this.adminType} deep health check...`);
    console.log(`[NEXUS:DeepHealth] Run ID: ${this.runReport.runId}`);
    console.log(`[NEXUS:DeepHealth] Autonomy Level: ${this.autonomyLevel} (${Policy.AUTONOMY_LABELS[this.autonomyLevel]})`);
    
    for (const page of this.manifest.pages) {
      // Check stop conditions before each page
      const stopCheck = Policy.shouldStop({
        attempts: this.repairHistory.length,
        startTime: this.startTime,
        repairHistory: this.repairHistory
      });
      
      if (stopCheck.stop) {
        console.log(`[NEXUS:DeepHealth] STOP CONDITION: ${stopCheck.reason}`);
        this.results.stopCondition = stopCheck;
        break;
      }
      
      const pageResult = await this.checkPage(page);
      this.results.pages.push(pageResult);
    }
    
    this.generateSummary();
    return this.results;
  }

  async checkPage(page) {
    console.log(`[NEXUS:DeepHealth] Checking ${page.name} (${page.path})...`);
    
    const pageResult = {
      id: page.id,
      name: page.name,
      path: page.path,
      status: 'pass',
      checks: [],
      issues: [],
      repairs: []
    };

    const htmlPath = path.join(process.cwd(), page.path.replace(/^\//, ''));
    const jsPath = page.jsFile ? path.join(process.cwd(), this.basePath.replace(/^\//, ''), page.jsFile) : null;

    if (!fs.existsSync(htmlPath)) {
      pageResult.status = 'fail';
      pageResult.issues.push({ type: 'missing_file', file: page.path, severity: 'critical' });
      return pageResult;
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const jsContent = (jsPath && fs.existsSync(jsPath)) ? fs.readFileSync(jsPath, 'utf8') : '';

    await this.checkLinks(page, htmlContent, pageResult);
    await this.checkDependencies(page, htmlContent, pageResult);
    await this.checkAuthGuard(page, htmlContent, pageResult);
    await this.checkFirestoreUsage(page, jsContent, pageResult);
    await this.checkCriticalElements(page, htmlContent, pageResult);
    await this.checkSharedStyles(page, htmlContent, pageResult);
    
    if (page.hasImageUpload) {
      await this.checkImageUpload(page, jsContent, htmlContent, pageResult);
    }
    if (page.hasVideoUpload) {
      await this.checkVideoUpload(page, jsContent, htmlContent, pageResult);
    }

    pageResult.status = pageResult.issues.some(i => i.severity === 'critical') ? 'fail' :
                        pageResult.issues.length > 0 ? 'warn' : 'pass';

    if (pageResult.issues.length > 0 && this.options.allowRepairs) {
      await this.attemptRepairs(page, pageResult);
    }

    return pageResult;
  }

  async checkLinks(page, htmlContent, result) {
    const linkRegex = /href=["']([^"']+)["']/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      links.push(match[1]);
    }

    const internalLinks = links.filter(l => 
      (l.startsWith('/') && !l.startsWith('//')) || 
      l.startsWith('./') || 
      (!l.startsWith('http') && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('mailto:') && !l.startsWith('tel:'))
    );

    const brokenLinks = [];
    const globalIgnore = this.manifest.globalIgnoreLinks || [];
    const ignoreLinks = [...globalIgnore, ...(page.ignoreLinks || [])];
    for (const link of internalLinks) {
      const cleanLink = link.split('?')[0].split('#')[0];
      if (!cleanLink || cleanLink === '/') continue;
      if (ignoreLinks.includes(cleanLink) || ignoreLinks.includes(link)) continue;
      
      let filePath;
      const dashboardDir = this.basePath.replace(/^\//, '');
      if (cleanLink.startsWith('/')) {
        filePath = path.join(process.cwd(), cleanLink);
      } else if (cleanLink.startsWith('./')) {
        filePath = path.join(process.cwd(), dashboardDir, cleanLink.replace('./', ''));
      } else {
        filePath = path.join(process.cwd(), dashboardDir, cleanLink);
      }

      if (!fs.existsSync(filePath) && !cleanLink.includes('.html')) {
        filePath = filePath + '.html';
      }
      
      if (!fs.existsSync(filePath) && !cleanLink.endsWith('/')) {
        const dirCheck = filePath.replace(/\.html$/, '');
        if (!fs.existsSync(dirCheck)) {
          brokenLinks.push(link);
        }
      }
    }

    result.checks.push({
      check: 'internal_links',
      total: internalLinks.length,
      broken: brokenLinks.length,
      status: brokenLinks.length === 0 ? 'pass' : 'warn'
    });

    if (brokenLinks.length > 0) {
      result.issues.push({
        type: 'broken_links',
        links: brokenLinks,
        severity: 'low',
        message: `Found ${brokenLinks.length} potentially broken internal links`
      });
    }

    const externalLinks = links.filter(l => l.startsWith('http'));
    result.checks.push({
      check: 'external_links',
      total: externalLinks.length,
      status: 'info'
    });
  }

  async checkDependencies(page, htmlContent, result) {
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
    const scripts = [];
    let match;
    
    while ((match = scriptRegex.exec(htmlContent)) !== null) {
      scripts.push(match[1]);
    }

    const missingDeps = [];
    for (const dep of this.manifest.sharedDependencies) {
      if (dep.required) {
        const hasMain = scripts.some(s => s.includes(dep.file));
        const hasAlternative = dep.alternatives && dep.alternatives.some(alt => 
          scripts.some(s => s.includes(alt))
        );
        if (!hasMain && !hasAlternative) {
          missingDeps.push(dep.file);
        }
      }
    }

    result.checks.push({
      check: 'shared_dependencies',
      required: this.manifest.sharedDependencies.filter(d => d.required).length,
      found: this.manifest.sharedDependencies.filter(d => d.required).length - missingDeps.length,
      missing: missingDeps,
      status: missingDeps.length === 0 ? 'pass' : 'fail'
    });

    if (missingDeps.length > 0) {
      result.issues.push({
        type: 'missing_dependencies',
        files: missingDeps,
        severity: 'high',
        message: `Missing required dependencies: ${missingDeps.join(', ')}`,
        repairId: 'repair.deps.addMissing'
      });
    }
  }

  async checkAuthGuard(page, htmlContent, result) {
    if (!page.requiresAuth) {
      result.checks.push({ check: 'auth_guard', status: 'skip', reason: 'Not required' });
      return;
    }

    const authGuardDep = this.manifest.sharedDependencies.find(d => d.file.includes('auth-guard'));
    const authGuardPatterns = authGuardDep ? [authGuardDep.file, ...(authGuardDep.alternatives || [])] : ['auth-guard.js'];
    
    let hasAuthGuard = authGuardPatterns.some(pattern => htmlContent.includes(pattern));
    let authMethod = 'script-tag';
    
    if (!hasAuthGuard && this.manifest.authPattern === 'es-module') {
      const jsPath = page.jsFile ? path.join(process.cwd(), this.basePath.replace(/^\//, ''), page.jsFile) : null;
      if (jsPath && fs.existsSync(jsPath)) {
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        hasAuthGuard = jsContent.includes('access-control.js') || 
                       jsContent.includes('requireAuth') ||
                       jsContent.includes('requireMarketingManager');
        if (hasAuthGuard) authMethod = 'es-module-import';
      }
    }
    
    result.checks.push({
      check: 'auth_guard',
      required: true,
      found: hasAuthGuard,
      method: authMethod,
      status: hasAuthGuard ? 'pass' : 'fail'
    });

    if (!hasAuthGuard) {
      const guardName = authGuardDep ? authGuardDep.file : 'auth-guard.js';
      result.issues.push({
        type: 'missing_auth_guard',
        severity: 'critical',
        message: `Page requires auth but missing ${guardName}`,
        repairId: 'repair.auth.addGuard'
      });
    }
  }

  async checkFirestoreUsage(page, jsContent, result) {
    if (!page.firestoreCollections || page.firestoreCollections.length === 0) {
      result.checks.push({ check: 'firestore_usage', status: 'skip', reason: 'No collections required' });
      return;
    }

    const usedCollections = [];
    const missingCollections = [];

    for (const col of page.firestoreCollections) {
      // Check direct collection reference: collection(db, 'col_name')
      const regex = new RegExp(`collection\\s*\\([^)]*["']${col}["']`, 'g');
      // Check subcollection reference: collection(db, `path/${id}/${col}`)
      const subcolRegex = new RegExp(`collection\\s*\\([^)]*/${col}`, 'g');
      // Check doc reference: doc(db, 'col_name', id)
      const docRegex = new RegExp(`doc\\s*\\([^)]*["']${col}["']`, 'g');
      // Check simple string presence as fallback
      const simpleRegex = new RegExp(`["'\`]${col}["'\`]`, 'g');
      
      if (regex.test(jsContent) || subcolRegex.test(jsContent) || 
          docRegex.test(jsContent) || simpleRegex.test(jsContent)) {
        usedCollections.push(col);
      } else {
        missingCollections.push(col);
      }
    }

    result.checks.push({
      check: 'firestore_collections',
      expected: page.firestoreCollections,
      found: usedCollections,
      missing: missingCollections,
      status: missingCollections.length === 0 ? 'pass' : 'warn'
    });

    if (missingCollections.length > 0) {
      result.issues.push({
        type: 'missing_firestore_usage',
        collections: missingCollections,
        severity: 'low',
        message: `Expected Firestore collections not found in code: ${missingCollections.join(', ')}`
      });
    }
  }

  async checkCriticalElements(page, htmlContent, result) {
    if (!page.criticalElements || page.criticalElements.length === 0) {
      result.checks.push({ check: 'critical_elements', status: 'skip' });
      return;
    }

    const missing = [];
    for (const el of page.criticalElements) {
      const id = el.replace('#', '');
      const regex = new RegExp(`id=["']${id}["']`);
      if (!regex.test(htmlContent)) {
        missing.push(el);
      }
    }

    result.checks.push({
      check: 'critical_elements',
      expected: page.criticalElements,
      missing: missing,
      status: missing.length === 0 ? 'pass' : 'warn'
    });

    if (missing.length > 0) {
      result.issues.push({
        type: 'missing_elements',
        elements: missing,
        severity: 'medium',
        message: `Missing critical DOM elements: ${missing.join(', ')}`
      });
    }
  }

  async checkSharedStyles(page, htmlContent, result) {
    const missingStyles = [];
    
    for (const style of this.manifest.sharedStyles) {
      const styleName = path.basename(style).split('?')[0];
      if (!htmlContent.includes(styleName)) {
        missingStyles.push(style);
      }
    }

    result.checks.push({
      check: 'shared_styles',
      expected: this.manifest.sharedStyles.length,
      missing: missingStyles,
      status: missingStyles.length === 0 ? 'pass' : 'warn'
    });

    if (missingStyles.length > 0) {
      result.issues.push({
        type: 'missing_styles',
        styles: missingStyles,
        severity: 'low',
        message: `Missing shared stylesheets: ${missingStyles.join(', ')}`
      });
    }
  }

  async checkImageUpload(page, jsContent, htmlContent, result) {
    const hasUploader = jsContent.includes('uploadChurchImage') || 
                        jsContent.includes('uploadBusinessImage') ||
                        jsContent.includes('initPhotoUploader') ||
                        jsContent.includes('handleImageUpload');
    const hasProgress = jsContent.includes('ProgressBar') || 
                        jsContent.includes('progressFill') ||
                        jsContent.includes('uploadProgress') ||
                        jsContent.includes('progress-bar');
    
    result.checks.push({
      check: 'image_upload',
      hasUploader,
      hasProgress,
      status: hasUploader ? 'pass' : 'warn'
    });

    if (!hasUploader) {
      result.issues.push({
        type: 'incomplete_upload',
        severity: 'medium',
        message: 'Image upload missing uploader function'
      });
    }
  }

  async checkVideoUpload(page, jsContent, htmlContent, result) {
    const hasVideoUploader = jsContent.includes('handleVideoSelect') || jsContent.includes('initVideoUploader');
    const hasThumbnail = jsContent.includes('generateVideoThumbnail');
    const hasVideoProgress = jsContent.includes('videoProgressBar');
    
    result.checks.push({
      check: 'video_upload',
      hasVideoUploader,
      hasThumbnail,
      hasVideoProgress,
      status: hasVideoUploader && hasThumbnail ? 'pass' : 'warn'
    });

    if (!hasVideoUploader) {
      result.issues.push({
        type: 'missing_video_upload',
        severity: 'medium',
        message: 'Video upload capability missing'
      });
    }
  }

  async attemptRepairs(page, pageResult) {
    console.log(`[NEXUS:DeepHealth] Attempting repairs for ${page.name}...`);
    
    for (const issue of pageResult.issues) {
      if (!issue.repairId) continue;
      
      // DIRECTIVE COMPLIANCE: Create diagnosis before repair
      const diagnosis = {
        failureCode: Policy.mapToFailureCode(issue.type),
        issueType: issue.type,
        severity: issue.severity,
        page: page.id
      };
      
      // DIRECTIVE COMPLIANCE: Check repair authority
      const canRepair = Policy.canApplyRepair(diagnosis, issue.repairId, this.autonomyLevel);
      
      if (!canRepair.allowed) {
        console.log(`[NEXUS:DeepHealth] Repair blocked: ${canRepair.reason}`);
        pageResult.repairs.push({
          repairId: issue.repairId,
          applied: false,
          blocked: true,
          reason: canRepair.reason
        });
        continue;
      }
      
      const repair = await this.executeRepair(issue.repairId, page, issue);
      
      // Track repair history for stop conditions
      this.repairHistory.push(issue.repairId);
      
      if (repair.success) {
        pageResult.repairs.push({
          repairId: issue.repairId,
          applied: true,
          success: true,
          description: repair.description
        });
        this.results.repairs.push({
          page: page.id,
          repairId: issue.repairId,
          description: repair.description
        });
      } else {
        pageResult.repairs.push({
          repairId: issue.repairId,
          applied: true,
          success: false,
          description: repair.description
        });
      }
    }
  }

  async executeRepair(repairId, page, issue) {
    switch (repairId) {
      case 'repair.auth.addGuard':
        return await this.repairAddAuthGuard(page);
      case 'repair.deps.addMissing':
        return await this.repairAddMissingDeps(page, issue);
      default:
        return { success: false, description: 'Unknown repair' };
    }
  }

  async repairAddAuthGuard(page) {
    const htmlPath = path.join(process.cwd(), page.path.replace(/^\//, ''));
    let content = fs.readFileSync(htmlPath, 'utf8');
    
    if (content.includes('church-auth-guard.js')) {
      return { success: false, description: 'Auth guard already present' };
    }

    const insertPoint = content.indexOf('</body>');
    if (insertPoint === -1) {
      return { success: false, description: 'Could not find </body> tag' };
    }

    const guardScript = '  <script src="js/church-auth-guard.js" defer></script>\n';
    content = content.slice(0, insertPoint) + guardScript + content.slice(insertPoint);
    
    if (this.options.allowSideEffects) {
      fs.writeFileSync(htmlPath, content);
      return { success: true, description: `Added church-auth-guard.js to ${page.path}` };
    }
    
    return { success: false, description: 'Dry run - would add auth guard' };
  }

  async repairAddMissingDeps(page, issue) {
    return { success: false, description: 'Manual repair required for dependencies' };
  }

  generateSummary() {
    // Classify each page using Policy
    this.results.pages.forEach(p => {
      p.classification = Policy.classifyPageResult(p);
      // Map issues to failure codes
      p.issues.forEach(i => {
        i.failureCode = Policy.mapToFailureCode(i.type);
      });
    });
    
    // Count by classification
    const pass = this.results.pages.filter(p => p.classification === Policy.PAGE_STATUS.PASS).length;
    const passWithRepair = this.results.pages.filter(p => p.classification === Policy.PAGE_STATUS.PASS_WITH_REPAIR).length;
    const warn = this.results.pages.filter(p => p.classification === Policy.PAGE_STATUS.WARN).length;
    const fail = this.results.pages.filter(p => p.classification === Policy.PAGE_STATUS.FAIL).length;
    
    // For backwards compatibility, also include old counts
    const passed = pass + passWithRepair;
    const warned = warn;
    const failed = fail;
    
    this.results.summary = {
      totalPages: this.results.pages.length,
      // New classification counts
      pass,
      passWithRepair,
      warn,
      fail,
      // Legacy counts for backwards compat
      passed,
      warned,
      failed,
      totalIssues: this.results.pages.reduce((sum, p) => sum + p.issues.length, 0),
      repairsApplied: this.results.repairs.length,
      duration: Date.now() - this.startTime
    };

    // Determine final status
    if (fail > 0) {
      this.results.overall = 'fail';
      this.results.finalStatus = 'FAIL';
    } else if (passWithRepair > 0) {
      this.results.overall = 'pass';
      this.results.finalStatus = 'PASS_WITH_REPAIRS';
    } else if (warn > 0) {
      this.results.overall = 'warn';
      this.results.finalStatus = 'WARN';
    } else {
      this.results.overall = 'pass';
      this.results.finalStatus = 'PASS';
    }
    
    // Collect all issues with failure codes
    this.results.pages.forEach(p => {
      p.issues.forEach(i => {
        this.results.issues.push({ page: p.id, ...i });
      });
    });

    console.log(`[NEXUS:DeepHealth] Run ID: ${this.results.runId}`);
    console.log(`[NEXUS:DeepHealth] Complete: ${pass} pass, ${passWithRepair} pass_with_repair, ${warn} warn, ${fail} fail`);
    console.log(`[NEXUS:DeepHealth] Final Status: ${this.results.finalStatus}`);
    console.log(`[NEXUS:DeepHealth] Duration: ${this.results.summary.duration}ms`);
  }
}

async function runChurchAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(CHURCH_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runBusinessAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(BUSINESS_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runMemberAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(MEMBER_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runSalesAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(SALES_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runMarketingAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(MARKETING_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runPublicPagesHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(PUBLIC_PAGES_MANIFEST, options);
  return await checker.runFullCheck();
}

async function runPlatformAdminHealthCheck(options = {}) {
  const checker = new DeepHealthChecker(PLATFORM_ADMIN_MANIFEST, options);
  return await checker.runFullCheck();
}

module.exports = { 
  DeepHealthChecker, 
  runChurchAdminHealthCheck, 
  runBusinessAdminHealthCheck, 
  runMemberAdminHealthCheck,
  runSalesAdminHealthCheck,
  runMarketingAdminHealthCheck,
  runPublicPagesHealthCheck,
  runPlatformAdminHealthCheck,
  CHURCH_ADMIN_MANIFEST, 
  BUSINESS_ADMIN_MANIFEST,
  MEMBER_ADMIN_MANIFEST,
  SALES_ADMIN_MANIFEST,
  MARKETING_ADMIN_MANIFEST,
  PUBLIC_PAGES_MANIFEST,
  PLATFORM_ADMIN_MANIFEST,
  getCriteria,
  getSummaryForDashboard,
  // Policy exports for external use
  Policy,
  AUTONOMY_LEVELS: Policy.AUTONOMY_LEVELS,
  PAGE_STATUS: Policy.PAGE_STATUS,
  FAILURE_CODES: Policy.FAILURE_CODES
};
