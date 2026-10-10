/**
 * Nexus Image Utilities
 * Image-specific creation, processing, and testing tools
 * 
 * TOOLBOX INDEX: /js/nexus/NEXUS-INDEX.md
 */
import { MediaCommon } from './common.js';

export const ImageTools = {
  createTestImage(options = {}) {
    return new Promise((resolve) => {
      const width = options.width || 200;
      const height = options.height || 200;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, options.color1 || '#d4af37');
      gradient.addColorStop(1, options.color2 || '#8b6914');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(options.label || 'NEXUS TEST', width / 2, height / 2 - 10);
      ctx.font = '12px Arial';
      ctx.fillText(new Date().toISOString().split('T')[0], width / 2, height / 2 + 10);
      ctx.fillText(Date.now().toString(), width / 2, height / 2 + 30);
      
      canvas.toBlob((blob) => {
        const file = new File([blob], `nexus-test-${Date.now()}.png`, { type: 'image/png' });
        const url = URL.createObjectURL(file);
        resolve({ file, url, width, height, size: blob.size });
      }, 'image/png');
    });
  },

  validateImage(file, options = {}) {
    const maxSize = options.maxSize || 10 * 1024 * 1024;
    const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return MediaCommon.validateFile(file, { maxSize, allowedTypes });
  },

  async getImageDimensions(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  },

  async resizeImage(file, maxWidth, maxHeight) {
    const dimensions = await this.getImageDimensions(file);
    
    let { width, height } = dimensions;
    if (width <= maxWidth && height <= maxHeight) {
      return { file, width, height, resized: false };
    }
    
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          const resizedFile = new File([blob], file.name, { type: file.type });
          resolve({ file: resizedFile, width, height, resized: true, originalSize: file.size });
        }, file.type, 0.9);
      };
      
      img.src = url;
    });
  },

  async runFullTest(options = {}) {
    const results = {
      status: 'pending',
      checks: [],
      startTime: Date.now()
    };
    
    const basePath = options.basePath || '_kc_healthchecks/image-test';
    let imagePath = null;
    
    try {
      const testImage = await this.createTestImage();
      results.checks.push({ 
        name: 'create-image', 
        status: 'pass', 
        details: `${testImage.width}x${testImage.height} PNG, ${testImage.size} bytes` 
      });
      
      imagePath = `${basePath}/${Date.now()}.png`;
      const upload = await MediaCommon.uploadWithProgress(testImage.file, imagePath, options.onProgress);
      results.checks.push({ 
        name: 'upload-image', 
        status: 'pass', 
        details: `${testImage.size} bytes uploaded` 
      });
      
      const info = await MediaCommon.getFileInfo(imagePath);
      results.checks.push({ 
        name: 'verify-image', 
        status: info.exists ? 'pass' : 'fail', 
        details: info.exists ? 'Accessible' : 'Not found' 
      });
      
      URL.revokeObjectURL(testImage.url);
      
      if (options.cleanup !== false) {
        await MediaCommon.deleteFile(imagePath);
        results.checks.push({ name: 'cleanup', status: 'pass', details: 'File deleted' });
      }
      
      results.status = 'pass';
      results.duration = Date.now() - results.startTime;
      results.imageUrl = upload.url;
      
    } catch (err) {
      results.status = 'fail';
      results.error = err.message;
      results.duration = Date.now() - results.startTime;
      
      if (options.cleanup !== false && imagePath) {
        await MediaCommon.deleteFile(imagePath);
      }
    }
    
    return results;
  }
};

export default ImageTools;
