    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAuth } from "../../js/auth/access-control.js";
    import { normalizeWebsiteUrl, normalizeSocialUrl } from "../../js/url-normalizer.js";
    import { uploadChurchImage, deleteFile } from "/js/firebase-storage.js?v=17";
    import { showToast } from "../../js/utils.js";

    let churchId = null;
    let serviceTimesCount = 0;
    let profileImageUrl = null;
    let profileImagePath = null;
    
    function generateQRCode(url) {
      const container = document.getElementById('qrCanvas');
      if (!container || !url || typeof QRCode === 'undefined') return;
      
      try {
        container.innerHTML = '';
        new QRCode(container, {
          text: url,
          width: 200,
          height: 200,
          colorDark: '#1a1a1a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        document.getElementById('downloadQRBtn')?.classList.remove('hidden');
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    }

    requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
      console.log('🔐 Profile: Auth verified, church:', churchContext?.id);
      
      const loadingMessage = document.getElementById('loadingMessage');
      const noChurchMessage = document.getElementById('noChurchMessage');
      const churchForm = document.getElementById('churchForm');

      if (!churchContext) {
        loadingMessage.classList.add('hidden');
        noChurchMessage.classList.remove('hidden');
        return;
      }

      try {
        churchId = churchContext.id;
        populateForm(churchContext);

        loadingMessage.classList.add('hidden');
        noChurchMessage.classList.add('hidden');
        churchForm.classList.remove('hidden');

      } catch (error) {
        console.error('Error loading church profile:', error);
        loadingMessage.textContent = 'Error loading church: ' + error.message;
        loadingMessage.classList.add('text-error');
      }
    });

    function populateForm(church) {
      document.getElementById('church_name').value = church.church_name || '';
      document.getElementById('denomination').value = church.denomination || '';
      document.getElementById('description').value = church.description || '';
      document.getElementById('welcome_message').value = church.welcome_message || '';
      document.getElementById('hero_media_url').value = church.hero_media_url || '';
      document.getElementById('livestream_url').value = church.livestream_url || '';
      
      // Welcome message character counter
      const welcomeTextarea = document.getElementById('welcome_message');
      const welcomeCounter = document.getElementById('welcomeCounter');
      if (welcomeTextarea && welcomeCounter) {
        welcomeCounter.textContent = welcomeTextarea.value.length;
        welcomeTextarea.addEventListener('input', () => {
          welcomeCounter.textContent = welcomeTextarea.value.length;
        });
      }
      document.getElementById('address_line1').value = church.address_line1 || '';
      document.getElementById('address_line2').value = church.address_line2 || '';
      document.getElementById('city').value = church.city || '';
      document.getElementById('state').value = church.state || '';
      document.getElementById('zip_code').value = church.zip_code || '';
      document.getElementById('country').value = church.country || 'USA';
      document.getElementById('contact_phone').value = church.contact_phone || '';
      document.getElementById('contact_email').value = church.contact_email || '';
      document.getElementById('website').value = church.website || '';
      
      // Handle parishioner_count - could be number, string, or empty
      const parishionerCount = church.parishioner_count;
      if (parishionerCount && parishionerCount !== '') {
        document.getElementById('parishioner_count').value = typeof parishionerCount === 'number' ? parishionerCount : parseInt(parishionerCount) || 0;
      } else {
        document.getElementById('parishioner_count').value = '';
      }
      
      // Auto-generate directory link from church name
      const directoryLink = generateDirectoryLink(church.church_name, churchId);
      document.getElementById('directory_link').value = directoryLink;
      
      // Populate service times
      populateServiceTimes(church.service_times || []);
      
      const showSocialMedia = church.show_social_media !== false;
      document.getElementById('show_social_media').checked = showSocialMedia;
      document.getElementById('facebook_url').value = church.social_media?.facebook || '';
      document.getElementById('instagram_url').value = church.social_media?.instagram || '';
      document.getElementById('twitter_url').value = church.social_media?.twitter || '';
      document.getElementById('youtube_url').value = church.social_media?.youtube || '';
      document.getElementById('linkedin_url').value = church.social_media?.linkedin || '';
      document.getElementById('allow_reviews_for_church').checked = church.allow_reviews_for_church !== false;
      document.getElementById('allow_social_sharing').checked = church.allow_social_sharing !== false;
      
      // Payout settings - default to electronic
      const payoutMethod = church.payout_method || 'electronic';
      document.getElementById('payout_electronic').checked = payoutMethod === 'electronic';
      document.getElementById('payout_check').checked = payoutMethod === 'check';
      updatePayoutSections(payoutMethod);
      
      // Load Stripe Connect status
      loadStripeConnectStatus(church);
      document.getElementById('allow_review_sharing').checked = church.allow_review_sharing !== false;
      
      // Show/hide social media fields based on toggle
      toggleSocialMediaFields(showSocialMedia);
      
      // Update description counter
      updateDescriptionCounter();
      
      // Load existing profile image
      if (church.profile_image_url) {
        profileImageUrl = church.profile_image_url;
        profileImagePath = church.profile_image_path || null;
        showProfileImage(church.profile_image_url);
      }
      
      // Auto-generate QR code if directory link exists
      if (directoryLink) {
        generateQRCode(directoryLink);
      }
    }

    // Generate friendly slug directory link
    function generateDirectoryLink(churchName, id) {
      if (!churchName) return '';
      const slug = churchName.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      return `https://kingdomconnects.org/church/${slug}`;
    }

    // Populate service times from array
    function populateServiceTimes(serviceTimes) {
      const container = document.getElementById('serviceTimesContainer');
      container.innerHTML = '';
      serviceTimesCount = 0;
      
      if (!serviceTimes || serviceTimes.length === 0) {
        // Add one default service time
        addServiceTime();
      } else {
        serviceTimes.forEach(service => {
          addServiceTime(service.service_type, service.time);
        });
      }
    }

    // Add a service time row
    function addServiceTime(serviceType = '', time = '') {
      const container = document.getElementById('serviceTimesContainer');
      const id = serviceTimesCount++;
      
      const row = document.createElement('div');
      row.className = 'grid-col-2 mb-sm';
      row.dataset.serviceId = id;
      row.innerHTML = `
        <div>
          <input type="text" 
                 class="input-dark service-type" 
                 placeholder="Service name (e.g., Sunday Worship)" 
                 value="${escapeHtml(serviceType)}">
        </div>
        <div class="flex-gap-sm">
          <input type="text" 
                 class="input-dark service-time" 
                 placeholder="Time (e.g., 10:00 AM & 6:00 PM)" 
                 value="${escapeHtml(time)}">
          <button type="button" 
                  class="btn btn-smallall btn-danger" 
                  data-action="removeServiceTime" 
                  data-id="${id}"
                  title="Remove this service">×</button>
        </div>
      `;
      
      container.appendChild(row);
    }

    // Remove a service time row
    window.removeServiceTime = function(id) {
      const row = document.querySelector(`[data-service-id="${id}"]`);
      if (row) {
        row.remove();
      }
    };

    // Add service time button
    document.getElementById('addServiceTime').addEventListener('click', () => {
      addServiceTime();
    });

    // Toggle social media fields visibility
    function toggleSocialMediaFields(show) {
      const socialFields = document.getElementById('socialMediaFields');
      if (show) {
        socialFields.classList.remove('hidden');
      } else {
        socialFields.classList.add('hidden');
      }
    }

    // Listen for social media toggle changes
    document.getElementById('show_social_media').addEventListener('change', (e) => {
      toggleSocialMediaFields(e.target.checked);
    });

    // Collect service times from form
    function collectServiceTimes() {
      const container = document.getElementById('serviceTimesContainer');
      const rows = container.querySelectorAll('[data-service-id]');
      const serviceTimes = [];
      
      rows.forEach(row => {
        const serviceType = row.querySelector('.service-type').value.trim();
        const time = row.querySelector('.service-time').value.trim();
        
        if (serviceType && time) {
          serviceTimes.push({ service_type: serviceType, time: time });
        }
      });
      
      return serviceTimes;
    }

    // Character counter for description
    const descriptionField = document.getElementById('description');
    const descriptionCounter = document.getElementById('descriptionCounter');
    
    function updateDescriptionCounter() {
      const length = descriptionField.value.length;
      descriptionCounter.textContent = `${length}/500`;
    }
    
    descriptionField.addEventListener('input', updateDescriptionCounter);

    // Auto-update directory link when church name changes
    document.getElementById('church_name').addEventListener('input', (e) => {
      const churchName = e.target.value.trim();
      const directoryLink = generateDirectoryLink(churchName, churchId);
      document.getElementById('directory_link').value = directoryLink;
    });

    // Preview modal functionality
    document.getElementById('previewButton').addEventListener('click', () => {
      const churchName = document.getElementById('church_name').value.trim() || 'Your Church Name';
      const denomination = document.getElementById('denomination').value.trim();
      const description = document.getElementById('description').value.trim() || 'No description provided.';
      const phone = document.getElementById('contact_phone').value.trim();
      const email = document.getElementById('contact_email').value.trim();
      const website = document.getElementById('website').value.trim();
      const address = [
        document.getElementById('address_line1').value.trim(),
        document.getElementById('address_line2').value.trim(),
        document.getElementById('city').value.trim(),
        document.getElementById('state').value,
        document.getElementById('zip_code').value.trim()
      ].filter(x => x).join(', ');
      
      const serviceTimes = collectServiceTimes();

      let serviceTimesHTML = '';
      if (serviceTimes.length > 0) {
        serviceTimesHTML = `
          <div class="mt-md">
            <h4 class="gold">Service Times</h4>
            ${serviceTimes.map(s => `<p><strong>${escapeHtml(s.service_type)}:</strong> ${escapeHtml(s.time)}</p>`).join('')}
          </div>
        `;
      }

      let previewHTML = `
        <div class="card">
          <h3 class="gold-metallic">${escapeHtml(churchName)}</h3>
          ${denomination ? `<p><strong>Denomination:</strong> ${escapeHtml(denomination)}</p>` : ''}
          <p>${escapeHtml(description)}</p>
          
          <div class="mt-md">
            <h4 class="gold">Contact Information</h4>
            ${phone ? `<p>📞 ${escapeHtml(phone)}</p>` : ''}
            ${email ? `<p>📧 ${escapeHtml(email)}</p>` : ''}
            ${website ? `<p>🌐 <a href="${escapeHtml(website)}" target="_blank">${escapeHtml(website)}</a></p>` : ''}
            ${address ? `<p>📍 ${escapeHtml(address)}</p>` : ''}
          </div>
          
          ${serviceTimesHTML}
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

    // Helper function to escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    document.getElementById('churchForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Collect and normalize URLs
      const website = normalizeWebsiteUrl(document.getElementById('website').value.trim());
      const directoryLink = generateDirectoryLink(document.getElementById('church_name').value.trim(), churchId);
      
      // Build social_media object with only non-empty URLs
      const socialMedia = {};
      const facebookUrl = normalizeSocialUrl(document.getElementById('facebook_url').value.trim());
      const instagramUrl = normalizeSocialUrl(document.getElementById('instagram_url').value.trim());
      const twitterUrl = normalizeSocialUrl(document.getElementById('twitter_url').value.trim());
      const youtubeUrl = normalizeSocialUrl(document.getElementById('youtube_url').value.trim());
      const linkedinUrl = normalizeSocialUrl(document.getElementById('linkedin_url').value.trim());
      
      if (facebookUrl) socialMedia.facebook = facebookUrl;
      if (instagramUrl) socialMedia.instagram = instagramUrl;
      if (twitterUrl) socialMedia.twitter = twitterUrl;
      if (youtubeUrl) socialMedia.youtube = youtubeUrl;
      if (linkedinUrl) socialMedia.linkedin = linkedinUrl;

      const updateData = {
        church_name: document.getElementById('church_name').value.trim(),
        denomination: document.getElementById('denomination').value.trim(),
        description: document.getElementById('description').value.trim(),
        welcome_message: document.getElementById('welcome_message').value.trim(),
        hero_media_url: document.getElementById('hero_media_url').value.trim(),
        livestream_url: document.getElementById('livestream_url').value.trim(),
        address_line1: document.getElementById('address_line1').value.trim(),
        address_line2: document.getElementById('address_line2').value.trim(),
        city: document.getElementById('city').value.trim(),
        state: document.getElementById('state').value,
        zip_code: document.getElementById('zip_code').value.trim(),
        country: document.getElementById('country').value.trim(),
        contact_phone: document.getElementById('contact_phone').value.trim(),
        contact_email: document.getElementById('contact_email').value.trim(),
        website: website,
        service_times: collectServiceTimes(),
        parishioner_count: parseInt(document.getElementById('parishioner_count').value) || 0,
        directory_link: directoryLink,
        updated_at: new Date(),
        show_social_media: document.getElementById('show_social_media').checked,
        social_media: socialMedia,
        allow_reviews_for_church: document.getElementById('allow_reviews_for_church').checked,
        allow_social_sharing: document.getElementById('allow_social_sharing').checked,
        allow_review_sharing: document.getElementById('allow_review_sharing').checked,
        profile_image_url: profileImageUrl || null,
        profile_image_path: profileImagePath || null,
        payout_method: document.getElementById('payout_electronic').checked ? 'electronic' : 'check'
      };

      try {
        await updateDoc(doc(db, "churches", churchId), updateData);
        showToast('Church profile updated!', 'success');
        setTimeout(() => window.location.href = '/church-admin/index?id=' + encodeURIComponent(churchId), 1500);
      } catch (error) {
        console.error('Error updating church:', error);
        showToast('Error updating church: ' + error.message, 'error');
      }
    });

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  
  if (action === 'removeServiceTime') {
    const id = parseInt(button.getAttribute('data-id'));
    if (window.removeServiceTime) window.removeServiceTime(id);
  }
});

document.getElementById('downloadQRBtn')?.addEventListener('click', () => {
  const container = document.getElementById('qrCanvas');
  const canvas = container?.querySelector('canvas');
  const img = container?.querySelector('img');
  const churchName = document.getElementById('church_name').value || 'church';
  const filename = `${churchName.replace(/[^a-z0-9]/gi, '-')}-qr-code.png`;
  const link = document.createElement('a');
  link.download = filename;
  
  if (canvas) {
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Your QR code has been saved!', 'success');
  } else if (img) {
    link.href = img.src;
    link.click();
    showToast('Your QR code has been saved!', 'success');
  } else {
    showToast('Please wait for the QR code to load', 'info');
  }
});

// Profile Image Upload
function initProfileImageUploader() {
  const container = document.getElementById('profileImageContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="simple-uploader">
      <input type="file" id="profileImageInput" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden">
      <button type="button" id="selectProfileImageBtn" class="btn btn-secondary btn-small">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Choose Photo
      </button>
      <span id="profileUploadStatus" class="text-muted text-sm ml-sm"></span>
    </div>
    <div id="profileProgressBar" class="upload-progress hidden">
      <div class="progress-bar"><div class="progress-fill" id="profileProgressFill"></div></div>
      <p class="text-sm text-muted" id="profileProgressText">0%</p>
    </div>
  `;
  
  const fileInput = document.getElementById('profileImageInput');
  const selectBtn = document.getElementById('selectProfileImageBtn');
  
  selectBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleProfileImageSelect);
}

async function handleProfileImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('Image too large. Maximum size is 5MB.', 'error');
    return;
  }
  
  const uploadStatus = document.getElementById('profileUploadStatus');
  const progressBar = document.getElementById('profileProgressBar');
  const progressFill = document.getElementById('profileProgressFill');
  const progressText = document.getElementById('profileProgressText');
  
  uploadStatus.textContent = 'Uploading...';
  if (progressBar) progressBar.classList.remove('hidden');
  
  try {
    const result = await uploadChurchImage(churchId, file, 'profile', (percent) => {
      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = percent + '%';
    });
    
    if (progressBar) progressBar.classList.add('hidden');
    
    if (result.success) {
      profileImageUrl = result.url;
      profileImagePath = result.path;
      showProfileImage(result.url);
      uploadStatus.textContent = 'Uploaded & saved!';
      await updateDoc(doc(db, "churches", churchId), {
        profile_image_url: result.url,
        profile_image_path: result.path
      });
      showToast('Profile image saved!', 'success');
    } else {
      uploadStatus.textContent = 'Upload failed';
      showToast(result.error || 'Upload failed', 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    if (progressBar) progressBar.classList.add('hidden');
    uploadStatus.textContent = 'Upload failed';
  }
}

function showProfileImage(url) {
  const container = document.getElementById('currentProfileImage');
  const preview = document.getElementById('profileImagePreview');
  if (container && preview) {
    preview.src = url;
    container.classList.remove('hidden');
  }
}

function hideProfileImage() {
  const container = document.getElementById('currentProfileImage');
  if (container) container.classList.add('hidden');
}

document.getElementById('removeProfileImageBtn')?.addEventListener('click', async () => {
  if (profileImagePath) {
    await deleteFile(profileImagePath);
  }
  profileImageUrl = null;
  profileImagePath = null;
  hideProfileImage();
  const status = document.getElementById('profileUploadStatus');
  if (status) status.textContent = '';
  if (churchId) {
    await updateDoc(doc(db, "churches", churchId), {
      profile_image_url: null,
      profile_image_path: null
    });
    showToast('Profile image removed', 'info');
  }
});

// Initialize uploader after form loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initProfileImageUploader, 100);
  setupPayoutListeners();
});

// ========== PAYOUT SETTINGS ==========

function setupPayoutListeners() {
  const electronicRadio = document.getElementById('payout_electronic');
  const checkRadio = document.getElementById('payout_check');
  
  electronicRadio?.addEventListener('change', () => updatePayoutSections('electronic'));
  checkRadio?.addEventListener('change', () => updatePayoutSections('check'));
  
  document.getElementById('setupStripeBtn')?.addEventListener('click', startStripeOnboarding);
  document.getElementById('continueStripeBtn')?.addEventListener('click', startStripeOnboarding);
  document.getElementById('manageStripeBtn')?.addEventListener('click', openStripeDashboard);
}

function updatePayoutSections(method) {
  const electronicSection = document.getElementById('electronicPayoutSection');
  const checkSection = document.getElementById('checkPayoutSection');
  
  if (method === 'electronic') {
    electronicSection?.classList.remove('hidden');
    checkSection?.classList.add('hidden');
  } else {
    electronicSection?.classList.add('hidden');
    checkSection?.classList.remove('hidden');
    updateCheckMailingAddress();
  }
}

function updateCheckMailingAddress() {
  const address1 = document.getElementById('address_line1')?.value || '';
  const address2 = document.getElementById('address_line2')?.value || '';
  const city = document.getElementById('city')?.value || '';
  const state = document.getElementById('state')?.value || '';
  const zip = document.getElementById('zip_code')?.value || '';
  
  let addressText = address1;
  if (address2) addressText += ', ' + address2;
  if (city || state || zip) {
    addressText += '<br>' + [city, state, zip].filter(Boolean).join(', ');
  }
  
  const addressEl = document.getElementById('checkMailingAddress');
  if (addressEl) {
    addressEl.innerHTML = addressText || 'Please fill in your church address above.';
  }
}

function loadStripeConnectStatus(church) {
  document.getElementById('stripeNotConnected')?.classList.remove('hidden');
  document.getElementById('stripeConnected')?.classList.add('hidden');
  document.getElementById('stripePending')?.classList.add('hidden');
}

async function startStripeOnboarding() {
  showToast('Electronic payouts are not available yet. This setup is deferred.', 'info');
  return;
  const btn = document.getElementById('setupStripeBtn') || document.getElementById('continueStripeBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Setting up...';
  }
  
  try {
    // Create or get Stripe Connect account for this church
    const response = await fetch('/api/stripe-connect/create-church-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        church_id: churchId,
        church_name: document.getElementById('church_name')?.value || 'Church',
        email: document.getElementById('contact_email')?.value
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create account');
    }
    
    // Get account session for embedded onboarding
    const sessionResponse = await fetch('/api/stripe-connect/create-account-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: data.account_id })
    });
    
    const sessionData = await sessionResponse.json();
    
    if (!sessionData.success) {
      throw new Error(sessionData.error || 'Failed to create session');
    }
    
    // Initialize embedded onboarding
    const stripe = Stripe(sessionData.publishable_key);
    const connectInstance = stripe.connectEmbeddedComponents({
      clientSecret: sessionData.client_secret
    });
    
    // Create modal for embedded onboarding
    showStripeOnboardingModal(connectInstance);
    
  } catch (error) {
    console.error('Stripe onboarding error:', error);
    showToast('Error setting up payments: ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.id === 'setupStripeBtn' ? 'Set Up Electronic Payments' : 'Continue Setup';
    }
  }
}

function showStripeOnboardingModal(connectInstance) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'stripeOnboardingModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content max-w-lg mx-auto card" style="max-height: 90vh; overflow-y: auto;">
      <div class="flex-between mb-md">
        <h2 class="gold-metallic m-0">Set Up Electronic Payments</h2>
        <button type="button" id="closeStripeModal" class="modal-close-btn">&times;</button>
      </div>
      <p class="help-text mb-md">Complete the secure verification to receive tithe payments directly to your church bank account.</p>
      <div id="stripeOnboardingContainer"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Mount the onboarding component
  const container = document.getElementById('stripeOnboardingContainer');
  const onboarding = connectInstance.create('account-onboarding');
  onboarding.mount(container);
  
  // Handle completion
  onboarding.on('exit', async () => {
    modal.remove();
    // Refresh status
    const q = query(collection(db, "churches"), where("contact_email", "==", auth.currentUser.email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      loadStripeConnectStatus(snapshot.docs[0].data());
    }
  });
  
  // Close button
  document.getElementById('closeStripeModal')?.addEventListener('click', () => {
    modal.remove();
  });
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function openStripeDashboard() {
  showToast('Electronic payouts are not available yet. This setup is deferred.', 'info');
  return;
  try {
    const response = await fetch('/api/stripe-connect/dashboard-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId })
    });
    
    const data = await response.json();
    
    if (data.success && data.url) {
      window.open(data.url, '_blank');
    } else {
      throw new Error(data.error || 'Failed to get dashboard link');
    }
  } catch (error) {
    console.error('Dashboard link error:', error);
    showToast('Error opening dashboard: ' + error.message, 'error');
  }
}
