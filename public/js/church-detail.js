/**
 * Church Detail Page - Displays public church information and custom content
 * Uses Firestore subcollections for announcements, events, activities, media, resources
 */

import { db } from "./firebase-config.js";
import { doc, getDoc, collection, query, where, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loadingMessage = document.getElementById('loadingMessage');
const contentArea = document.getElementById('contentArea');
const errorMessage = document.getElementById('errorMessage');

const params = new URLSearchParams(window.location.search);
const churchId = params.get('id');

if (!churchId) {
  loadingMessage.classList.add('hidden');
  errorMessage.classList.remove('hidden');
} else {
  loadChurch();
}

async function loadChurch() {
  try {
    const churchDoc = await getDoc(doc(db, 'churches', churchId));
    
    if (!churchDoc.exists()) {
      loadingMessage.classList.add('hidden');
      errorMessage.classList.remove('hidden');
      return;
    }

    const church = churchDoc.data();
    renderChurchInfo(church);
    
    // Load all sections in parallel
    await Promise.all([
      loadAnnouncements(churchId, church.page_settings),
      loadEvents(churchId, church.page_settings),
      loadActivities(churchId, church.page_settings),
      loadMedia(churchId, church.page_settings),
      loadResources(churchId, church.page_settings),
      loadFeaturedBusiness(church.featured_business_id)
    ]);

    loadingMessage.classList.add('hidden');
    contentArea.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading church:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

function renderChurchInfo(church) {
  document.title = `${church.name} - Kingdom Connects`;
  document.getElementById('churchName').textContent = church.name;

  if (church.denomination) {
    document.getElementById('denomination').textContent = church.denomination;
  }

  if (church.welcome_message) {
    const welcomeDiv = document.getElementById('welcomeMessage');
    const p = document.createElement('p');
    p.className = 'text-content-italic';
    p.textContent = church.welcome_message;
    welcomeDiv.appendChild(p);
  }

  if (church.hero_media_url) {
    const heroDiv = document.getElementById('heroMedia');
    const img = document.createElement('img');
    img.src = church.hero_media_url;
    img.alt = church.name;
    img.style.width = '100%';
    img.style.borderRadius = '12px';
    heroDiv.appendChild(img);
    heroDiv.classList.remove('hidden');
  }

  // Contact info
  const address = [
    church.address_line1,
    church.address_line2,
    `${church.city}, ${church.state} ${church.zip_code || ''}`
  ].filter(Boolean).join('<br>');
  
  document.getElementById('churchAddress').innerHTML = address ? `📍 ${address}` : '';

  if (church.phone) {
    const phoneDiv = document.getElementById('churchPhone');
    phoneDiv.innerHTML = `📞 <a href="tel:${church.phone}">${church.phone}</a>`;
  }

  if (church.email) {
    const emailDiv = document.getElementById('churchEmail');
    emailDiv.innerHTML = `📧 <a href="mailto:${church.email}">${church.email}</a>`;
  }

  if (church.website) {
    const websiteDiv = document.getElementById('churchWebsite');
    websiteDiv.innerHTML = `🌐 <a href="${church.website}" target="_blank" rel="noopener">Visit Website</a>`;
  }

  if (church.livestream_url) {
    document.getElementById('livestreamLink').href = church.livestream_url;
    document.getElementById('livestreamSection').classList.remove('hidden');
  }
}

async function loadAnnouncements(churchId, pageSettings) {
  if (!pageSettings?.show_announcements) return;

  try {
    const now = new Date();
    const q = query(
      collection(db, `churches/${churchId}/announcements`),
      where('status', '==', 'published'),
      where('publish_start', '<=', now),
      orderBy('publish_start', 'desc'),
      orderBy('priority', 'desc'),
      limit(5)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const list = document.getElementById('announcementsList');
    list.innerHTML = '';

    snapshot.forEach(doc => {
      const announcement = doc.data();
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3 class="gold mb-sm">${escapeHtml(announcement.title)}</h3>
        <p class="text-muted text-sm mb-sm">${announcement.publish_start.toDate().toLocaleDateString()}</p>
        <p>${escapeHtml(announcement.body)}</p>
      `;
      list.appendChild(card);
    });

    document.getElementById('announcementsSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading announcements:', error);
  }
}

async function loadEvents(churchId, pageSettings) {
  if (!pageSettings?.show_events) return;

  try {
    const now = new Date();
    const q = query(
      collection(db, `churches/${churchId}/events`),
      where('visibility', '==', 'visible'),
      where('start_time', '>=', now),
      orderBy('start_time', 'asc'),
      limit(10)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const list = document.getElementById('eventsList');
    list.innerHTML = '';

    snapshot.forEach(doc => {
      const event = doc.data();
      const card = document.createElement('div');
      card.className = 'card';
      
      const startDate = event.start_time.toDate();
      const endDate = event.end_time?.toDate();

      card.innerHTML = `
        <h3 class="gold mb-sm">${escapeHtml(event.title)}</h3>
        <p class="text-muted text-sm mb-sm">
          📅 ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          ${endDate ? ` - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
        </p>
        ${event.location ? `<p class="text-sm mb-sm">📍 ${escapeHtml(event.location)}</p>` : ''}
        <p>${escapeHtml(event.description)}</p>
        ${event.rsvp_link ? `<a href="${event.rsvp_link}" target="_blank" rel="noopener" class="btn btn-small btn-gold mt-sm">RSVP</a>` : ''}
      `;
      list.appendChild(card);
    });

    document.getElementById('eventsSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading events:', error);
  }
}

async function loadActivities(churchId, pageSettings) {
  if (!pageSettings?.show_activities) return;

  try {
    const q = query(
      collection(db, `churches/${churchId}/activities`),
      where('visibility', '==', 'visible'),
      orderBy('sort_order', 'asc')
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const list = document.getElementById('activitiesList');
    list.innerHTML = '';

    snapshot.forEach(doc => {
      const activity = doc.data();
      const card = document.createElement('div');
      card.className = 'card-compact';
      card.innerHTML = `
        <h4 class="gold mb-xs">${escapeHtml(activity.name)}</h4>
        <p class="text-sm text-muted mb-xs">${activity.cadence || ''} • ${activity.audience || 'All Ages'}</p>
        ${activity.day_of_week && activity.time ? `<p class="text-sm mb-xs">🕐 ${activity.day_of_week}s at ${activity.time}</p>` : ''}
        <p class="text-sm">${escapeHtml(activity.description)}</p>
      `;
      list.appendChild(card);
    });

    document.getElementById('activitiesSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}

async function loadMedia(churchId, pageSettings) {
  if (!pageSettings?.show_media) return;

  try {
    const q = query(
      collection(db, `churches/${churchId}/media`),
      where('type', '==', 'image'),
      orderBy('display_order', 'asc'),
      limit(12)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const gallery = document.getElementById('mediaGallery');
    gallery.innerHTML = '';

    snapshot.forEach(doc => {
      const media = doc.data();
      const container = document.createElement('div');
      container.className = 'card-compact';
      
      const img = document.createElement('img');
      img.src = media.download_url;
      img.alt = media.caption || 'Church photo';
      img.style.width = '100%';
      img.style.borderRadius = '8px';
      container.appendChild(img);

      if (media.caption) {
        const caption = document.createElement('p');
        caption.className = 'text-sm text-muted mt-xs';
        caption.textContent = media.caption;
        container.appendChild(caption);
      }

      gallery.appendChild(container);
    });

    document.getElementById('mediaSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading media:', error);
  }
}

async function loadResources(churchId, pageSettings) {
  if (!pageSettings?.show_resources) return;

  try {
    const q = query(
      collection(db, `churches/${churchId}/resources`),
      orderBy('created_at', 'desc'),
      limit(10)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const list = document.getElementById('resourcesList');
    list.innerHTML = '';

    snapshot.forEach(doc => {
      const resource = doc.data();
      const card = document.createElement('div');
      card.className = 'card-compact flex-between-center';
      card.innerHTML = `
        <div>
          <h4 class="gold mb-xs">${escapeHtml(resource.title)}</h4>
          <p class="text-sm text-muted">${resource.category || 'Resource'} • ${resource.file_type?.toUpperCase() || 'File'}</p>
          ${resource.description ? `<p class="text-sm mt-xs">${escapeHtml(resource.description)}</p>` : ''}
        </div>
        <a href="${resource.file_url}" download class="btn btn-small btn-gold">Download</a>
      `;
      list.appendChild(card);
    });

    document.getElementById('resourcesSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading resources:', error);
  }
}

async function loadFeaturedBusiness(businessId) {
  if (!businessId) return;

  try {
    const businessDoc = await getDoc(doc(db, 'business_listings_public', businessId));
    
    if (!businessDoc.exists()) return;

    const business = businessDoc.data();
    const container = document.getElementById('featuredBusiness');
    
    container.innerHTML = `
      <h3 class="gold mb-sm">${escapeHtml(business.business_name)}</h3>
      <p class="text-muted mb-sm">${escapeHtml(business.primary_category)}</p>
      <p class="mb-md">${escapeHtml(business.description || '')}</p>
      <a href="business.html?id=${businessId}" class="btn btn-gold">View Business</a>
    `;

    document.getElementById('featuredBusinessSection').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading featured business:', error);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
