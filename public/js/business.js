import { db } from "./firebase-config.js";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from './auth/access-control.js';
import analytics from './services/analytics-service.js';
import { checkIfFavorited, toggleFavorite } from './favorites-service.js';
import { renderShareButtons } from './social-share.js';
import { getBusinessBySlug } from './slug-generator.js';
import { isBusinessPro } from './role-utils.js';

let currentUser = null;
let businessId = null;

onAuthChange((user) => {
  currentUser = user;
  if (user && businessId) {
    setupFavoriteButton();
    setupShareButtons();
  }
});

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '';
  const urlStr = url.toString().trim();
  if (!urlStr) return '';
  
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (e) {
    return '';
  }
  return '';
}

const urlParams = new URLSearchParams(window.location.search);
const slug = urlParams.get('slug');
const idParam = urlParams.get('id');

// Check for SSR-embedded data first (from server-rendered pages)
const ssrData = window.__KC_INITIAL_DATA__;
const hasSSRData = ssrData && ssrData.type === 'business' && ssrData.data;

if (!slug && !idParam && !hasSSRData) {
  document.getElementById('loadingMessage').classList.add('hidden');
  document.getElementById('errorMessage').classList.remove('hidden');
} else {
  loadBusinessDetails();
}

async function loadBusinessDetails() {
  try {
    let business;
    
    // Use SSR-embedded data if available (faster, no network request)
    if (hasSSRData) {
      business = ssrData.data;
      businessId = ssrData.id;
    } else if (slug) {
      const businessData = await getBusinessBySlug(slug);
      if (!businessData) {
        document.getElementById('loadingMessage').classList.add('hidden');
        document.getElementById('errorMessage').classList.remove('hidden');
        return;
      }
      business = businessData;
      businessId = businessData.id;
    } else {
      const businessDoc = await getDoc(doc(db, 'business_listings_public', idParam));
      if (!businessDoc.exists()) {
        document.getElementById('loadingMessage').classList.add('hidden');
        document.getElementById('errorMessage').classList.remove('hidden');
        return;
      }
      business = businessDoc.data();
      businessId = idParam;
    }
    if (!business.church_id) throw new Error('This listing is awaiting church affiliation.');
    const controllingChurch = await getDoc(doc(db, 'churches', business.church_id));
    if (controllingChurch.data()?.listing_status !== 'active') throw new Error('The controlling church is not active.');

    const isPro = isBusinessPro(business);

    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('businessContent').classList.remove('hidden');

    document.getElementById('businessName').textContent = business.business_name || 'Unnamed Business';
    
    if (isPro) {
      document.getElementById('proBadge').classList.remove('hidden');
    }

    if (business.primary_category) {
      document.getElementById('businessCategory').innerHTML = `<strong>Category:</strong> ${escapeHtml(business.primary_category)}`;
    }

    if (business.description) {
      document.getElementById('businessDescription').innerHTML = `<p class="line-height-relaxed">${escapeHtml(business.description)}</p>`;
    }

    const address = [
      escapeHtml(business.address_line1),
      escapeHtml(business.address_line2),
      `${escapeHtml(business.city)}, ${escapeHtml(business.state)} ${escapeHtml(business.zip_code || '')}`
    ].filter(Boolean).join('<br>');
    
    document.getElementById('businessAddress').innerHTML = address || 'No address provided';

    const phoneContainer = document.getElementById('businessPhone');
    const emailContainer = document.getElementById('businessEmail');
    const websiteContainer = document.getElementById('businessWebsite');
    
    phoneContainer.textContent = '';
    emailContainer.textContent = '';
    websiteContainer.textContent = '';

    const phoneNumber = business.phone_number;
    if (phoneNumber) {
      phoneContainer.textContent = '📞 ';
      const phoneLink = document.createElement('a');
      phoneLink.href = `tel:${phoneNumber.replace(/[^0-9+()-\s]/g, '')}`;
      phoneLink.textContent = phoneNumber;
      phoneLink.addEventListener('click', () => {
        analytics.trackPhoneClick(businessId);
      });
      phoneContainer.appendChild(phoneLink);
    }

    if (business.email) {
      emailContainer.textContent = '📧 ';
      const emailLink = document.createElement('a');
      emailLink.href = `mailto:${business.email}`;
      emailLink.textContent = business.email;
      emailContainer.appendChild(emailLink);
    }

    const websiteURL = sanitizeUrl(business.website_url || '');
    if (websiteURL) {
      websiteContainer.textContent = '🌐 ';
      const websiteLink = document.createElement('a');
      websiteLink.href = websiteURL;
      websiteLink.textContent = 'Visit Website';
      websiteLink.target = '_blank';
      websiteLink.rel = 'noopener';
      websiteLink.addEventListener('click', () => {
        analytics.trackWebsiteClick(businessId);
      });
      websiteContainer.appendChild(websiteLink);
    }

    const churchId = business.church_id;
    if (churchId) {
      await loadChurchInfo(churchId);
    }

    if (business.hours_of_operation && Object.keys(business.hours_of_operation).length > 0) {
      displayHours(business.hours_of_operation);
    }

    console.log('[KC DEBUG] Business loaded:', business.business_name);
    console.log('[KC DEBUG] isPro:', isPro, 'pro_status:', business.pro_status);
    console.log('[KC DEBUG] photos:', business.photos?.length || 0, business.photos);
    console.log('[KC DEBUG] subcategories:', business.subcategories);
    
    if (isPro && (business.photos || business.videos || business.video_url || business.video_files)) {
      console.log('[KC DEBUG] Calling displayMedia');
      displayMedia(business);
    } else {
      console.log('[KC DEBUG] Skipping displayMedia - isPro:', isPro, 'has photos:', !!business.photos, 'video_files:', !!business.video_files);
    }

    if (isPro && business.social_media && business.show_social_media !== false) {
      const sm = business.social_media;
      if (sm.facebook || sm.instagram || sm.twitter || sm.linkedin || sm.youtube) {
        displaySocialMedia(business);
      }
    }

    if (isPro) {
      await loadPromotions(businessId);
      await loadProductsServices(businessId);
      await loadTestimonials(businessId);
    }

    await loadReviews(businessId, business);

    document.getElementById('submitReviewBtn').href = `submit_review.html?id=${businessId}`;
    
    // Hide review button if viewing your own business
    if (currentUser && business.admin_uid === currentUser.uid) {
      const reviewContainer = document.getElementById('submitReviewContainer');
      if (reviewContainer) {
        reviewContainer.classList.add('hidden');
      }
    }

    if (currentUser) {
      setupFavoriteButton();
      setupShareButtons();
    }

  } catch (error) {
    console.error('Error loading business:', error);
    document.getElementById('loadingMessage').textContent = 'Error loading business: ' + error.message;
  }
}

async function loadChurchInfo(churchId) {
  try {
    const churchDoc = await getDoc(doc(db, 'churches', churchId));
    if (churchDoc.exists()) {
      const church = churchDoc.data();
      const churchContainer = document.getElementById('churchName');
      
      churchContainer.textContent = '⛪ ';
      const churchLink = document.createElement('a');
      churchLink.href = (church.slug && church.slug.trim()) ? `church.html?slug=${church.slug}` : `church.html?id=${churchId}`;
      churchLink.textContent = church.church_name || 'Unknown Church';
      churchLink.className = 'gold text-underline';
      churchContainer.appendChild(churchLink);
      
      document.getElementById('churchAffiliation').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading church:', error);
  }
}

function displayHours(hours) {
  const daysOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayNames = {
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday'
  };

  let hoursHTML = '<div class="grid-2 gap-sm">';
  
  daysOrder.forEach(day => {
    const dayHours = hours[day];
    const displayText = dayHours && dayHours.open && dayHours.close 
      ? `${escapeHtml(dayHours.open)} - ${escapeHtml(dayHours.close)}`
      : 'Closed';
    
    hoursHTML += `
      <div class="flex justify-space-between mb-sm">
        <strong>${dayNames[day]}:</strong>
        <span>${displayText}</span>
      </div>
    `;
  });
  
  hoursHTML += '</div>';
  
  document.getElementById('businessHours').innerHTML = hoursHTML;
  document.getElementById('hoursSection').classList.remove('hidden');
}

function displayMedia(business) {
  const mediaSection = document.getElementById('mediaSection');
  const photoGallery = document.getElementById('photoGallery');
  const videoGallery = document.getElementById('videoGallery');
  
  let hasMedia = false;

  if (business.photos && business.photos.length > 0) {
    photoGallery.innerHTML = business.photos.map(url => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return '';
      return `
        <div class="media-item">
          <img src="${safeUrl}" alt="Business photo" class="business-photo">
        </div>
      `;
    }).filter(Boolean).join('');
    hasMedia = true;
  }

  if (business.video_files && business.video_files.length > 0) {
    const videoFilesHTML = business.video_files.map(url => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return '';
      return `
        <div class="video-file-container mb-md">
          <video src="${safeUrl}" controls class="uploaded-video" preload="metadata">
            Your browser does not support the video tag.
          </video>
        </div>
      `;
    }).filter(Boolean).join('');
    
    if (videoFilesHTML) {
      videoGallery.innerHTML = videoFilesHTML;
      hasMedia = true;
    }
  }

  const videoUrls = business.videos && business.videos.length > 0 
    ? business.videos 
    : (business.video_url ? [business.video_url] : []);

  if (videoUrls.length > 0) {
    let videoHTML = '';
    
    videoUrls.forEach(url => {
      const videoUrl = sanitizeUrl(url);
      if (!videoUrl) return;
      
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        const videoId = extractYouTubeID(videoUrl);
        if (videoId) {
          const safeVideoId = escapeHtml(videoId);
          videoHTML += `
            <div class="video-container mb-md">
              <iframe 
                src="https://www.youtube.com/embed/${safeVideoId}" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen>
              </iframe>
            </div>
          `;
          hasMedia = true;
        }
      } else if (videoUrl.includes('vimeo.com')) {
        const videoId = escapeHtml(videoUrl.split('/').pop());
        videoHTML += `
          <div class="video-container mb-md">
            <iframe 
              src="https://player.vimeo.com/video/${videoId}" 
              frameborder="0" 
              allow="autoplay; fullscreen; picture-in-picture" 
              allowfullscreen>
            </iframe>
          </div>
        `;
        hasMedia = true;
      } else {
        videoHTML += `<p><a href="${videoUrl}" target="_blank" rel="noopener" class="btn btn-small btn-gold">Watch Video</a></p>`;
        hasMedia = true;
      }
    });
    
    videoGallery.innerHTML += videoHTML;
  }

  if (hasMedia) {
    mediaSection.classList.remove('hidden');
  }
}

function extractYouTubeID(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function displaySocialMedia(business) {
  const socialLinks = [];
  const sm = business.social_media || {};
  
  const socialIcons = {
    facebook: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
    twitter: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF" stroke="#888888" stroke-width="0.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    linkedin: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
  };
  
  if (sm.facebook) {
    const safeFacebook = sanitizeUrl(sm.facebook);
    if (safeFacebook) {
      socialLinks.push(`<a href="${safeFacebook}" target="_blank" rel="noopener" class="social-icon-link" title="Facebook">${socialIcons.facebook}<span class="social-label">Facebook</span></a>`);
    }
  }
  if (sm.instagram) {
    const safeInstagram = sanitizeUrl(sm.instagram);
    if (safeInstagram) {
      socialLinks.push(`<a href="${safeInstagram}" target="_blank" rel="noopener" class="social-icon-link" title="Instagram">${socialIcons.instagram}<span class="social-label">Instagram</span></a>`);
    }
  }
  if (sm.twitter) {
    const safeTwitter = sanitizeUrl(sm.twitter);
    if (safeTwitter) {
      socialLinks.push(`<a href="${safeTwitter}" target="_blank" rel="noopener" class="social-icon-link" title="X (Twitter)">${socialIcons.twitter}<span class="social-label">X</span></a>`);
    }
  }
  if (sm.linkedin) {
    const safeLinkedin = sanitizeUrl(sm.linkedin);
    if (safeLinkedin) {
      socialLinks.push(`<a href="${safeLinkedin}" target="_blank" rel="noopener" class="social-icon-link" title="LinkedIn">${socialIcons.linkedin}<span class="social-label">LinkedIn</span></a>`);
    }
  }
  if (sm.youtube) {
    const safeYoutube = sanitizeUrl(sm.youtube);
    if (safeYoutube) {
      socialLinks.push(`<a href="${safeYoutube}" target="_blank" rel="noopener" class="social-icon-link" title="YouTube">${socialIcons.youtube}<span class="social-label">YouTube</span></a>`);
    }
  }

  if (socialLinks.length > 0) {
    document.getElementById('socialMediaLinks').innerHTML = socialLinks.join('');
    document.getElementById('socialMediaSection').classList.remove('hidden');
  }
}

async function loadPromotions(businessId) {
  try {
    const q = query(collection(db, `business_listings_public/${businessId}/promotions`));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;
    
    const now = new Date();
    const promotions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(p => {
        const endDate = p.end_date?.toDate?.() || new Date(0);
        const startDate = p.start_date?.toDate?.() || new Date(0);
        return startDate <= now && endDate >= now;
      })
      .sort((a, b) => {
        const endA = a.end_date?.toDate?.() || new Date(0);
        const endB = b.end_date?.toDate?.() || new Date(0);
        return endA - endB;
      });
    
    if (promotions.length === 0) return;
    
    const promotionsHTML = promotions.map(promo => {
      const endDate = promo.end_date?.toDate?.() || new Date();
      const endDateStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      return `
        <div class="promotion-card mb-md">
          <div class="flex-between">
            <h3 class="gold-metallic">${escapeHtml(promo.title)}</h3>
            <span class="badge badge-gold">Ends ${endDateStr}</span>
          </div>
          <p class="mt-sm">${escapeHtml(promo.description)}</p>
          ${promo.coupon_code ? `<p class="mt-sm"><strong>Use code:</strong> <span class="coupon-code">${escapeHtml(promo.coupon_code)}</span></p>` : ''}
          ${promo.terms ? `<p class="text-sm text-muted mt-sm">${escapeHtml(promo.terms)}</p>` : ''}
        </div>
      `;
    }).join('');
    
    document.getElementById('promotionsList').innerHTML = promotionsHTML;
    document.getElementById('promotionsSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading promotions:', error);
  }
}

async function loadProductsServices(businessId) {
  try {
    const q = query(collection(db, `business_listings_public/${businessId}/products_services`));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;
    
    const items = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.is_active !== false)
      .sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    
    if (items.length === 0) return;
    
    const itemsHTML = items.map(item => `
      <div class="product-service-card mb-md">
        <div class="flex-between">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <span class="badge ${item.item_type === 'product' ? 'badge-info' : 'badge-warning'}">${item.item_type === 'product' ? 'Product' : 'Service'}</span>
            ${item.is_featured ? '<span class="badge badge-gold ml-sm">Featured</span>' : ''}
          </div>
          ${item.price ? `<span class="text-lg gold-metallic">${escapeHtml(item.price)}</span>` : ''}
        </div>
        <p class="mt-sm">${escapeHtml(item.description)}</p>
        ${item.duration ? `<p class="text-sm text-muted mt-sm">${escapeHtml(item.duration)}</p>` : ''}
      </div>
    `).join('');
    
    document.getElementById('productsServicesList').innerHTML = itemsHTML;
    document.getElementById('productsServicesSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading products/services:', error);
  }
}

async function loadTestimonials(businessId) {
  try {
    const q = query(collection(db, `business_listings_public/${businessId}/testimonials`));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;
    
    const testimonials = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(t => t.is_active !== false)
      .sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0);
      });
    
    if (testimonials.length === 0) return;
    
    const testimonialsHTML = testimonials.map(t => `
      <div class="testimonial-card mb-md">
        <div class="flex-between mb-sm">
          <div>
            <strong>${escapeHtml(t.customer_name)}</strong>
            ${t.customer_title ? `<span class="text-muted"> - ${escapeHtml(t.customer_title)}</span>` : ''}
          </div>
          <span class="stars gold">${'★'.repeat(t.rating || 5)}${'☆'.repeat(5 - (t.rating || 5))}</span>
        </div>
        <blockquote class="testimonial-quote">"${escapeHtml(t.quote)}"</blockquote>
      </div>
    `).join('');
    
    document.getElementById('testimonialsList').innerHTML = testimonialsHTML;
    document.getElementById('testimonialsSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading testimonials:', error);
  }
}

async function loadReviews(businessId, business) {
  try {
    const q = query(
      collection(db, 'reviews'), 
      where('business_id', '==', businessId),
      orderBy('created_at', 'desc')
    );
    const reviewsSnapshot = await getDocs(q);
    
    const reviews = reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (reviews.length === 0) {
      document.getElementById('noReviews').classList.remove('hidden');
      document.getElementById('ratingDisplay').innerHTML = '<p class="text-muted">No reviews yet</p>';
      return;
    }

    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avgRating = (totalRating / reviews.length).toFixed(1);
    const stars = '⭐'.repeat(Math.round(avgRating));

    document.getElementById('ratingDisplay').innerHTML = `
      <div class="rating-display">
        <span class="stars text-2xl">${stars}</span>
        <span class="text-lg ml-sm">${avgRating} / 5.0</span>
        <span class="text-muted ml-sm">(${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'})</span>
      </div>
    `;

    document.getElementById('reviewsList').innerHTML = reviews.map(review => createReviewCard(review)).join('');

  } catch (error) {
    console.error('Error loading reviews:', error);
  }
}

function createReviewCard(review) {
  const stars = '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0));
  const reviewDate = review.created_at?.toDate ? review.created_at.toDate().toLocaleDateString() : 'Unknown date';
  const reviewerName = review.reviewer_name || 'Anonymous';

  let responseHTML = '';
  if (review.response_text) {
    const responseDate = review.response_date?.toDate ? review.response_date.toDate().toLocaleDateString() : '';
    responseHTML = `
      <div class="response-box">
        <strong>Business Response:</strong> <span class="review-date">${responseDate}</span>
        <p class="mt-sm">${escapeHtml(review.response_text)}</p>
      </div>
    `;
  }

  return `
    <div class="review-card mb-md">
      <div class="review-header">
        <div>
          <strong>${escapeHtml(reviewerName)}</strong>
          <div class="stars">${stars}</div>
        </div>
        <div class="review-date">${reviewDate}</div>
      </div>
      <p>${escapeHtml(review.review_text || 'No review text provided')}</p>
      ${responseHTML}
    </div>
  `;
}

async function setupFavoriteButton() {
  const favoriteContainer = document.getElementById('favoriteContainer');
  const favoriteBtn = document.getElementById('favoriteBtn');
  if (!favoriteContainer || !favoriteBtn || !currentUser) return;

  favoriteContainer.classList.remove('hidden');

  let isFavorited = await checkIfFavorited(currentUser.uid, businessId);
  updateFavoriteButton(isFavorited);

  favoriteBtn.addEventListener('click', async () => {
    const result = await toggleFavorite(currentUser.uid, businessId);
    if (result.success) {
      isFavorited = !isFavorited;
      updateFavoriteButton(isFavorited);
      showFavoriteToast(isFavorited ? 'Added to favorites!' : 'Removed from favorites');
    }
  });
}

function showFavoriteToast(message) {
  let toast = document.getElementById('favoriteToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'favoriteToast';
    toast.className = 'favorite-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function updateFavoriteButton(isFavorited) {
  const starOutline = document.getElementById('starOutline');
  const starFilled = document.getElementById('starFilled');
  const favoriteBtn = document.getElementById('favoriteBtn');
  if (!starOutline || !starFilled || !favoriteBtn) return;

  if (isFavorited) {
    starOutline.classList.add('hidden');
    starFilled.classList.remove('hidden');
    favoriteBtn.title = 'Remove from favorites';
  } else {
    starOutline.classList.remove('hidden');
    starFilled.classList.add('hidden');
    favoriteBtn.title = 'Save to favorites';
  }
}

async function setupShareButtons() {
  if (!currentUser) return;

  const shareSection = document.getElementById('shareSection');
  if (!shareSection) return;

  const businessDoc = await getDoc(doc(db, 'business_listings_public', businessId));
  if (!businessDoc.exists()) return;

  const business = businessDoc.data();
  
  // Use slug or ID for preview URL
  const previewId = business.slug || businessId;
  const previewUrl = `${window.location.origin}/preview/business/${previewId}`;
  
  const shareConfig = {
    url: window.location.href,
    previewUrl: previewUrl,
    title: `Check out ${business.business_name || 'this business'} on Kingdom Connects!`,
    description: `${business.description || 'Christian business directory'} - Find faith-based businesses in your community.`
  };

  renderShareButtons('socialShareButtons', shareConfig);
  shareSection.classList.remove('hidden');
}
