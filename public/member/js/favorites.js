import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireMember } from "../../js/auth/access-control.js";

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

requireMember((userContext, firebaseUser) => {
  loadFavorites(firebaseUser.uid);
});

async function loadFavorites(userId) {
  const loadingMessage = document.getElementById('loadingMessage');
  const contentArea = document.getElementById('contentArea');
  const emptyState = document.getElementById('emptyState');
  const errorMessage = document.getElementById('errorMessage');

  try {
    // Query without orderBy to avoid needing composite index
    const favoritesQuery = query(
      collection(db, "favorite_businesses"), 
      where("user_id", "==", userId)
    );
    const favoritesSnapshot = await getDocs(favoritesQuery);

    if (favoritesSnapshot.empty) {
      loadingMessage.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    const businesses = [];

    for (const favoriteDoc of favoritesSnapshot.docs) {
      const favorite = favoriteDoc.data();
      favorite.id = favoriteDoc.id;

      const businessDoc = await getDoc(doc(db, "business_listings_public", favorite.business_id));
      if (businessDoc.exists()) {
        businesses.push({ ...favorite, data: businessDoc.data(), docId: businessDoc.id });
      }
    }

    // Sort client-side by saved_at descending
    businesses.sort((a, b) => {
      const aTime = a.saved_at?.seconds || 0;
      const bTime = b.saved_at?.seconds || 0;
      return bTime - aTime;
    });

    renderBusinesses(businesses);

    loadingMessage.classList.add('hidden');
    contentArea.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading favorites:', error.code, error.message, error);
    loadingMessage.classList.add('hidden');
    if (errorMessage) {
      errorMessage.textContent = `Error: ${error.code || 'Unknown'} - ${error.message || 'Failed to load favorites'}`;
      errorMessage.classList.remove('hidden');
    }
  }
}

function renderBusinesses(businesses) {
  const container = document.getElementById('businessFavorites');
  container.innerHTML = '';

  if (businesses.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'text-center p-md text-muted';
    emptyDiv.textContent = 'No favorite businesses yet.';
    container.appendChild(emptyDiv);
    return;
  }

  businesses.forEach(favorite => {
    const business = favorite.data;
    const card = document.createElement('article');
    card.className = 'card mb-md business-border';

    const businessName = document.createElement('h3');
    businessName.className = 'gold-metallic mb-sm';
    const nameLink = document.createElement('a');
    nameLink.href = business.slug 
      ? `../business.html?slug=${business.slug}` 
      : `../business.html?id=${favorite.docId}`;
    nameLink.textContent = business.business_name || 'Unnamed Business';
    businessName.appendChild(nameLink);
    card.appendChild(businessName);

    if (business.description) {
      const desc = document.createElement('p');
      desc.className = 'mb-sm';
      desc.textContent = business.description;
      card.appendChild(desc);
    }

    if (business.city || business.state) {
      const location = document.createElement('p');
      location.className = 'text-sm text-muted mb-sm';
      location.textContent = `${business.city || ''}${business.city && business.state ? ', ' : ''}${business.state || ''}`;
      card.appendChild(location);
    }

    const btnContainer = document.createElement('div');
    btnContainer.className = 'btn-row mt-md';

    const viewBtn = document.createElement('a');
    viewBtn.href = business.slug 
      ? `../business.html?slug=${business.slug}` 
      : `../business.html?id=${favorite.docId}`;
    viewBtn.className = 'btn btn-gold';
    viewBtn.textContent = 'View Details';
    btnContainer.appendChild(viewBtn);

    const unsaveBtn = document.createElement('button');
    unsaveBtn.className = 'btn btn-danger';
    unsaveBtn.textContent = 'Unsave';
    unsaveBtn.addEventListener('click', () => handleUnsave(favorite.id, favorite.docId));
    btnContainer.appendChild(unsaveBtn);

    card.appendChild(btnContainer);
    container.appendChild(card);
  });
}

async function handleUnsave(favoriteId, businessId) {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Remove Favorite', 'Remove this business from your favorites?', 'Remove', 'warning')
    : confirm('Remove this business from your favorites?');
  
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "favorite_businesses", favoriteId));
    
    const card = document.querySelector(`[data-favorite-id="${favoriteId}"]`)?.closest('.card');
    if (card) {
      card.remove();
    } else {
      location.reload();
    }
    
    if (window.showSuccessAnimation) {
      window.showSuccessAnimation('Removed!');
    }
    window.showToast('Business removed from favorites!', 'success');
  } catch (error) {
    console.error('Error removing favorite:', error);
    window.showToast('Error removing favorite. Please try again.', 'error');
  }
}
