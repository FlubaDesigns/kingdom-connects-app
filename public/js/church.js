import { db } from "./firebase-config.js";
import { onReady } from "./dom-ready.js";
import { getChurchBySlug } from "./slug-generator.js";
import { renderShareButtons } from './social-share.js';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Track current church for share URLs
let currentChurchId = null;
let currentChurchSlug = null;

const SVG_ICONS = {
  location: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
  email: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
  website: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
  facebook: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>',
  twitter: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  youtube: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  linkedin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
};

async function initChurchProfile() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const churchId = params.get('id');

  const loadingMessage = document.getElementById('loadingMessage');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  const churchProfile = document.getElementById('churchProfile');

  // Check for SSR-embedded data first (from server-rendered pages)
  const ssrData = window.__KC_INITIAL_DATA__;
  const hasSSRData = ssrData && ssrData.type === 'church' && ssrData.data;

  if (!slug && !churchId && !hasSSRData) {
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    errorText.textContent = 'No church specified. Please select a church from the directory.';
    return;
  }

  try {
    let church;
    let actualChurchId;

    // Use SSR-embedded data if available (faster, no network request)
    if (hasSSRData) {
      church = ssrData.data;
      actualChurchId = ssrData.id;
    } else if (slug) {
      const churchData = await getChurchBySlug(slug);
      if (!churchData) {
        loadingMessage.classList.add('hidden');
        errorMessage.classList.remove('hidden');
        errorText.textContent = 'Church not found. This church may have been removed.';
        return;
      }
      church = churchData;
      actualChurchId = churchData.id;
    } else {
      const churchDoc = await getDoc(doc(db, "churches", churchId));
      if (!churchDoc.exists()) {
        loadingMessage.classList.add('hidden');
        errorMessage.classList.remove('hidden');
        errorText.textContent = 'Church not found. This church may have been removed.';
        return;
      }
      church = churchDoc.data();
      actualChurchId = churchId;
    }

    if (church.listing_status !== 'active') throw new Error('This church listing is not currently available.');

    // Store for share URLs
    currentChurchId = actualChurchId;
    currentChurchSlug = church.slug || null;
    
    const settings = church.page_settings || {};
    
    displayChurchProfile(church, settings);

    document.title = `${church.church_name || church.name || 'Church'} - Kingdom Connects`;

    loadingMessage.classList.add('hidden');
    churchProfile.classList.remove('hidden');

    if (settings.show_announcements !== false) {
      loadPeriodicMessage(actualChurchId);
      loadAnnouncements(actualChurchId);
    }
    
    if (settings.show_events !== false) {
      loadEvents(actualChurchId);
    }
    
    if (settings.show_activities !== false) {
      loadActivities(actualChurchId);
    }
    
    // Setup share buttons for the church profile
    setupChurchShareButtons(church);

  } catch (error) {
    console.error("Error loading church:", error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    errorText.textContent = `Error loading church: ${error.message}. Please try again later.`;
  }
}

function displayChurchProfile(church, settings) {
  document.getElementById('churchName').textContent = church.church_name || church.name || 'Unknown Church';
  document.getElementById('churchDescription').textContent = church.description || '';

  if (church.hero_media_url || church.profile_image_url) {
    const heroImg = document.getElementById('heroImage');
    heroImg.src = church.hero_media_url || church.profile_image_url;
    heroImg.classList.remove('hidden');
  }

  if (settings.show_denomination !== false && church.denomination) {
    const denomEl = document.getElementById('churchDenomination');
    denomEl.textContent = church.denomination;
    denomEl.classList.remove('hidden');
  }

  if (settings.show_welcome_message !== false && church.welcome_message) {
    const welcomeEl = document.getElementById('welcomeMessage');
    welcomeEl.textContent = church.welcome_message;
    welcomeEl.classList.remove('hidden');
  }

  displayContactInfo(church, settings);

  if (settings.show_social_media !== false && church.show_social_media !== false) {
    displaySocialMedia(church);
  }

  if (settings.show_service_times !== false) {
    displayServiceTimes(church);
  }

  if (church.livestream_url) {
    const livestreamCard = document.getElementById('livestreamCard');
    const livestreamLink = document.getElementById('livestreamLink');
    livestreamLink.href = church.livestream_url;
    livestreamCard.classList.remove('hidden');
  }
}

function displayContactInfo(church, settings) {
  const contactCard = document.getElementById('contactCard');
  const contactInfo = document.getElementById('contactInfo');
  const rows = [];

  if (settings.show_address !== false) {
    const addressParts = [];
    if (church.address_line1) addressParts.push(church.address_line1);
    if (church.address_line2) addressParts.push(church.address_line2);
    if (church.city) addressParts.push(church.city);
    if (church.state) addressParts.push(church.state);
    if (church.zip_code) addressParts.push(church.zip_code);
    
    if (addressParts.length > 0) {
      const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addressParts.join(', '))}`;
      rows.push(`<div class="contact-row">
        ${SVG_ICONS.location}
        <a href="${mapsUrl}" target="_blank" rel="noopener">${escapeHtml(addressParts.join(', '))}</a>
      </div>`);
    }
  }

  if (settings.show_phone !== false && church.contact_phone) {
    rows.push(`<div class="contact-row">
      ${SVG_ICONS.phone}
      <a href="tel:${church.contact_phone}">${escapeHtml(church.contact_phone)}</a>
    </div>`);
  }

  if (settings.show_email !== false && church.contact_email) {
    rows.push(`<div class="contact-row">
      ${SVG_ICONS.email}
      <a href="mailto:${church.contact_email}">${escapeHtml(church.contact_email)}</a>
    </div>`);
  }

  if (settings.show_website !== false && church.website) {
    rows.push(`<div class="contact-row">
      ${SVG_ICONS.website}
      <a href="${church.website}" target="_blank" rel="noopener">${escapeHtml(church.website.replace(/^https?:\/\//, ''))}</a>
    </div>`);
  }

  if (rows.length > 0) {
    contactInfo.innerHTML = rows.join('');
    contactCard.classList.remove('hidden');
  }
}

function displaySocialMedia(church) {
  const socialCard = document.getElementById('socialMediaCard');
  const socialLinks = document.getElementById('socialMediaLinks');
  const links = [];

  const social = church.social_media || {};
  
  if (social.facebook) {
    links.push(`<a href="${social.facebook}" target="_blank" rel="noopener" class="social-link">${SVG_ICONS.facebook}<span>Facebook</span></a>`);
  }
  if (social.instagram) {
    links.push(`<a href="${social.instagram}" target="_blank" rel="noopener" class="social-link">${SVG_ICONS.instagram}<span>Instagram</span></a>`);
  }
  if (social.twitter) {
    links.push(`<a href="${social.twitter}" target="_blank" rel="noopener" class="social-link">${SVG_ICONS.twitter}<span>X</span></a>`);
  }
  if (social.youtube) {
    links.push(`<a href="${social.youtube}" target="_blank" rel="noopener" class="social-link">${SVG_ICONS.youtube}<span>YouTube</span></a>`);
  }
  if (social.linkedin) {
    links.push(`<a href="${social.linkedin}" target="_blank" rel="noopener" class="social-link">${SVG_ICONS.linkedin}<span>LinkedIn</span></a>`);
  }

  if (links.length > 0) {
    socialLinks.innerHTML = links.join('');
    socialCard.classList.remove('hidden');
  }
}

function displayServiceTimes(church) {
  if (!church.service_times || !Array.isArray(church.service_times) || church.service_times.length === 0) {
    return;
  }

  const serviceTimesCard = document.getElementById('serviceTimesCard');
  const serviceTimesList = document.getElementById('serviceTimes');
  
  serviceTimesList.innerHTML = church.service_times.map(service => {
    if (typeof service === 'object' && service.service_type) {
      return `<li><span class="service-name">${escapeHtml(service.service_type)}</span><span class="service-time">${escapeHtml(service.time || '')}</span></li>`;
    }
    return `<li><span class="service-time">${escapeHtml(String(service))}</span></li>`;
  }).join('');
  
  serviceTimesCard.classList.remove('hidden');
}

async function loadPeriodicMessage(churchId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const q = query(
      collection(db, 'church_messages'),
      where('audience', 'in', ['both','social']),
      where('church_id', '==', churchId),
      where('active', '==', true)
    );

    const snapshot = await getDocs(q);
    
    const messages = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(msg => {
        if (msg.audience === 'members') return false;
        if (msg.end_date && msg.end_date < today) return false;
        if (msg.start_date && msg.start_date > today) return false;
        return true;
      })
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
    
    if (messages.length > 0) {
      const msgData = messages[0];
      const frequencyLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', one_time: '' };
      
      document.getElementById('messageTitle').textContent = msgData.title;
      document.getElementById('messageDate').textContent = msgData.header || frequencyLabels[msgData.frequency] || '';
      document.getElementById('messageContent').textContent = msgData.message;
      document.getElementById('pastorMessageCard').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading periodic message:', error);
  }
}

function toDate(val) {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  if (val.seconds) return new Date(val.seconds * 1000);
  return null;
}

async function loadAnnouncements(churchId) {
  try {
    const now = new Date();
    
    const q = query(collection(db, `churches/${churchId}/announcements`), where('status', '==', 'published'));
    const snapshot = await getDocs(q);
    
    const announcements = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(ann => {
        if (ann.status !== 'published') return false;
        const publishStart = toDate(ann.publish_start);
        const publishEnd = toDate(ann.publish_end);
        if (publishStart && publishStart > now) return false;
        if (publishEnd && publishEnd < now) return false;
        return true;
      })
      .sort((a, b) => {
        const priorityA = a.priority || 3;
        const priorityB = b.priority || 3;
        if (priorityA !== priorityB) return priorityA - priorityB;
        const dateA = toDate(a.publish_start) || toDate(a.created_at) || new Date(0);
        const dateB = toDate(b.publish_start) || toDate(b.created_at) || new Date(0);
        return dateB - dateA;
      });
    
    if (announcements.length > 0) {
      const list = document.getElementById('announcementsList');
      
      list.innerHTML = announcements.map(ann => {
        const pubDate = toDate(ann.publish_start) || toDate(ann.created_at);
        const dateStr = pubDate ? pubDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        return `
          <div class="announcement-item">
            <h3 class="announcement-title">${escapeHtml(ann.title)}</h3>
            ${dateStr ? `<p class="announcement-date">${dateStr}</p>` : ''}
            <p class="line-height-relaxed">${escapeHtml(ann.body || '')}</p>
          </div>
        `;
      }).join('');
      
      document.getElementById('announcementsCard').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading announcements:', error);
  }
}

async function loadEvents(churchId) {
  try {
    const now = new Date();
    
    const q = query(collection(db, `churches/${churchId}/events`), where('visibility', '==', 'visible'));
    const snapshot = await getDocs(q);
    
    const events = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(evt => {
        if (evt.visibility && evt.visibility !== 'visible') return false;
        const startTime = toDate(evt.start_time);
        if (!startTime) return false;
        if (startTime < now) return false;
        return true;
      })
      .sort((a, b) => {
        const dateA = toDate(a.start_time) || new Date(0);
        const dateB = toDate(b.start_time) || new Date(0);
        return dateA - dateB;
      });
    
    if (events.length > 0) {
      const list = document.getElementById('eventsList');
      
      list.innerHTML = events.map(evt => {
        const startTime = toDate(evt.start_time);
        const endTime = toDate(evt.end_time);
        const dateStr = startTime ? startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'TBA';
        const timeStr = startTime ? startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        const endTimeStr = endTime ? endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        const fullTimeStr = timeStr + (endTimeStr ? ` - ${endTimeStr}` : '');
        
        const previewUrl = `${window.location.origin}/preview/church/${currentChurchSlug || currentChurchId}`;
        const shareText = `${evt.title} - ${evt.location || 'TBA'}`;
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(previewUrl)}&quote=${encodeURIComponent(shareText)}`;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(previewUrl)}`;
        
        return `
          <div class="event-item">
            <div class="event-header">
              <div>
                <div class="event-title">${escapeHtml(evt.title)}</div>
                <div class="event-meta">
                  <span>📅 ${dateStr}${fullTimeStr ? ` at ${fullTimeStr}` : ''}</span>
                  ${evt.location ? `<span>📍 ${escapeHtml(evt.location)}</span>` : ''}
                </div>
              </div>
            </div>
            ${evt.image_url ? `<img src="${evt.image_url}" class="event-image" alt="${escapeHtml(evt.title)}">` : ''}
            <p class="line-height-relaxed">${escapeHtml(evt.description || '')}</p>
            ${evt.rsvp_link ? `<a href="${evt.rsvp_link}" target="_blank" rel="noopener" class="btn btn-small btn-gold">RSVP</a>` : ''}
            <div class="social-icons-row">
              <a href="${facebookUrl}" target="_blank" rel="noopener" class="social-icon-link" title="Share on Facebook">${SVG_ICONS.facebook}<span class="social-label">Share</span></a>
              <a href="${twitterUrl}" target="_blank" rel="noopener" class="social-icon-link" title="Share on X">${SVG_ICONS.twitter}<span class="social-label">Share</span></a>
            </div>
          </div>
        `;
      }).join('');
      
      document.getElementById('eventsCard').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading events:', error);
  }
}

async function loadActivities(churchId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const q = query(
      collection(db, 'church_activities'),
      where('church_id', '==', churchId),
      where('active', '==', true)
    );

    const snapshot = await getDocs(q);
    const activities = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(activity => activity.date >= today || activity.is_recurring)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
    if (activities.length > 0) {
      const activitiesList = document.getElementById('activitiesList');
      
      activitiesList.innerHTML = activities.map(activity => {
        const previewUrl = `${window.location.origin}/preview/church/${currentChurchSlug || currentChurchId}`;
        const shareText = `${activity.title} at ${activity.location}`;
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(previewUrl)}&quote=${encodeURIComponent(shareText)}`;
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(previewUrl)}`;
        
        return `
          <div class="activity-item">
            <div class="activity-header">
              <div>
                <div class="activity-title">${escapeHtml(activity.title)}</div>
                <div class="activity-meta">
                  <span>📅 ${formatDate(activity.date, activity.time)}</span>
                  <span>📍 ${escapeHtml(activity.location || 'TBA')}</span>
                  ${activity.is_recurring ? `<span class="badge-recurring">Recurring: ${escapeHtml(activity.recurring_description || activity.recurring_pattern || '')}</span>` : ''}
                </div>
              </div>
            </div>
            ${activity.image_url ? `<img src="${activity.image_url}" class="activity-image" alt="${escapeHtml(activity.title)}">` : ''}
            <p class="line-height-relaxed">${escapeHtml(activity.description || '')}</p>
            ${activity.contact_info ? `<p class="text-muted"><strong>Contact:</strong> ${escapeHtml(activity.contact_info)}</p>` : ''}
            <div class="social-icons-row">
              <a href="${facebookUrl}" target="_blank" rel="noopener" class="social-icon-link" title="Share on Facebook">${SVG_ICONS.facebook}<span class="social-label">Share</span></a>
              <a href="${twitterUrl}" target="_blank" rel="noopener" class="social-icon-link" title="Share on X">${SVG_ICONS.twitter}<span class="social-label">Share</span></a>
            </div>
          </div>
        `;
      }).join('');
      
      document.getElementById('activitiesCard').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}

function formatDate(dateStr, timeStr) {
  if (!dateStr) return 'TBA';
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return timeStr ? `${dateFormatted} at ${timeStr}` : dateFormatted;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupChurchShareButtons(church) {
  const shareSection = document.getElementById('shareSection');
  if (!shareSection) return;

  const previewId = currentChurchSlug || currentChurchId;
  const previewUrl = `${window.location.origin}/preview/church/${previewId}`;
  
  const shareConfig = {
    url: window.location.href,
    previewUrl: previewUrl,
    title: `Visit ${church.church_name || 'this church'} on Kingdom Connects!`,
    description: church.description || 'Join our community of faith.'
  };

  renderShareButtons('socialShareButtons', shareConfig);
  shareSection.classList.remove('hidden');
}

onReady(initChurchProfile);
