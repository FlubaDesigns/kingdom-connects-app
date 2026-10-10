import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { uploadBusinessImage, validateFile, deleteFile } from "/js/firebase-storage.js?v=16";
import { isBusinessPro, applyProFeatures, getMaxCategories } from "../../js/role-utils.js";
import { fetchActiveChurches } from "../../js/services/church-service.js";
import { updateBusiness } from "../../js/services/business-service.js";

function uploadLog(msg, type = 'info') {
  const logDiv = document.getElementById('uploadDebugLog');
  if (logDiv) {
    logDiv.style.display = 'block';
    const line = document.createElement('div');
    const colors = { success: '#4ade80', error: '#f87171', info: '#60a5fa' };
    line.style.color = colors[type] || colors.info;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
  console.log(`[UPLOAD ${type.toUpperCase()}] ${msg}`);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPhoneNumber(phone) {
  const cleaned = ('' + phone).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return phone;
}

function unformatPhoneNumber(phone) {
  return ('' + phone).replace(/\D/g, '');
}

function setupPhoneFormatting() {
  const phoneInput = document.getElementById('phone');
  if (!phoneInput) return;
  
  phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) value = value.slice(0, 10);
    
    if (value.length >= 6) {
      e.target.value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6);
    } else if (value.length >= 3) {
      e.target.value = value.slice(0, 3) + '-' + value.slice(3);
    } else {
      e.target.value = value;
    }
  });
}

let businessId = null;
let currentBusiness = null;
let allCategories = [];
let secondaryCategorySelects = [];

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  initPage(businessContext);
});

async function initPage(businesses) {
  const loadingMessage = document.getElementById('loadingMessage');
  const noBusinessMessage = document.getElementById('noBusinessMessage');
  const businessForm = document.getElementById('businessForm');

  try {
    let activeBusiness = null;
    if (businesses) {
      for (const biz of businesses) {
        if (biz.listing_status === 'active') {
          activeBusiness = biz;
          break;
        }
      }
    }

    if (!activeBusiness) {
      loadingMessage.classList.add('hidden');
      noBusinessMessage.classList.remove('hidden');
      return;
    }

    businessId = activeBusiness.id;
    currentBusiness = activeBusiness;

    try { initPhotoUploader(); } catch (e) { console.error('[Upload] initPhotoUploader failed:', e); }
    try { initVideoUploader(); } catch (e) { console.error('[Upload] initVideoUploader failed:', e); }

    await Promise.all([loadCategories(), loadChurches()]);
    populateForm(currentBusiness);

    loadingMessage.classList.add('hidden');
    businessForm.classList.remove('hidden');
    
    const quickActionsSection = document.getElementById('quickActionsSection');
    if (quickActionsSection) {
      quickActionsSection.classList.remove('hidden');
    }
    
    const quickSave = document.getElementById('quickSave');
    if (quickSave) {
      quickSave.addEventListener('click', () => {
        document.getElementById('businessForm').requestSubmit();
      });
    }
    
    setupPhoneFormatting();
    calculateBusinessProfileCompletion(currentBusiness);

  } catch (error) {
    console.error('Error loading business:', error);
    loadingMessage.textContent = 'Error loading business: ' + error.message;
    loadingMessage.classList.add('error-text');
  }
}

    let parentCategories = [];
    let childCategories = [];

    async function loadCategories() {
      try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        allCategories = [];
        querySnapshot.forEach((doc) => {
          const cat = doc.data();
          if (cat.active) {
            allCategories.push({
              slug: cat.slug,
              label: cat.label,
              parent_slug: cat.parent_slug || null,
              display_order: cat.display_order || 999
            });
          }
        });

        allCategories.sort((a, b) => a.display_order - b.display_order);

        // Separate parents (no parent_slug) and children (have parent_slug)
        parentCategories = allCategories.filter(cat => !cat.parent_slug);
        childCategories = allCategories.filter(cat => cat.parent_slug);

        const primarySelect = document.getElementById('primary_category');
        
        // Only show PARENT categories in primary dropdown
        parentCategories.forEach(parent => {
          const option = document.createElement('option');
          option.value = parent.slug;
          option.textContent = parent.label;
          primarySelect.appendChild(option);
        });

        // Add change listener to rebuild secondary categories when primary changes
        primarySelect.addEventListener('change', handlePrimaryCategoryChange);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }

    function handlePrimaryCategoryChange() {
      // Clear existing secondary category selections
      const container = document.getElementById('categoriesContainer');
      container.innerHTML = '';
      secondaryCategorySelects = [];
      
      // Show message about subcategories
      const primaryValue = document.getElementById('primary_category').value;
      const availableSubs = childCategories.filter(cat => cat.parent_slug === primaryValue);
      
      if (availableSubs.length === 0) {
        container.innerHTML = '<p class="text-sm opacity-70">No subcategories available for this category</p>';
      }
    }

    let allChurches = [];

    async function loadChurches() {
      try {
        const churches = await fetchActiveChurches();
        
        allChurches = churches.map(church => ({
          id: church.id,
          name: church.church_name || 'Unnamed Church'
        }));

        renderChurchOptions(allChurches);
        setupChurchSearch();
      } catch (error) {
        console.error('Error loading churches:', error);
      }
    }

    function renderChurchOptions(churches) {
      const churchSelect = document.getElementById('church_id');
      churchSelect.innerHTML = '<option value="">No church selected</option>';
      
      churches.forEach(church => {
        const option = document.createElement('option');
        option.value = church.id;
        option.textContent = church.name;
        churchSelect.appendChild(option);
      });
    }

    function setupChurchSearch() {
      const searchInput = document.getElementById('churchSearch');
      const churchSelect = document.getElementById('church_id');

      searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        
        if (!searchTerm) {
          renderChurchOptions(allChurches);
          return;
        }

        const filtered = allChurches.filter(church => 
          church.name.toLowerCase().includes(searchTerm)
        );
        
        renderChurchOptions(filtered);
      });

      churchSelect.addEventListener('change', () => {
        if (churchSelect.value) {
          const selectedChurch = allChurches.find(c => c.id === churchSelect.value);
          if (selectedChurch) {
            searchInput.value = selectedChurch.name;
          }
        }
      });
    }

    function populateForm(business) {
      document.getElementById('church_id').disabled = true;
      const affiliationSearch = document.getElementById('churchSearch');
      if (affiliationSearch) affiliationSearch.disabled = true;
      document.getElementById('business_name').value = business.business_name || '';
      document.getElementById('owner_name').value = business.your_name || '';
      document.getElementById('email').value = business.email || '';
      document.getElementById('phone').value = formatPhoneNumber(business.phone_number || '');
      document.getElementById('phone_ext').value = business.phone_ext || '';
      document.getElementById('website').value = business.website_url || '';
      document.getElementById('description').value = business.description || '';
      
      const primaryCategorySelect = document.getElementById('primary_category');
      if (business.primary_category) {
        primaryCategorySelect.value = business.primary_category;
        if (!primaryCategorySelect.value) {
          console.warn(`Primary category "${business.primary_category}" not found in dropdown options`);
        }
      }
      
      document.getElementById('address_line1').value = business.address_line1 || '';
      document.getElementById('address_line2').value = business.address_line2 || '';
      document.getElementById('city').value = business.city || '';
      document.getElementById('state').value = business.state || '';
      document.getElementById('zip_code').value = business.zip_code || '';
      document.getElementById('country').value = business.country || 'USA';
      
      if (business.church_id) {
        document.getElementById('church_id').value = business.church_id;
        document.getElementById('church_id').disabled = true;
        const selectedChurch = allChurches.find(c => c.id === business.church_id);
        if (selectedChurch) {
          document.getElementById('churchSearch').value = selectedChurch.name;
        }
      }
      
      document.getElementById('allow_reviews').checked = business.allow_reviews !== false;
      document.getElementById('allow_social_sharing').checked = business.allow_social_sharing !== false;
      document.getElementById('allow_review_sharing').checked = business.allow_review_sharing !== false;
      document.getElementById('show_phone').checked = business.show_phone !== false;
      document.getElementById('show_email').checked = business.show_email !== false;
      document.getElementById('show_address').checked = business.show_address !== false;
      document.getElementById('show_website').checked = business.show_website !== false;

      const isPro = isBusinessPro(business);
      console.log('[Pro Status] Raw pro_status from Firestore:', business.pro_status, '| Type:', typeof business.pro_status);
      console.log('[Pro Status] isBusinessPro result:', isPro);
      
      document.getElementById('pro_status_display').value = isPro ? 'Pro Member' : 'Free Tier';
      
      if (business.pro_start_date) {
        const startDate = business.pro_start_date.toDate ? business.pro_start_date.toDate() : new Date(business.pro_start_date);
        document.getElementById('pro_start_date_display').value = startDate.toLocaleDateString();
      } else {
        document.getElementById('pro_start_date_display').value = 'N/A';
      }
      
      if (business.pro_end_date) {
        const endDate = business.pro_end_date.toDate ? business.pro_end_date.toDate() : new Date(business.pro_end_date);
        document.getElementById('pro_end_date_display').value = endDate.toLocaleDateString();
      } else {
        document.getElementById('pro_end_date_display').value = 'N/A';
      }
      
      if (!isPro) {
        document.getElementById('upgradePrompt').classList.remove('hidden');
      }
      
      setupProFeatures(isPro);

      // Load subcategories
      const subcats = business.subcategories || [];
      if (Array.isArray(subcats)) {
        subcats.forEach(cat => addSecondaryCategorySelect(cat));
      }

      if (business.hours_of_operation) {
        populateHours(business.hours_of_operation);
      }

      if (isPro) {
        document.getElementById('show_social_media').checked = business.show_social_media !== false;
        if (business.social_media) {
          document.getElementById('social_facebook').value = business.social_media.facebook || '';
          document.getElementById('social_instagram').value = business.social_media.instagram || '';
          document.getElementById('social_twitter').value = business.social_media.twitter || '';
          document.getElementById('social_linkedin').value = business.social_media.linkedin || '';
        }
      }

      console.log('[KC DEBUG] Loading existing photos. isPro:', isPro, 'photos:', business.photos);
      if (isPro && business.photos && Array.isArray(business.photos)) {
        console.log('[KC DEBUG] Adding', business.photos.length, 'existing photos to array');
        business.photos.forEach(url => addPhotoPreview(url));
        console.log('[KC DEBUG] After loading, photoUrls has', photoUrls.length, 'items');
      }

      if (isPro && business.videos && Array.isArray(business.videos)) {
        business.videos.forEach(url => addVideoItem(url));
      }

      if (isPro && business.video_files && Array.isArray(business.video_files)) {
        console.log('[KC DEBUG] Loading', business.video_files.length, 'existing video files');
        business.video_files.forEach(url => {
          videoFileUrls.push(url);
          videoStoragePaths.push({ url, path: null, thumbnail: null });
        });
        renderVideoGrid();
        updateVideoCount();
      }

      updateDescriptionCounter();
    }

    function setupProFeatures(isPro) {
      console.log('[Pro Features] Setting up Pro features, isPro:', isPro);
      
      const elements = {
        socialSection: document.getElementById('socialMediaSection'),
        socialUpgrade: document.getElementById('socialUpgradePrompt'),
        photosSection: document.getElementById('photosSection'),
        photosUpgrade: document.getElementById('photosUpgradePrompt'),
        videosSection: document.getElementById('videosSection'),
        videosUpgrade: document.getElementById('videosUpgradePrompt'),
        socialProBadge: document.getElementById('socialProBadge'),
        photosProBadge: document.getElementById('photosProBadge'),
        videosProBadge: document.getElementById('videosProBadge')
      };

      if (isPro) {
        console.log('[Pro Features] Enabling Pro sections');
        if (elements.socialSection) elements.socialSection.classList.remove('hidden');
        if (elements.socialUpgrade) elements.socialUpgrade.classList.add('hidden');
        if (elements.photosSection) elements.photosSection.classList.remove('hidden');
        if (elements.photosUpgrade) elements.photosUpgrade.classList.add('hidden');
        if (elements.videosSection) elements.videosSection.classList.remove('hidden');
        if (elements.videosUpgrade) elements.videosUpgrade.classList.add('hidden');
        if (elements.socialProBadge) elements.socialProBadge.classList.remove('hidden');
        if (elements.photosProBadge) elements.photosProBadge.classList.remove('hidden');
        if (elements.videosProBadge) elements.videosProBadge.classList.remove('hidden');
        
        try {
          initPhotoUploader();
          updatePhotoCount();
          initVideoUploader();
          updateVideoCount();
        } catch (err) {
          console.error('[Pro Features] Error initializing uploaders:', err);
        }
      } else {
        console.log('[Pro Features] Disabling Pro sections (free tier)');
        if (elements.socialSection) elements.socialSection.classList.add('hidden');
        if (elements.socialUpgrade) elements.socialUpgrade.classList.remove('hidden');
        if (elements.photosSection) elements.photosSection.classList.add('hidden');
        if (elements.photosUpgrade) elements.photosUpgrade.classList.remove('hidden');
        if (elements.videosSection) elements.videosSection.classList.add('hidden');
        if (elements.videosUpgrade) elements.videosUpgrade.classList.remove('hidden');
      }
      
      console.log('[Pro Features] Setup complete');
    }

    function populateHours(hours) {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      days.forEach(day => {
        if (hours[day]) {
          document.getElementById(`hours_${day}_open`).value = hours[day].open || '';
          document.getElementById(`hours_${day}_close`).value = hours[day].close || '';
        }
      });
    }

    function addSecondaryCategorySelect(selectedValue = '') {
      const isPro = isBusinessPro(currentBusiness);
      const maxCategories = isPro ? 3 : 1;

      if (secondaryCategorySelects.length >= maxCategories) {
        window.showToast(`${isPro ? 'Pro' : 'Free'} tier allows up to ${maxCategories} subcategor${maxCategories === 1 ? 'y' : 'ies'}`, 'info');
        return;
      }

      // Get subcategories for the currently selected primary category
      const primaryValue = document.getElementById('primary_category').value;
      const availableSubs = childCategories.filter(cat => cat.parent_slug === primaryValue);
      
      if (availableSubs.length === 0) {
        window.showToast('No subcategories available for this primary category', 'info');
        return;
      }

      const container = document.getElementById('categoriesContainer');
      const wrapper = document.createElement('div');
      wrapper.className = 'flex-gap mt-sm';

      const select = document.createElement('select');
      select.className = 'input-dark';
      select.innerHTML = '<option value="">Select subcategory...</option>';
      
      // Only show subcategories of the selected primary category
      availableSubs.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.slug;
        option.textContent = cat.label;
        if (cat.slug === selectedValue) option.selected = true;
        select.appendChild(option);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-small btn-danger';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => {
        wrapper.remove();
        const index = secondaryCategorySelects.indexOf(select);
        if (index > -1) secondaryCategorySelects.splice(index, 1);
      };

      wrapper.appendChild(select);
      wrapper.appendChild(removeBtn);
      container.appendChild(wrapper);
      secondaryCategorySelects.push(select);
    }

    document.getElementById('addCategory').addEventListener('click', () => {
      addSecondaryCategorySelect();
    });

    let photoUrls = [];
    let photoStoragePaths = [];

    function updatePhotoCount() {
      const countEl = document.getElementById('photoCount');
      if (countEl) countEl.textContent = photoUrls.length;
    }

    function addPhotoPreview(url, storagePath = null, isPending = false) {
      if (photoUrls.length >= 10) {
        window.showToast('Maximum 10 photos allowed', 'info');
        return;
      }

      photoUrls.push(url);
      if (storagePath) photoStoragePaths.push({ url, path: storagePath });
      
      const grid = document.getElementById('photoPreviewGrid');
      const item = document.createElement('div');
      item.className = 'photo-item' + (isPending ? ' photo-pending' : '');
      item.dataset.url = url;
      item.innerHTML = `
        <img src="${url}" alt="Business photo">
        ${isPending ? '<div class="photo-loading"><span class="spinner"></span></div>' : ''}
        <button class="photo-remove" data-action="removePhoto" data-id="${url}">×</button>
      `;
      grid.appendChild(item);
      updatePhotoCount();
    }

    window.removePhoto = async (url) => {
      const pathInfo = photoStoragePaths.find(p => p.url === url);
      if (pathInfo) {
        const result = await deleteFile(pathInfo.path);
        if (!result.success) {
          window.showToast('Failed to delete file from storage', 'error');
          return;
        }
        photoStoragePaths = photoStoragePaths.filter(p => p.url !== url);
      }
      photoUrls = photoUrls.filter(u => u !== url);
      renderPhotoGrid();
      updatePhotoCount();
    };

    function renderPhotoGrid() {
      const grid = document.getElementById('photoPreviewGrid');
      grid.innerHTML = '';
      photoUrls.forEach(url => {
        const item = document.createElement('div');
        item.className = 'photo-item';
        item.innerHTML = `
          <img src="${url}" alt="Business photo">
          <button class="photo-remove" data-action="removePhoto" data-id="${url}">×</button>
        `;
        grid.appendChild(item);
      });
    }

    function initPhotoUploader() {
      const container = document.getElementById('photoUploadContainer');
      if (!container || !businessId) return;

      container.innerHTML = `
        <div class="upload-area" id="photoUploadArea">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p><strong>Tap to upload</strong> photos</p>
          <p class="text-sm text-muted">JPEG, PNG, GIF, WebP (max 10MB each)</p>
          <input type="file" id="photoFileInput" multiple accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" class="hidden">
        </div>
        <div id="photoUploadProgress" class="upload-progress hidden">
          <div class="progress-bar"><div class="progress-fill" id="photoProgressFill"></div></div>
          <p class="text-sm text-muted" id="photoProgressText">Uploading...</p>
        </div>
      `;

      const uploadArea = document.getElementById('photoUploadArea');
      const fileInput = document.getElementById('photoFileInput');

      uploadArea.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => handlePhotoUpload(e.target.files));

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
        handlePhotoUpload(e.dataTransfer.files);
      });
    }

    async function withRetry(fn, { retries = 2, delayMs = 600 } = {}) {
      let lastErr = null;
      for (let i = 0; i <= retries; i++) {
        try { return await fn(i); }
        catch (e) {
          lastErr = e;
          if (i === retries) break;
          await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
      }
      throw lastErr;
    }

    async function handlePhotoUpload(files) {
      console.log('[UPLOAD] Starting...');
      uploadLog('Starting upload...', 'info');
      
      if (!businessId) {
        uploadLog('Business ID not ready yet. Wait a moment and try again.', 'error');
        window.showToast('Please wait for page to fully load', 'info');
        return;
      }
      if (!auth.currentUser) {
        uploadLog('You must be logged in to upload.', 'error');
        window.showToast('Please log in first', 'error');
        return;
      }
      
      if (!files || files.length === 0) {
        uploadLog('No files selected', 'error');
        return;
      }
      
      const fileArray = Array.from(files);
      uploadLog(`Files selected: ${fileArray.length}`, 'info');
      uploadLog(`Business ID: ${businessId}`, 'info');
      uploadLog(`Auth: ${auth.currentUser?.email || 'NONE'}`, 'info');
      
      const progressArea = document.getElementById('photoUploadProgress');
      const progressFill = document.getElementById('photoProgressFill');
      const progressText = document.getElementById('photoProgressText');
      const uploadArea = document.getElementById('photoUploadArea');
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        const check = validateFile(file, {
          maxSize: 10 * 1024 * 1024,
          allowedTypes: ['image/jpeg','image/jpg','image/png','image/gif','image/webp']
        });
        if (!check.valid) {
          uploadLog(`SKIPPED: ${file.name} - ${check.error}`, 'error');
          failCount++;
          continue;
        }
        
        if (photoUrls.length >= 10) {
          uploadLog('Maximum 10 photos reached', 'error');
          window.showToast('Maximum 10 photos allowed', 'info');
          break;
        }
        
        if (uploadArea) uploadArea.classList.add('hidden');
        if (progressArea) progressArea.classList.remove('hidden');
        
        const thumbUrl = URL.createObjectURL(file);
        if (progressArea) {
          progressArea.innerHTML = `
            <div class="upload-thumb-container">
              <img src="${thumbUrl}" alt="Uploading" class="upload-thumb">
              <div class="upload-thumb-overlay">
                <div class="progress-bar"><div class="progress-fill" id="photoProgressFill" style="width: 0%"></div></div>
                <p class="upload-percent" id="photoProgressText">0%</p>
              </div>
            </div>
            <p class="text-sm text-muted mt-sm">${i + 1} of ${fileArray.length}: ${file.name}</p>
          `;
        }
        
        uploadLog(`Uploading: ${file.name} (${Math.round(file.size/1024)}KB)`, 'info');
        
        try {
          const result = await withRetry(async (attempt) => {
            if (attempt > 0) uploadLog(`Retrying ${file.name} (attempt ${attempt + 1})...`, 'info');
            return await uploadBusinessImage(businessId, file, 'photos', (percent) => {
              const fill = document.getElementById('photoProgressFill');
              const text = document.getElementById('photoProgressText');
              if (fill) fill.style.width = percent + '%';
              if (text) text.textContent = percent + '%';
            });
          }, { retries: 2, delayMs: 700 });
          
          URL.revokeObjectURL(thumbUrl);
          
          if (result.success) {
            uploadLog(`SUCCESS: ${file.name}`, 'success');
            photoUrls.push(result.url);
            photoStoragePaths.push({ url: result.url, path: result.path });
            successCount++;
          } else {
            uploadLog(`FAILED: ${file.name} - ${result.error}`, 'error');
            failCount++;
          }
        } catch (err) {
          URL.revokeObjectURL(thumbUrl);
          uploadLog(`EXCEPTION: ${file.name} - ${err.message}`, 'error');
          failCount++;
        }
      }
      
      if (progressArea) progressArea.classList.add('hidden');
      if (uploadArea) uploadArea.classList.remove('hidden');
      
      renderPhotoGrid();
      updatePhotoCount();
      
      if (successCount > 0) {
        window.showToast(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded!`, 'success');
      }
      if (failCount > 0) {
        window.showToast(`${failCount} upload${failCount > 1 ? 's' : ''} failed`, 'error');
      }
      
      const fileInput = document.getElementById('photoFileInput');
      if (fileInput) fileInput.value = '';
    }

    document.getElementById('addPhoto').addEventListener('click', () => {
      const url = document.getElementById('photoUrl').value.trim();
      if (!url) {
        window.showToast('Please enter a photo URL', 'info');
        return;
      }
      if (photoUrls.length >= 10) {
        window.showToast('Maximum 10 photos allowed', 'info');
        return;
      }
      addPhotoPreview(url);
      document.getElementById('photoUrl').value = '';
    });

    let videoFileUrls = [];
    let videoStoragePaths = [];

    function updateVideoCount() {
      const countEl = document.getElementById('videoCount');
      if (countEl) countEl.textContent = videoFileUrls.length;
    }

    function generateVideoThumbnail(videoFile) {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        
        const url = URL.createObjectURL(videoFile);
        video.src = url;
        
        video.onloadeddata = () => {
          video.currentTime = 0.1;
        };
        
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(url);
          resolve(thumbUrl);
        };
        
        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        
        setTimeout(() => {
          if (!video.seeked) {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        }, 5000);
      });
    }

    function initVideoUploader() {
      const container = document.getElementById('videoUploadContainer');
      if (!container || !businessId) return;

      container.innerHTML = `
        <div class="upload-area" id="videoUploadArea">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <p><strong>Tap to upload</strong> videos</p>
          <p class="text-sm text-muted">MP4, WebM (max 50MB each)</p>
          <input type="file" id="videoFileInput" multiple accept="video/mp4,video/webm" class="hidden">
        </div>
        <div id="videoUploadProgress" class="upload-progress hidden">
          <div class="progress-bar"><div class="progress-fill" id="videoProgressFill"></div></div>
          <p class="text-sm text-muted" id="videoProgressText">Uploading...</p>
        </div>
      `;

      const uploadArea = document.getElementById('videoUploadArea');
      const fileInput = document.getElementById('videoFileInput');

      uploadArea.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => handleVideoUpload(e.target.files));

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
        handleVideoUpload(e.dataTransfer.files);
      });
    }

    async function handleVideoUpload(files) {
      if (!businessId) {
        window.showToast('Please wait for page to fully load', 'info');
        return;
      }
      if (!auth.currentUser) {
        window.showToast('Please log in first', 'error');
        return;
      }
      
      if (!files || files.length === 0) return;
      
      const fileArray = Array.from(files);
      const progressArea = document.getElementById('videoUploadProgress');
      const uploadArea = document.getElementById('videoUploadArea');
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        const check = validateFile(file, {
          maxSize: 50 * 1024 * 1024,
          allowedTypes: ['video/mp4', 'video/webm']
        });
        if (!check.valid) {
          window.showToast(`${file.name}: ${check.error}`, 'error');
          failCount++;
          continue;
        }
        
        if (videoFileUrls.length >= 3) {
          window.showToast('Maximum 3 videos allowed', 'info');
          break;
        }
        
        if (uploadArea) uploadArea.classList.add('hidden');
        if (progressArea) progressArea.classList.remove('hidden');
        
        const thumbUrl = await generateVideoThumbnail(file);
        if (progressArea) {
          progressArea.innerHTML = `
            <div class="upload-thumb-container">
              ${thumbUrl ? `<img src="${thumbUrl}" alt="Video thumbnail" class="upload-thumb">` : '<div class="upload-thumb" style="background:#333;display:flex;align-items:center;justify-content:center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>'}
              <div class="upload-thumb-overlay">
                <div class="progress-bar"><div class="progress-fill" id="videoProgressFill" style="width: 0%"></div></div>
                <p class="upload-percent" id="videoProgressText">0%</p>
              </div>
            </div>
            <p class="text-sm text-muted mt-sm">${i + 1} of ${fileArray.length}: ${file.name}</p>
          `;
        }
        
        try {
          const result = await withRetry(async (attempt) => {
            return await uploadBusinessImage(businessId, file, 'videos', (percent) => {
              const fill = document.getElementById('videoProgressFill');
              const text = document.getElementById('videoProgressText');
              if (fill) fill.style.width = percent + '%';
              if (text) text.textContent = percent + '%';
            });
          }, { retries: 2, delayMs: 700 });
          
          if (result.success) {
            videoFileUrls.push(result.url);
            videoStoragePaths.push({ url: result.url, path: result.path, thumbnail: thumbUrl });
            successCount++;
          } else {
            window.showToast(`${file.name}: ${result.error}`, 'error');
            failCount++;
          }
        } catch (err) {
          window.showToast(`${file.name}: ${err.message}`, 'error');
          failCount++;
        }
      }
      
      if (progressArea) progressArea.classList.add('hidden');
      if (uploadArea) uploadArea.classList.remove('hidden');
      
      renderVideoGrid();
      updateVideoCount();
      
      if (successCount > 0) {
        window.showToast(`${successCount} video${successCount > 1 ? 's' : ''} uploaded!`, 'success');
      }
      
      const fileInput = document.getElementById('videoFileInput');
      if (fileInput) fileInput.value = '';
    }

    function renderVideoGrid() {
      const grid = document.getElementById('videoPreviewGrid');
      if (!grid) return;
      grid.innerHTML = '';
      videoFileUrls.forEach((url, index) => {
        const pathInfo = videoStoragePaths.find(p => p.url === url);
        const thumbUrl = pathInfo?.thumbnail;
        const item = document.createElement('div');
        item.className = 'photo-item video-item';
        item.innerHTML = `
          ${thumbUrl ? `<img src="${thumbUrl}" alt="Video thumbnail">` : `<video src="${url}" class="video-thumb" muted></video>`}
          <div class="video-play-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
          <button class="photo-remove" data-action="removeVideoFile" data-index="${index}">×</button>
        `;
        grid.appendChild(item);
      });
    }

    window.removeVideoFile = async (index) => {
      const url = videoFileUrls[index];
      const pathInfo = videoStoragePaths.find(p => p.url === url);
      if (pathInfo) {
        const result = await deleteFile(pathInfo.path);
        if (!result.success) {
          window.showToast('Failed to delete video from storage', 'error');
          return;
        }
        videoStoragePaths = videoStoragePaths.filter(p => p.url !== url);
      }
      videoFileUrls.splice(index, 1);
      renderVideoGrid();
      updateVideoCount();
    };

    let videoUrls = [];

    function addVideoItem(url) {
      if (videoUrls.length >= 3) {
        window.showToast('Maximum 3 videos allowed', 'info');
        return;
      }

      videoUrls.push(url);
      renderVideoList();
    }

    function renderVideoList() {
      const list = document.getElementById('videosList');
      list.innerHTML = '';
      videoUrls.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'flex-gap mt-sm';
        item.innerHTML = `
          <input type="text" value="${url}" disabled class="input-dark">
          <button class="btn btn-small btn-danger" data-action="removeVideo" data-index="${index}">Remove</button>
        `;
        list.appendChild(item);
      });
    }

    window.removeVideo = (index) => {
      videoUrls.splice(index, 1);
      renderVideoList();
    };

    document.getElementById('addVideo').addEventListener('click', () => {
      const url = document.getElementById('videoUrl').value.trim();
      if (!url) {
        window.showToast('Please enter a video URL', 'info');
        return;
      }
      addVideoItem(url);
      document.getElementById('videoUrl').value = '';
    });

    // Character counter for description
    const descriptionField = document.getElementById('description');
    const descriptionCounter = document.getElementById('descriptionCounter');
    
    function updateDescriptionCounter() {
      const length = descriptionField.value.length;
      descriptionCounter.textContent = `${length}/500`;
    }
    
    descriptionField.addEventListener('input', updateDescriptionCounter);

    // Hours of operation utility buttons
    document.getElementById('setDefaultHours').addEventListener('click', () => {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
      days.forEach(day => {
        document.getElementById(`hours_${day}_open`).value = '09:00';
        document.getElementById(`hours_${day}_close`).value = '17:00';
      });
      
      ['sat', 'sun'].forEach(day => {
        document.getElementById(`hours_${day}_open`).value = '';
        document.getElementById(`hours_${day}_close`).value = '';
      });
    });

    document.getElementById('clearAllHours').addEventListener('click', () => {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      days.forEach(day => {
        document.getElementById(`hours_${day}_open`).value = '';
        document.getElementById(`hours_${day}_close`).value = '';
      });
    });

    // Hours validation - prevent closing before opening
    function validateHours() {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const dayNames = {
        mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
        thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
      };

      for (const day of days) {
        const open = document.getElementById(`hours_${day}_open`).value;
        const close = document.getElementById(`hours_${day}_close`).value;
        
        if (open && close && open >= close) {
          window.showToast(`Invalid hours for ${dayNames[day]}: Closing time must be after opening`, 'error');
          return false;
        }
      }
      return true;
    }

    // Preview modal functionality
    document.getElementById('previewButton').addEventListener('click', () => {
      const isPro = isBusinessPro(currentBusiness);
      const businessName = document.getElementById('business_name').value.trim() || 'Your Business Name';
      const description = document.getElementById('description').value.trim() || 'No description provided.';
      const category = document.getElementById('primary_category').value || 'Uncategorized';
      const phone = document.getElementById('phone').value.trim();
      const email = document.getElementById('email').value.trim();
      const website = document.getElementById('website').value.trim();
      const address = [
        document.getElementById('address_line1').value.trim(),
        document.getElementById('address_line2').value.trim(),
        document.getElementById('city').value.trim(),
        document.getElementById('state').value,
        document.getElementById('zip_code').value.trim()
      ].filter(x => x).join(', ');

      const showPhone = document.getElementById('show_phone').checked;
      const showEmail = document.getElementById('show_email').checked;
      const showWebsite = document.getElementById('show_website').checked;
      const showAddress = document.getElementById('show_address').checked;

      let previewHTML = `
        <div class="card">
          <h3 class="gold-metallic">${escapeHtml(businessName)} ${isPro ? '<span class="pro-badge">PRO</span>' : ''}</h3>
          <p><strong>Category:</strong> ${escapeHtml(category)}</p>
          <p>${escapeHtml(description)}</p>
          
          <div class="mt-md">
            <h4 class="gold">Contact Information</h4>
            ${showPhone && phone ? `<p>📞 ${escapeHtml(phone)}</p>` : ''}
            ${showEmail && email ? `<p>📧 ${escapeHtml(email)}</p>` : ''}
            ${showWebsite && website ? `<p>🌐 <a href="${escapeHtml(website)}" target="_blank">${escapeHtml(website)}</a></p>` : ''}
            ${showAddress && address ? `<p>📍 ${escapeHtml(address)}</p>` : ''}
            ${!showPhone && !showEmail && !showWebsite && !showAddress ? '<p class="help-text">Contact information hidden (privacy settings)</p>' : ''}
          </div>
          
          ${isPro ? `
            <div class="mt-md">
              <h4 class="gold">Pro Features</h4>
              <p class="help-text">✨ Social media links, photos, videos, and extended categories will appear here when filled in</p>
            </div>
          ` : ''}
        </div>
      `;

      document.getElementById('previewContent').innerHTML = previewHTML;
      document.getElementById('previewModal').classList.remove('hidden');
    });

    document.getElementById('closePreview').addEventListener('click', () => {
      document.getElementById('previewModal').classList.add('hidden');
    });

    // Close preview when clicking outside
    document.getElementById('previewModal').addEventListener('click', (e) => {
      if (e.target.id === 'previewModal') {
        document.getElementById('previewModal').classList.add('hidden');
      }
    });

    document.getElementById('businessForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validateHours()) {
        return;
      }

      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const hours_of_operation = {};
      days.forEach(day => {
        const open = document.getElementById(`hours_${day}_open`).value;
        const close = document.getElementById(`hours_${day}_close`).value;
        if (open || close) {
          hours_of_operation[day] = { open, close };
        }
      });

      const secondaryCategories = secondaryCategorySelects
        .map(select => select.value)
        .filter(val => val);

      const updateData = {
        business_name: document.getElementById('business_name').value.trim(),
        your_name: document.getElementById('owner_name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone_number: unformatPhoneNumber(document.getElementById('phone').value.trim()),
        phone_ext: document.getElementById('phone_ext').value.trim(),
        website_url: document.getElementById('website').value.trim(),
        description: document.getElementById('description').value.trim(),
        primary_category: document.getElementById('primary_category').value,
        subcategories: secondaryCategories,
        address_line1: document.getElementById('address_line1').value.trim(),
        address_line2: document.getElementById('address_line2').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value,
        zip_code: document.getElementById('zip_code').value.trim(),
        country: document.getElementById('country').value.trim(),
        hours_of_operation: hours_of_operation,
        allow_reviews: document.getElementById('allow_reviews').checked,
        allow_social_sharing: document.getElementById('allow_social_sharing').checked,
        allow_review_sharing: document.getElementById('allow_review_sharing').checked,
        show_phone: document.getElementById('show_phone').checked,
        show_email: document.getElementById('show_email').checked,
        show_address: document.getElementById('show_address').checked,
        show_website: document.getElementById('show_website').checked
      };

      console.log('[KC DEBUG] PRE-SAVE CHECK - currentBusiness:', currentBusiness);
      console.log('[KC DEBUG] PRE-SAVE CHECK - pro_status:', currentBusiness?.pro_status);
      console.log('[KC DEBUG] PRE-SAVE CHECK - isBusinessPro result:', isBusinessPro(currentBusiness));
      console.log('[KC DEBUG] PRE-SAVE CHECK - photoUrls:', photoUrls);
      console.log('[KC DEBUG] PRE-SAVE CHECK - photoUrls.length:', photoUrls.length);
      
      if (isBusinessPro(currentBusiness)) {
        updateData.show_social_media = document.getElementById('show_social_media').checked;
        updateData.social_media = {
          facebook: document.getElementById('social_facebook').value.trim(),
          instagram: document.getElementById('social_instagram').value.trim(),
          twitter: document.getElementById('social_twitter').value.trim(),
          linkedin: document.getElementById('social_linkedin').value.trim()
        };
        updateData.photos = photoUrls;
        updateData.videos = videoUrls;
        updateData.video_files = videoFileUrls;
        console.log('[KC DEBUG] Pro business save - photos:', photoUrls.length, 'video_files:', videoFileUrls.length);
        console.log('[KC DEBUG] Pro business save - subcategories:', secondaryCategories);
      } else {
        console.log('[KC DEBUG] NOT Pro - skipping photos/videos. currentBusiness.pro_status:', currentBusiness?.pro_status);
        console.log('[KC DEBUG] FORCING photos save anyway for debugging');
        updateData.photos = photoUrls;
        updateData.videos = videoUrls;
        updateData.video_files = videoFileUrls;
      }

      console.log('[KC DEBUG] Saving to businessId:', businessId);
      console.log('[KC DEBUG] Full updateData:', JSON.stringify(updateData, null, 2));

      try {
        await updateBusiness(businessId, updateData);
        console.log('[KC DEBUG] Save successful!');
        window.showToast('Your business listing has been updated!', 'success');
        setTimeout(() => window.location.href = 'index', 1500);
      } catch (error) {
        console.error('[KC DEBUG] Error updating business:', error);
        window.showToast('Error updating business: ' + error.message, 'error');
      }
    });

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  
  if (action === 'removeVideo') {
    const index = parseInt(button.getAttribute('data-index'));
    if (window.removeVideo) window.removeVideo(index);
  }
  
  if (action === 'removePhoto') {
    const url = button.getAttribute('data-id');
    if (window.removePhoto) window.removePhoto(url);
  }
  
  if (action === 'removeVideoFile') {
    const index = parseInt(button.getAttribute('data-index'));
    if (window.removeVideoFile) window.removeVideoFile(index);
  }
});

function calculateBusinessProfileCompletion(business) {
  const section = document.getElementById('businessProfileCompletion');
  const percentEl = document.getElementById('businessCompletionPercent');
  const fillEl = document.getElementById('businessCompletionFill');
  const tipEl = document.getElementById('businessCompletionTip');
  const tasksList = document.getElementById('businessCompletionTasks');
  
  if (!section || !business) return;
  
  const tasks = [
    { key: 'logo', label: 'Add a business logo', check: () => !!(business.logo_url && business.logo_url.trim()) },
    { key: 'images', label: 'Add photos of your business', check: () => !!(business.photos && business.photos.length > 0) },
    { key: 'description', label: 'Write a business description', check: () => !!(business.description && business.description.trim()) },
    { key: 'website', label: 'Add your website', check: () => !!(business.website && business.website.trim()) },
    { key: 'hours', label: 'Set your hours of operation', check: () => {
      if (!business.hours) return false;
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      return days.some(day => business.hours[day] && (business.hours[day].open || business.hours[day].closed));
    }},
    { key: 'categories', label: 'Add subcategories', check: () => !!(business.categories && business.categories.length > 0) },
    { key: 'social', label: 'Add social media links', check: () => {
      if (!business.social_media) return false;
      return !!(business.social_media.facebook || business.social_media.instagram || 
                business.social_media.twitter || business.social_media.linkedin);
    }},
    { key: 'videos', label: 'Add video content', check: () => !!(business.videos && business.videos.length > 0) }
  ];
  
  let completed = 0;
  const incomplete = [];
  
  tasks.forEach(task => {
    if (task.check()) {
      completed++;
    } else {
      incomplete.push(task.label);
    }
  });
  
  const percent = Math.round((completed / tasks.length) * 100);
  
  percentEl.textContent = percent + '%';
  fillEl.style.width = percent + '%';
  
  if (percent === 100) {
    tipEl.textContent = 'Your profile is complete! Great job!';
    tasksList.innerHTML = '';
  } else {
    tipEl.textContent = 'Complete your profile to attract more customers:';
    tasksList.innerHTML = incomplete.map(item => `<li>${item}</li>`).join('');
  }
  
  section.classList.remove('hidden');
}
