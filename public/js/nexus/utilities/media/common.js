/**
 * Nexus Media Common Utilities
 * Shared functions for all media types (images, videos, files)
 * 
 * TOOLBOX INDEX: /js/nexus/NEXUS-INDEX.md
 */
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, getMetadata } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { storage } from '/js/firebase-config.js';

export const MediaCommon = {
  async uploadWithProgress(file, storagePath, onProgress) {
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (onProgress) onProgress(percent);
        },
        (error) => reject(error),
        async () => {
          const url = await getDownloadURL(storageRef);
          resolve({ url, path: storagePath, size: file.size });
        }
      );
    });
  },

  async deleteFile(storagePath) {
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
      return { success: true, path: storagePath };
    } catch (err) {
      return { success: false, path: storagePath, error: err.message };
    }
  },

  async getFileInfo(storagePath) {
    try {
      const storageRef = ref(storage, storagePath);
      const metadata = await getMetadata(storageRef);
      const url = await getDownloadURL(storageRef);
      return {
        exists: true,
        path: storagePath,
        size: metadata.size,
        contentType: metadata.contentType,
        created: metadata.timeCreated,
        updated: metadata.updated,
        url
      };
    } catch (err) {
      return { exists: false, path: storagePath, error: err.message };
    }
  },

  validateFile(file, options = {}) {
    const maxSize = options.maxSize || 50 * 1024 * 1024;
    const allowedTypes = options.allowedTypes || [];
    
    const errors = [];
    
    if (file.size > maxSize) {
      errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${maxSize / 1024 / 1024}MB)`);
    }
    
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      errors.push(`Invalid type: ${file.type} (allowed: ${allowedTypes.join(', ')})`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      file: {
        name: file.name,
        size: file.size,
        type: file.type
      }
    };
  },

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
};

export default MediaCommon;
