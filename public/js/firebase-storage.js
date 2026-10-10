/* Firebase Storage Helper - Kingdom Connects - v17 */
import { storage, auth } from './firebase-config.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

console.warn('[KC-STORAGE] Version 17 loaded - ' + new Date().toISOString());

function inferContentType(file) {
  const name = (file?.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm'
  };
  return map[ext] || '';
}

function mapStorageError(error) {
  const code = error?.code || 'storage/unknown';
  const errorMessages = {
    'storage/unauthorized': 'Permission denied. Please check your login status and try again.',
    'storage/canceled': 'Upload was cancelled.',
    'storage/retry-limit-exceeded': 'Network issues. Please check your connection and try again.',
    'storage/invalid-checksum': 'File corrupted during upload. Please try again.',
    'storage/quota-exceeded': 'Storage quota exceeded. Please contact support.',
    'storage/unauthenticated': 'You must be logged in to upload files.',
    'storage/unknown': 'An unexpected error occurred. Please try again.'
  };
  return errorMessages[code] || error?.message || errorMessages['storage/unknown'];
}

export function validateFile(file, options = {}) {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
  } = options;

  if (!file) return { valid: false, error: 'No file provided.' };

  if (file.size > maxSize) {
    return { valid: false, error: `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.` };
  }

  const inferred = inferContentType(file);
  const typeToCheck = (file.type && file.type.trim()) ? file.type : inferred;

  if (!typeToCheck || !allowedTypes.includes(typeToCheck)) {
    return { valid: false, error: 'Invalid file type. Please upload images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM).' };
  }

  return { valid: true, contentType: typeToCheck };
}

export async function uploadBusinessImage(businessId, file, type = 'images', onProgress = null) {
  console.log('[STORAGE v16] Start:', file.name, file.size, 'bytes, auth:', auth.currentUser?.email || 'NONE');
  
  if (!businessId || businessId === 'null' || businessId === 'undefined') {
    console.error('[STORAGE v16] INVALID BUSINESS ID:', businessId);
    return { success: false, error: 'Business ID not loaded yet. Please wait and try again.', code: 'invalid/business-id' };
  }
  
  if (!auth.currentUser) {
    console.error('[STORAGE v16] NOT LOGGED IN');
    return { success: false, error: 'You must be logged in to upload files', code: 'auth/not-logged-in' };
  }

  const v = validateFile(file);
  if (!v.valid) {
    console.error('[STORAGE v16] VALIDATION FAILED:', v.error);
    return { success: false, error: v.error, code: 'invalid/file' };
  }
  
  const path = `businesses/${businessId}/${type}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const storageRef = ref(storage, path);
  
  const metadata = {
    contentType: v.contentType || file.type || inferContentType(file) || 'application/octet-stream',
    cacheControl: 'public,max-age=31536000'
  };
  
  console.log('[STORAGE v17] Starting upload to:', path, 'contentType:', metadata.contentType);
  
  return new Promise((resolve) => {
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);
    
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        console.log('[STORAGE v17] Progress:', progress + '%');
        if (onProgress) onProgress(progress);
      },
      (error) => {
        console.error('[STORAGE v17] FAILED:', error.code, error.message);
        resolve({ success: false, error: mapStorageError(error), code: error.code });
      },
      async () => {
        try {
          console.log('[STORAGE v17] Upload complete, getting URL...');
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[STORAGE v17] SUCCESS:', url.substring(0, 50) + '...');
          resolve({ success: true, url, path: uploadTask.snapshot.ref.fullPath, name: file.name, size: file.size });
        } catch (err) {
          console.error('[STORAGE v17] URL fetch failed:', err.message);
          resolve({ success: false, error: 'Upload succeeded but could not get URL', code: 'url/failed' });
        }
      }
    );
  });
}

export async function uploadChurchImage(churchId, file, type = 'images', onProgress = null) {
  console.log('[STORAGE v16] Church upload:', file.name, file.size, 'bytes');
  
  if (!auth.currentUser) {
    return { success: false, error: 'You must be logged in to upload files', code: 'auth/not-logged-in' };
  }

  const v = validateFile(file);
  if (!v.valid) {
    console.error('[STORAGE v16] VALIDATION FAILED:', v.error);
    return { success: false, error: v.error, code: 'invalid/file' };
  }
  
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageRef = ref(storage, `churches/${churchId}/${type}/${timestamp}_${sanitizedName}`);
  
  const metadata = {
    contentType: v.contentType || file.type || inferContentType(file) || 'application/octet-stream',
    cacheControl: 'public,max-age=31536000'
  };
  
  return new Promise((resolve) => {
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);
    
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        console.log('[STORAGE v16] Church progress:', progress + '%');
        if (onProgress) onProgress(progress);
      },
      (error) => {
        resolve({ success: false, error: mapStorageError(error), code: error.code });
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ success: true, url, path: uploadTask.snapshot.ref.fullPath, name: file.name, size: file.size });
        } catch (err) {
          resolve({ success: false, error: 'Could not get URL', code: 'url/failed' });
        }
      }
    );
  });
}

export async function deleteFile(filePath) {
  try {
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
    return { success: true };
  } catch (error) {
    console.error('[STORAGE v16] Delete error:', error);
    return { success: false, error: error.message };
  }
}

export async function listBusinessFiles(businessId, type = 'images') {
  try {
    const listRef = ref(storage, `businesses/${businessId}/${type}`);
    const result = await listAll(listRef);
    
    const files = await Promise.all(
      result.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          name: itemRef.name,
          path: itemRef.fullPath,
          url: url
        };
      })
    );
    
    return { success: true, files };
  } catch (error) {
    console.error('[STORAGE v16] List error:', error);
    return { success: false, error: error.message, files: [] };
  }
}

export async function listChurchFiles(churchId, type = 'images') {
  try {
    const listRef = ref(storage, `churches/${churchId}/${type}`);
    const result = await listAll(listRef);
    
    const files = await Promise.all(
      result.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          name: itemRef.name,
          path: itemRef.fullPath,
          url: url
        };
      })
    );
    
    return { success: true, files };
  } catch (error) {
    console.error('[STORAGE v16] List error:', error);
    return { success: false, error: error.message, files: [] };
  }
}
