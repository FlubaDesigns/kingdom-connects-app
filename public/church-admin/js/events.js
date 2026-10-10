/* Kingdom Connects - Church Admin Events Management */
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let currentChurchId = null;
let currentEditingId = null;
let unsubscribe = null;

const modal = document.getElementById('eventModal');
const form = document.getElementById('eventForm');
const eventsList = document.getElementById('eventsList');

requireAuth({ requireChurch: true }, (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Events: Auth verified, church:', churchContext?.id);
  
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  if (churchContext) {
    currentChurchId = churchContext.id;
    loadEvents();
  }
});

function loadEvents() {
  const q = query(collection(db, `churches/${currentChurchId}/events`));
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const events = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dateA = a.start_time?.toDate?.() || new Date(0);
        const dateB = b.start_time?.toDate?.() || new Date(0);
        return dateA - dateB;
      });
    
    if (events.length === 0) {
      eventsList.innerHTML = '<p class="status-message empty">No events yet. Create your first one!</p>';
      return;
    }

    const now = new Date();
    const upcomingEvents = events.filter(e => {
      const eventDate = e.start_time?.toDate?.() || new Date(0);
      return eventDate >= now;
    });
    const pastEvents = events.filter(e => {
      const eventDate = e.start_time?.toDate?.() || new Date(0);
      return eventDate < now;
    });

    let html = '';
    
    if (upcomingEvents.length > 0) {
      html += `<h3 class="gold mb-sm">Upcoming Events</h3><div class="card-list mb-md">${upcomingEvents.map(event => renderEventCard(event)).join('')}</div>`;
    }
    
    if (pastEvents.length > 0) {
      html += `<h3 class="text-muted mb-sm">Past Events</h3><div class="card-list">${pastEvents.map(event => renderEventCard(event, true)).join('')}</div>`;
    }

    eventsList.innerHTML = html;
  });
}

function renderEventCard(event, isPast = false) {
  const startDate = event.start_time?.toDate?.() || new Date();
  const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  return `
    <article class="card card-compact ${isPast ? 'opacity-60' : ''}">
      <div class="flex-between-center mb-sm">
        <h3 class="gold m-0">${escapeHtml(event.title)}</h3>
        <span class="text-muted text-sm">${dateStr}</span>
      </div>
      <p class="mb-sm">${escapeHtml(event.description)}</p>
      <div class="text-muted text-sm mb-sm">
        <span>${timeStr}</span>
        ${event.location ? ` • ${escapeHtml(event.location)}` : ''}
        ${event.rsvp_link ? ` • <a href="${event.rsvp_link}" target="_blank" class="gold">RSVP</a>` : ''}
      </div>
      <div class="flex-gap-sm">
        <button class="btn btn-secondary btn-small" data-action="edit" data-id="${event.id}">Edit</button>
        <button class="btn btn-danger btn-small" data-action="delete" data-id="${event.id}">Delete</button>
      </div>
    </article>`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccessMessage(message) {
  let successDiv = document.getElementById('successMessage');
  if (!successDiv) {
    successDiv = document.createElement('div');
    successDiv.id = 'successMessage';
    successDiv.className = 'status-message success';
    const main = document.getElementById('main');
    main.insertBefore(successDiv, main.querySelector('.page-header').nextSibling);
  }
  successDiv.textContent = message;
  successDiv.classList.remove('hidden');
  setTimeout(() => successDiv.classList.add('hidden'), 4000);
}

document.getElementById('addEventBtn').addEventListener('click', () => {
  currentEditingId = null;
  form.reset();
  document.getElementById('modalTitle').textContent = 'Add Event';
  modal.classList.add('active');
});

document.getElementById('closeModal').addEventListener('click', () => {
  modal.classList.remove('active');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  modal.classList.remove('active');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const dateVal = document.getElementById('eventDate').value;
    const timeVal = document.getElementById('eventTime').value;
    const endTimeVal = document.getElementById('endTime').value;
    
    const startTime = Timestamp.fromDate(new Date(`${dateVal}T${timeVal}`));
    let endTime = null;
    if (endTimeVal) {
      endTime = Timestamp.fromDate(new Date(`${dateVal}T${endTimeVal}`));
    }

    const eventData = {
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      start_time: startTime,
      end_time: endTime,
      location: document.getElementById('location').value.trim(),
      rsvp_link: document.getElementById('rsvpLink').value.trim(),
      visibility: 'visible',
      updated_at: serverTimestamp()
    };

    if (currentEditingId) {
      await updateDoc(doc(db, `churches/${currentChurchId}/events`, currentEditingId), eventData);
    } else {
      eventData.created_at = serverTimestamp();
      await addDoc(collection(db, `churches/${currentChurchId}/events`), eventData);
    }

    modal.classList.remove('active');
    form.reset();
    showSuccessMessage(currentEditingId ? 'Event updated!' : 'Event added!');
  } catch (error) {
    console.error('Error saving event:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error saving event. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Event';
  }
});

document.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) return;

  if (action === 'edit') {
    currentEditingId = id;
    const docSnap = await getDoc(doc(db, `churches/${currentChurchId}/events`, id));
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('title').value = data.title || '';
      document.getElementById('description').value = data.description || '';
      document.getElementById('location').value = data.location || '';
      document.getElementById('rsvpLink').value = data.rsvp_link || '';
      
      if (data.start_time) {
        const startDate = data.start_time.toDate ? data.start_time.toDate() : new Date(data.start_time);
        document.getElementById('eventDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('eventTime').value = startDate.toTimeString().slice(0, 5);
      }
      if (data.end_time) {
        const endDate = data.end_time.toDate ? data.end_time.toDate() : new Date(data.end_time);
        document.getElementById('endTime').value = endDate.toTimeString().slice(0, 5);
      }
      
      document.getElementById('modalTitle').textContent = 'Edit Event';
      modal.classList.add('active');
    }
  }

  if (action === 'delete') {
    if (confirm('Are you sure you want to delete this event?')) {
      try {
        await deleteDoc(doc(db, `churches/${currentChurchId}/events`, id));
        showSuccessMessage('Event deleted!');
      } catch (error) {
        console.error('Error deleting event:', error);
        if (typeof window.showToast === 'function') {
          window.showToast('Error deleting event.', 'error');
        }
      }
    }
  }
});

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});
