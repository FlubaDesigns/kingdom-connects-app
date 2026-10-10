import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { sendTemplate } from "../../js/email/email-service.js";
import { updateBusiness } from "../../js/services/business-service.js";

let currentUser = null;
let currentBusinessId = null;
let currentBusinessName = null;
let allChurches = [];
let pendingRequest = null;

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  currentUser = firebaseUser;
  init(businessContext);
});

async function init(businesses) {
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
      showError('No active business found for your account.');
      return;
    }
    
    currentBusinessId = activeBusiness.id;
    currentBusinessName = activeBusiness.business_name;
    
    await checkPendingRequest();
    await loadChurches();
    
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('showAllBtn').addEventListener('click', showAllChurches);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSearch();
    });
    
  } catch (error) {
    console.error('Error initializing:', error);
    showError('Error loading page: ' + error.message);
  }
}

async function checkPendingRequest() {
  try {
    const requestsQuery = query(
      collection(db, "business_affiliation_requests"), 
      where("business_id", "==", currentBusinessId),
      where("requested_by_uid", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    const requestsSnapshot = await getDocs(requestsQuery);
    
    if (!requestsSnapshot.empty) {
      pendingRequest = requestsSnapshot.docs[0];
      const requestData = pendingRequest.data();
      
      document.getElementById('pendingChurchName').textContent = requestData.church_name;
      document.getElementById('pendingMessage').classList.remove('hidden');
      document.getElementById('cancelRequestBtn').addEventListener('click', handleCancelRequest);
      
      // Hide search if pending request exists
      document.querySelector('.card.mb-md').classList.add('hidden');
      document.getElementById('churchesList').classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking pending requests:', error);
  }
}

async function handleCancelRequest() {
  const confirmed = confirm('Are you sure you want to cancel your pending church affiliation request?');
  if (!confirmed) return;
  
  try {
    await changeHierarchy('cancelAffiliation', { businessId: currentBusinessId });
    window.showToast('Request cancelled. You can now search for a different church.', 'success');
    setTimeout(() => window.location.reload(), 1500);
  } catch (error) {
    console.error('Error cancelling request:', error);
    window.showToast('Error cancelling request: ' + error.message, 'error');
  }
}

async function loadChurches() {
  document.getElementById('loadingMessage').classList.remove('hidden');
  
  try {
    const churchesQuery = query(
      collection(db, "churches"), 
      where("listing_status", "==", "active")
    );
    const snapshot = await getDocs(churchesQuery);
    
    allChurches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    document.getElementById('loadingMessage').classList.add('hidden');
    displayChurches(allChurches);
    
  } catch (error) {
    console.error('Error loading churches:', error);
    document.getElementById('loadingMessage').classList.add('hidden');
    showError('Error loading churches: ' + error.message);
  }
}

function handleSearch() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  
  if (!searchTerm) {
    showAllChurches();
    return;
  }
  
  const filtered = allChurches.filter(church => {
    const name = (church.church_name || '').toLowerCase();
    const city = (church.city || '').toLowerCase();
    const state = (church.state || '').toLowerCase();
    
    return name.includes(searchTerm) || city.includes(searchTerm) || state.includes(searchTerm);
  });
  
  displayChurches(filtered);
}

function showAllChurches() {
  document.getElementById('searchInput').value = '';
  displayChurches(allChurches);
}

function displayChurches(churches) {
  const list = document.getElementById('churchesList');
  const emptyState = document.getElementById('emptyState');
  
  list.innerHTML = '';
  
  if (churches.length === 0) {
    list.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  list.classList.remove('hidden');
  
  churches.forEach(church => {
    const card = document.createElement('div');
    card.className = 'card';
    
    const heading = document.createElement('h3');
    heading.className = 'gold';
    heading.textContent = church.church_name || 'Unnamed Church';
    
    const location = document.createElement('p');
    location.innerHTML = `<strong>Location:</strong> ${church.city || 'N/A'}, ${church.state || 'N/A'}`;
    
    const denomination = document.createElement('p');
    denomination.innerHTML = `<strong>Denomination:</strong> ${church.denomination || 'N/A'}`;
    
    const description = document.createElement('p');
    description.className = 'text-sm mt-sm';
    description.textContent = church.description || 'No description available.';
    
    const requestBtn = document.createElement('button');
    requestBtn.className = 'btn btn-gold mt-md';
    requestBtn.textContent = 'Request to Join This Church';
    requestBtn.addEventListener('click', () => handleRequestToJoin(church));
    
    card.appendChild(heading);
    card.appendChild(location);
    card.appendChild(denomination);
    card.appendChild(description);
    card.appendChild(requestBtn);
    
    list.appendChild(card);
  });
}

async function handleRequestToJoin(church) {
  const confirmed = confirm(
    `Do you want to request to join ${church.church_name}?\n\n` +
    `If approved:\n` +
    `• Your business will be affiliated with this church\n` +
    `• Your 10% tithing will go to this church\n` +
    `• You'll appear in their business directory\n\n` +
    `The church admin will review your request.`
  );
  
  if (!confirmed) return;
  
  try {
    const businessRef = doc(db, 'business_listings_public', currentBusinessId);
    const businessSnap = await getDoc(businessRef);
    const businessData = businessSnap.data();
    
    const result = await changeHierarchy('requestAffiliation', { businessId: currentBusinessId, churchId: church.id });
    
    if (church.contact_email) {
      try {
        await sendTemplate('business_requests_church', church.contact_email, {
          church_name: church.church_name,
          business_name: currentBusinessName,
          business_category: businessData?.primary_category || 'Not specified',
          request_notes: 'No additional notes provided.',
          dashboard_link: 'https://kingdomconnects.org/church-admin/'
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }
    
    window.showToast(result.status === 'approved' ? `Affiliation with ${church.church_name} approved.` : `Request sent to ${church.church_name}.`, 'success');
    setTimeout(() => window.location.reload(), 2000);
    
  } catch (error) {
    console.error('Error sending request:', error);
    window.showToast('Error sending request: ' + error.message, 'error');
  }
}

function showError(message) {
  document.getElementById('errorText').textContent = message;
  document.getElementById('errorMessage').classList.remove('hidden');
}
