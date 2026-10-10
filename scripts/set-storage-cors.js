const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '../attached_assets/kc-service-account_1762737530761.json');
const CORS_CONFIG_PATH = path.join(__dirname, '../cors.json');
const firebaseConfig = require('../config/firebase.json');
const BUCKET_NAME = firebaseConfig.storageBucket;

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.full_control',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${base64Header}.${base64Payload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${signatureInput}.${signature}`;

  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`Token error: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function setCors(accessToken, corsConfig) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cors: corsConfig });
    const options = {
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${BUCKET_NAME}?fields=cors`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response:', data);
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`CORS update failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    console.log('Loading service account...');
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    
    console.log('Loading CORS config...');
    const corsConfig = JSON.parse(fs.readFileSync(CORS_CONFIG_PATH, 'utf8'));
    
    const extraOriginsRaw = process.env.KC_CORS_ORIGINS || '';
    const extraOrigins = extraOriginsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (extraOrigins.length) {
      corsConfig[0].origin = Array.from(new Set([...(corsConfig[0].origin || []), ...extraOrigins]));
      console.log('KC_CORS_ORIGINS merged into cors.json origins:', extraOrigins);
    }
    
    console.log('Getting access token...');
    const accessToken = await getAccessToken(serviceAccount);
    console.log('Access token obtained.');
    
    console.log('Setting CORS on bucket:', BUCKET_NAME);
    const result = await setCors(accessToken, corsConfig);
    console.log('CORS updated successfully!');
    console.log('New CORS config:', JSON.stringify(result.cors, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
