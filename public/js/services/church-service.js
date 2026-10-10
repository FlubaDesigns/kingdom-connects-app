import { db } from '../firebase-config.js';
import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ACTIVE_STATUS = 'active';
const PENDING_STATUS = 'pending';

let cachedChurches = null;
let cachedAllChurches = null;
let cacheTimestamp = null;
let allCacheTimestamp = null;
const CACHE_DURATION_MS = 5 * 60 * 1000;

export async function fetchActiveChurches(options = {}) {
  const { forceRefresh = false } = options;

  if (!forceRefresh && cachedChurches && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION_MS)) {
    return cachedChurches;
  }

  try {
    const churchesQuery = query(
      collection(db, 'churches'),
      where('listing_status', '==', ACTIVE_STATUS)
    );
    
    const snapshot = await getDocs(churchesQuery);
    const churches = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.church_name) {
        churches.push({
          id: docSnap.id,
          church_name: data.church_name,
          city: data.city || '',
          state: data.state || '',
          denomination: data.denomination || '',
          contact_email: data.contact_email || '',
          phone: data.phone || '',
          listing_status: ACTIVE_STATUS
        });
      }
    });

    churches.sort((a, b) => (a.church_name || '').localeCompare(b.church_name || ''));

    cachedChurches = churches;
    cacheTimestamp = Date.now();

    return churches;
  } catch (error) {
    console.error('Error fetching active churches:', error);
    return [];
  }
}

export async function fetchAllChurches(options = {}) {
  const { forceRefresh = false, includeStatuses = ['active', 'pending'] } = options;

  if (!forceRefresh && cachedAllChurches && allCacheTimestamp && (Date.now() - allCacheTimestamp < CACHE_DURATION_MS)) {
    return cachedAllChurches;
  }

  try {
    const churchesQuery = query(
      collection(db, 'churches'),
      where('listing_status', 'in', includeStatuses)
    );
    
    const snapshot = await getDocs(churchesQuery);
    const churches = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.church_name) {
        churches.push({
          id: docSnap.id,
          church_name: data.church_name,
          city: data.city || '',
          state: data.state || '',
          denomination: data.denomination || '',
          contact_email: data.contact_email || '',
          phone: data.phone || '',
          listing_status: data.listing_status || 'unknown'
        });
      }
    });

    churches.sort((a, b) => {
      if (a.listing_status === 'active' && b.listing_status !== 'active') return -1;
      if (a.listing_status !== 'active' && b.listing_status === 'active') return 1;
      return (a.church_name || '').localeCompare(b.church_name || '');
    });

    cachedAllChurches = churches;
    allCacheTimestamp = Date.now();

    return churches;
  } catch (error) {
    console.error('Error fetching all churches:', error);
    return [];
  }
}

export async function fetchChurchById(churchId) {
  if (!churchId) return null;

  try {
    const churchRef = doc(db, 'churches', churchId);
    const churchDoc = await getDoc(churchRef);

    if (!churchDoc.exists()) {
      return null;
    }

    const data = churchDoc.data();
    if (data.listing_status !== ACTIVE_STATUS) {
      console.warn(`Church ${churchId} exists but is not active (status: ${data.listing_status})`);
    }

    return { id: churchDoc.id, ...data };
  } catch (error) {
    console.error('Error fetching church by ID:', error);
    return null;
  }
}

export function populateChurchDropdown(selectElement, churches, options = {}) {
  const { 
    emptyOptionText = 'Select a church...', 
    includeNone = true, 
    noneText = 'Not affiliated with a church',
    includeNominate = false,
    nominateText = 'Nominate a church to join',
    showStatus = false
  } = options;

  if (!selectElement) return;

  selectElement.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = emptyOptionText;
  emptyOption.disabled = true;
  emptyOption.selected = true;
  selectElement.appendChild(emptyOption);

  if (includeNone) {
    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = noneText;
    selectElement.appendChild(noneOption);
  }

  churches.forEach(church => {
    const option = document.createElement('option');
    option.value = church.id;
    let label = `${church.church_name}${church.city ? ` - ${church.city}, ${church.state || ''}` : ''}`;
    if (showStatus && church.listing_status && church.listing_status !== 'active') {
      label += ` (${church.listing_status})`;
    }
    option.textContent = label;
    selectElement.appendChild(option);
  });

  if (includeNominate) {
    const nominateOption = document.createElement('option');
    nominateOption.value = 'nominate';
    nominateOption.textContent = nominateText;
    selectElement.appendChild(nominateOption);
  }
}

export function clearChurchCache() {
  cachedChurches = null;
  cacheTimestamp = null;
}

export function getActiveStatus() {
  return ACTIVE_STATUS;
}
