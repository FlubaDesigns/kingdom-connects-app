/* Nexus Browser Upload Test - Tests REAL browser upload flow via Puppeteer */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const TEST_EMAIL = 'perceys@gmail.com';
const TEST_BUSINESS_ID = 'Ft0e7k8Pp48BLiBjVLk8';

class BrowserUploadTest {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:5000';
    this.timeout = options.timeout || 60000;
    this.testPassword = process.env.FIREBASE_TEST_PASSWORD;
  }

  async run() {
    const result = {
      status: 'fail',
      checks: [],
      errors: [],
      progressEvents: [],
      finalProgress: 0,
      uploadCompleted: false,
      fileUrl: null
    };

    if (!this.testPassword) {
      result.errors.push('FIREBASE_TEST_PASSWORD not set');
      return result;
    }

    let browser = null;
    let testFilePath = null;

    try {
      testFilePath = await this.createTestImage();
      result.checks.push({ name: 'createTestFile', status: 'pass' });

      browser = await puppeteer.launch({
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-130.0.6723.116/bin/chromium',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      result.checks.push({ name: 'launchBrowser', status: 'pass' });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[STORAGE v17] Progress:')) {
          const match = text.match(/Progress:\s*(\d+)%/);
          if (match) {
            const progress = parseInt(match[1], 10);
            result.progressEvents.push({ time: Date.now(), progress });
            result.finalProgress = Math.max(result.finalProgress, progress);
          }
        }
        if (text.includes('[STORAGE v17] SUCCESS:')) {
          result.uploadCompleted = true;
        }
        if (text.includes('[STORAGE v17] FAILED:')) {
          result.errors.push(text);
        }
      });

      await page.goto(`${this.baseUrl}/login.html`, { waitUntil: 'networkidle2', timeout: 30000 });
      result.checks.push({ name: 'loadLoginPage', status: 'pass' });

      await page.type('#email', TEST_EMAIL);
      await page.type('#password', this.testPassword);
      await page.click('button[type="submit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
      result.checks.push({ name: 'login', status: 'pass' });

      await page.goto(`${this.baseUrl}/business-admin/edit-listing.html?id=${TEST_BUSINESS_ID}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 5000));
      result.checks.push({ name: 'loadEditPage', status: 'pass' });

      const photosSection = await page.$('#photosSection');
      if (!photosSection) {
        result.errors.push('Photos section not found - may not be Pro user');
        result.checks.push({ name: 'findPhotosSection', status: 'fail' });
        return result;
      }
      result.checks.push({ name: 'findPhotosSection', status: 'pass' });

      const fileInput = await page.$('#photoFileInput');
      if (!fileInput) {
        result.errors.push('Photo file input not found');
        result.checks.push({ name: 'findFileInput', status: 'fail' });
        return result;
      }
      result.checks.push({ name: 'findFileInput', status: 'pass' });

      await fileInput.uploadFile(testFilePath);
      result.checks.push({ name: 'triggerUpload', status: 'pass' });

      const uploadTimeout = 45000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < uploadTimeout) {
        await new Promise(r => setTimeout(r, 500));
        
        if (result.uploadCompleted) {
          result.status = 'pass';
          result.checks.push({ name: 'uploadComplete', status: 'pass' });
          break;
        }
        
        if (result.finalProgress > 0 && result.finalProgress < 100) {
          continue;
        }
      }

      if (!result.uploadCompleted) {
        if (result.finalProgress === 0) {
          result.errors.push('Upload stuck at 0% - CORS or proxy issue');
          result.checks.push({ name: 'progressAdvanced', status: 'fail' });
        } else {
          result.errors.push(`Upload timed out at ${result.finalProgress}%`);
          result.checks.push({ name: 'uploadComplete', status: 'fail' });
        }
      }

    } catch (err) {
      result.errors.push(`Browser test error: ${err.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (testFilePath && fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }

    return result;
  }

  async createTestImage() {
    const testDir = '/tmp/nexus-test';
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const testFile = path.join(testDir, `nexus-browser-test-${Date.now()}.png`);
    
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
      0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    fs.writeFileSync(testFile, pngBuffer);
    return testFile;
  }
}

async function runBrowserUploadTest(options = {}) {
  const test = new BrowserUploadTest(options);
  return await test.run();
}

module.exports = { BrowserUploadTest, runBrowserUploadTest };
