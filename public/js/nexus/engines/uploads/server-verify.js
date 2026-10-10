/**
 * Server-Side Upload Verify Engines
 * 
 * VERIFY engines for Node.js context using Firebase Admin SDK.
 * Uses canonical base classes from engine.cjs.js
 */

const { VerifyEngine } = require('../../core/engine.cjs.js');
const zlib = require('zlib');

function createMinimalPNG() {
  const width = 100;
  const height = 100;
  
  function crc32(buf) {
    let crc = -1;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      table[n] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }
  
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const combined = Buffer.concat([typeBytes, data]);
    const crcVal = crc32(combined);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal);
    return Buffer.concat([length, combined, crcBuf]);
  }
  
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      rawData.push(255, 215, 0);
    }
  }
  
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const iend = Buffer.alloc(0);
  
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend)
  ]);
}

function createMinimalWebM() {
  const header = Buffer.from([
    0x1A, 0x45, 0xDF, 0xA3,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F,
    0x42, 0x86, 0x81, 0x01,
    0x42, 0xF7, 0x81, 0x01,
    0x42, 0xF2, 0x81, 0x04,
    0x42, 0xF3, 0x81, 0x08,
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,
    0x42, 0x87, 0x81, 0x04,
    0x42, 0x85, 0x81, 0x02,
  ]);
  
  const segment = Buffer.from([
    0x18, 0x53, 0x80, 0x67,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10,
  ]);
  
  const info = Buffer.from([
    0x15, 0x49, 0xA9, 0x66,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
    0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40,
  ]);
  
  return Buffer.concat([header, segment, info]);
}

class VerifyImageUpload extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.server.imageUpload',
      name: 'Server Image Upload Verification',
      description: 'Uploads a test image via Admin SDK and verifies it exists'
    });
  }
  
  async run(ctx) {
    const admin = ctx.admin;
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const timestamp = Date.now();
    const testPath = `_kc_healthchecks/images/server-test-${timestamp}.png`;
    
    try {
      const pngBuffer = createMinimalPNG();
      
      const file = bucket.file(testPath);
      await file.save(pngBuffer, {
        metadata: {
          contentType: 'image/png',
          metadata: {
            source: 'nexus-server-verify',
            timestamp: timestamp.toString()
          }
        }
      });
      
      const [exists] = await file.exists();
      if (!exists) {
        return this.fail('Image uploaded but does not exist', { path: testPath, exists: false });
      }
      
      const [metadata] = await file.getMetadata();
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60000
      });
      
      await file.delete();
      
      return this.pass({
        path: testPath,
        size: metadata.size,
        contentType: metadata.contentType,
        uploaded: true,
        verified: true,
        signedUrlGenerated: !!signedUrl,
        cleanedUp: true
      });
    } catch (error) {
      try {
        await bucket.file(testPath).delete();
      } catch (e) {}
      
      return this.fail(`Image upload verification failed: ${error.message}`, {
        path: testPath,
        error: error.message
      });
    }
  }
}

class VerifyVideoUpload extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.server.videoUpload',
      name: 'Server Video Upload Verification',
      description: 'Uploads a test video via Admin SDK and verifies it exists'
    });
  }
  
  async run(ctx) {
    const admin = ctx.admin;
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const timestamp = Date.now();
    const testPath = `_kc_healthchecks/videos/server-test-${timestamp}.webm`;
    
    try {
      const webmBuffer = createMinimalWebM();
      
      const file = bucket.file(testPath);
      await file.save(webmBuffer, {
        metadata: {
          contentType: 'video/webm',
          metadata: {
            source: 'nexus-server-verify',
            timestamp: timestamp.toString()
          }
        }
      });
      
      const [exists] = await file.exists();
      if (!exists) {
        return this.fail('Video uploaded but does not exist', { path: testPath, exists: false });
      }
      
      const [metadata] = await file.getMetadata();
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60000
      });
      
      await file.delete();
      
      return this.pass({
        path: testPath,
        size: metadata.size,
        contentType: metadata.contentType,
        uploaded: true,
        verified: true,
        signedUrlGenerated: !!signedUrl,
        cleanedUp: true
      });
    } catch (error) {
      try {
        await bucket.file(testPath).delete();
      } catch (e) {}
      
      return this.fail(`Video upload verification failed: ${error.message}`, {
        path: testPath,
        error: error.message
      });
    }
  }
}

class VerifyBusinessMediaPath extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.server.businessMediaPath',
      name: 'Business Media Path Verification',
      description: 'Verifies upload to actual business_media paths works'
    });
  }
  
  async run(ctx) {
    const admin = ctx.admin;
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const timestamp = Date.now();
    const testBusinessId = '_nexus_test_business';
    const imagePath = `business_media/images/${testBusinessId}/test-${timestamp}.png`;
    const videoPath = `business_media/videos/${testBusinessId}/test-${timestamp}.webm`;
    
    const results = { image: null, video: null };
    
    try {
      const pngBuffer = createMinimalPNG();
      const imageFile = bucket.file(imagePath);
      await imageFile.save(pngBuffer, { metadata: { contentType: 'image/png' } });
      const [imageExists] = await imageFile.exists();
      results.image = { path: imagePath, exists: imageExists };
      await imageFile.delete();
      results.image.cleanedUp = true;
      
      const webmBuffer = createMinimalWebM();
      const videoFile = bucket.file(videoPath);
      await videoFile.save(webmBuffer, { metadata: { contentType: 'video/webm' } });
      const [videoExists] = await videoFile.exists();
      results.video = { path: videoPath, exists: videoExists };
      await videoFile.delete();
      results.video.cleanedUp = true;
      
      if (results.image.exists && results.video.exists) {
        return this.pass({
          businessId: testBusinessId,
          image: results.image,
          video: results.video
        });
      } else {
        return this.fail('Business media paths not fully working', results);
      }
    } catch (error) {
      try {
        await bucket.file(imagePath).delete();
        await bucket.file(videoPath).delete();
      } catch (e) {}
      
      return this.fail(`Business media path verification failed: ${error.message}`, {
        error: error.message,
        results
      });
    }
  }
}

class VerifyChurchMediaPath extends VerifyEngine {
  constructor() {
    super({
      id: 'verify.server.churchMediaPath',
      name: 'Church Media Path Verification',
      description: 'Verifies upload to actual church_media paths works'
    });
  }
  
  async run(ctx) {
    const admin = ctx.admin;
    const bucket = admin.storage().bucket('kingdom-commerce.firebasestorage.app');
    const timestamp = Date.now();
    const testChurchId = '_nexus_test_church';
    const imagePath = `church_media/images/${testChurchId}/test-${timestamp}.png`;
    const videoPath = `church_media/videos/${testChurchId}/test-${timestamp}.webm`;
    
    const results = { image: null, video: null };
    
    try {
      const pngBuffer = createMinimalPNG();
      const imageFile = bucket.file(imagePath);
      await imageFile.save(pngBuffer, { metadata: { contentType: 'image/png' } });
      const [imageExists] = await imageFile.exists();
      results.image = { path: imagePath, exists: imageExists };
      await imageFile.delete();
      results.image.cleanedUp = true;
      
      const webmBuffer = createMinimalWebM();
      const videoFile = bucket.file(videoPath);
      await videoFile.save(webmBuffer, { metadata: { contentType: 'video/webm' } });
      const [videoExists] = await videoFile.exists();
      results.video = { path: videoPath, exists: videoExists };
      await videoFile.delete();
      results.video.cleanedUp = true;
      
      if (results.image.exists && results.video.exists) {
        return this.pass({
          churchId: testChurchId,
          image: results.image,
          video: results.video
        });
      } else {
        return this.fail('Church media paths not fully working', results);
      }
    } catch (error) {
      try {
        await bucket.file(imagePath).delete();
        await bucket.file(videoPath).delete();
      } catch (e) {}
      
      return this.fail(`Church media path verification failed: ${error.message}`, {
        error: error.message,
        results
      });
    }
  }
}

const serverUploadVerify = [
  new VerifyImageUpload(),
  new VerifyVideoUpload(),
  new VerifyBusinessMediaPath(),
  new VerifyChurchMediaPath()
];

module.exports = {
  VerifyImageUpload,
  VerifyVideoUpload,
  VerifyBusinessMediaPath,
  VerifyChurchMediaPath,
  serverUploadVerify,
  createMinimalPNG,
  createMinimalWebM
};
