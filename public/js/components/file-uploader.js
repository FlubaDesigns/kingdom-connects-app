/* File Upload Component - Kingdom Connects - v16 (instance-safe) */
import { uploadBusinessImage, uploadChurchImage, validateFile, deleteFile } from '/js/firebase-storage.js?v=16';

export class FileUploader {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.instanceId = containerId + '_' + Math.random().toString(36).substr(2, 6);
    this.options = {
      maxFiles: options.maxFiles || 10,
      maxSize: options.maxSize || 10 * 1024 * 1024,
      allowedTypes: options.allowedTypes || ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],
      entityType: options.entityType || 'business',
      entityId: options.entityId || null,
      mediaType: options.mediaType || 'images',
      onUploadComplete: options.onUploadComplete || null
    };
    this.uploadedFiles = [];
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="file-uploader">
        <div class="kc-upload-area">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p><strong>Click to upload</strong> or drag and drop</p>
          <p class="text-sm text-muted">Images (JPEG, PNG, GIF, WebP) or Videos (MP4, WebM)</p>
          <p class="text-sm text-muted">Maximum file size: ${Math.round(this.options.maxSize / 1024 / 1024)}MB</p>
          <input type="file" class="kc-file-input hidden" multiple accept="${this.options.allowedTypes.join(',')}">
        </div>
        <div class="kc-uploaded-files"></div>
        <div class="kc-upload-progress hidden">
          <div class="progress-bar">
            <div class="kc-progress-fill"></div>
          </div>
          <p class="text-sm text-muted kc-progress-text">Uploading...</p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const uploadArea = this.container.querySelector('.kc-upload-area');
    const fileInput = this.container.querySelector('.kc-file-input');

    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      this.handleFiles(e.dataTransfer.files);
    });
  }

  async handleFiles(files) {
    const fileArray = Array.from(files);
    
    if (this.uploadedFiles.length + fileArray.length > this.options.maxFiles) {
      const msg = `Maximum ${this.options.maxFiles} files allowed.`;
      if (typeof window.showToast === 'function') {
        window.showToast(msg, 'info');
      } else {
        alert(msg);
      }
      return;
    }

    const progressDiv = this.container.querySelector('.kc-upload-progress');
    const progressFill = this.container.querySelector('.kc-progress-fill');
    const progressText = this.container.querySelector('.kc-progress-text');
    
    progressDiv.classList.remove('hidden');

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      
      const validation = validateFile(file, {
        maxSize: this.options.maxSize,
        allowedTypes: this.options.allowedTypes
      });

      if (!validation.valid) {
        if (typeof window.showToast === 'function') {
          window.showToast(validation.error, 'error');
        } else {
          alert(validation.error);
        }
        continue;
      }

      progressText.textContent = `Uploading ${file.name} (${i + 1}/${fileArray.length})...`;
      progressFill.style.width = `${((i + 1) / fileArray.length) * 100}%`;

      let result;
      if (this.options.entityType === 'business') {
        result = await uploadBusinessImage(this.options.entityId, file, this.options.mediaType);
      } else if (this.options.entityType === 'church') {
        result = await uploadChurchImage(this.options.entityId, file, this.options.mediaType);
      }

      if (result.success) {
        this.uploadedFiles.push(result);
        this.renderUploadedFiles();
        
        if (this.options.onUploadComplete) {
          this.options.onUploadComplete(result);
        }
      } else {
        const msg = `Failed to upload ${file.name}: ${result.error}`;
        if (typeof window.showToast === 'function') {
          window.showToast(msg, 'error');
        } else {
          alert(msg);
        }
      }
    }

    progressDiv.classList.add('hidden');
    progressFill.style.width = '0%';
    this.container.querySelector('.kc-file-input').value = '';
  }

  renderUploadedFiles() {
    const container = this.container.querySelector('.kc-uploaded-files');
    
    if (this.uploadedFiles.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<h4 class="m-block-sm">Uploaded Files</h4>';
    
    this.uploadedFiles.forEach((file, index) => {
      const isImage = file.url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
      const isVideo = file.url.match(/\.(mp4|webm)$/i);

      const fileCard = document.createElement('div');
      fileCard.className = 'file-card';
      fileCard.innerHTML = `
        <div class="file-preview">
          ${isImage ? `<img src="${file.url}" alt="${file.name}">` : 
            isVideo ? `<video src="${file.url}" controls></video>` : 
            `<div class="file-icon">📄</div>`}
        </div>
        <div class="file-info">
          <p class="file-name">${file.name}</p>
          <p class="file-size text-sm text-muted">${this.formatFileSize(file.size)}</p>
        </div>
        <button class="delete-file-btn" data-index="${index}" data-path="${file.path}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;
      
      container.appendChild(fileCard);
    });

    container.querySelectorAll('.delete-file-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteFile(btn.dataset.index, btn.dataset.path));
    });
  }

  async deleteFile(index, path) {
    if (!confirm('Delete this file?')) return;

    const result = await deleteFile(path);
    
    if (result.success) {
      this.uploadedFiles.splice(index, 1);
      this.renderUploadedFiles();
    } else {
      const msg = `Failed to delete file: ${result.error}`;
      if (typeof window.showToast === 'function') {
        window.showToast(msg, 'error');
      } else {
        alert(msg);
      }
    }
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  getUploadedFiles() {
    return this.uploadedFiles;
  }
}
