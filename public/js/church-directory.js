import { db } from "./firebase-config.js";
import { onReady } from "./dom-ready.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function initChurchDirectory() {
  const churchList = document.getElementById("churchList");
  const statusMessage = document.getElementById("statusMessage");
  const resultCount = document.getElementById("resultCount");
  
  const filterDenomination = document.getElementById("filterDenomination");
  const filterState = document.getElementById("filterState");
  const filterCity = document.getElementById("filterCity");
  const filterName = document.getElementById("filterName");
  const searchButton = document.getElementById("searchButton");
  const clearFiltersBtn = document.getElementById("clearFilters");
  
  // Filter toggle functionality
  const filterToggle = document.getElementById("filterToggle");
  const filterContent = document.getElementById("filterContent");
  if (filterToggle && filterContent) {
    filterToggle.addEventListener("click", () => {
      const isExpanded = filterToggle.getAttribute("aria-expanded") === "true";
      filterToggle.setAttribute("aria-expanded", !isExpanded);
      filterContent.classList.toggle("open");
    });
  }

  let allChurches = [];
  let businessCounts = {};

  statusMessage.textContent = "Loading churches...";

  try {
    // Load churches and businesses in parallel
    const [churchesSnapshot, businessesSnapshot] = await Promise.all([
      getDocs(query(collection(db, "churches"), where("listing_status", "==", "active"))),
      getDocs(query(collection(db, "business_listings_public"), where("is_visible", "==", true)))
    ]);

    if (churchesSnapshot.empty) {
      statusMessage.textContent = "No churches found. Check back soon as we add more faith communities!";
      return;
    }

    // Count businesses per church
    businessesSnapshot.forEach((doc) => {
      const business = doc.data();
      if (business.church_id) {
        businessCounts[business.church_id] = (businessCounts[business.church_id] || 0) + 1;
      }
    });

    statusMessage.textContent = "";

    churchesSnapshot.forEach((doc) => {
      const data = doc.data();
      allChurches.push({
        id: doc.id,
        businessCount: businessCounts[doc.id] || 0,
        ...data
      });
    });
    
    allChurches.sort((a, b) => {
      const nameA = (a.church_name || a.name || '').toLowerCase();
      const nameB = (b.church_name || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    displayChurches(allChurches);

    searchButton.addEventListener("click", applyFilters);
    clearFiltersBtn.addEventListener("click", clearFilters);
    
    // Allow Enter key to trigger search from any input field
    [filterDenomination, filterState, filterCity, filterName].forEach(input => {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          applyFilters();
        }
      });
    });

  } catch (error) {
    console.error("🔥 Firebase error:", error);
    statusMessage.classList.add('status-message-error');
    statusMessage.innerHTML = `
      <strong>⚠️ Error loading churches</strong><br/>
      <span class="text-md">${error.message}</span><br/>
      <small class="color-ccc block">
        Check Firebase configuration or try refreshing the page.
      </small>
    `;
  }

  function applyFilters() {
    const filters = {
      denomination: filterDenomination.value.toLowerCase(),
      state: filterState.value.toUpperCase(),
      city: filterCity.value.toLowerCase().trim(),
      name: filterName.value.toLowerCase().trim()
    };

    const filtered = allChurches.filter(church => {
      if (filters.denomination && 
          (!church.denomination || church.denomination.toLowerCase() !== filters.denomination)) {
        return false;
      }

      if (filters.state && 
          (!church.state || church.state.toUpperCase() !== filters.state)) {
        return false;
      }

      if (filters.city && 
          (!church.city || !church.city.toLowerCase().includes(filters.city))) {
        return false;
      }

      if (filters.name) {
        const churchName = (church.church_name || church.name || "").toLowerCase();
        if (!churchName.includes(filters.name)) {
          return false;
        }
      }

      return true;
    });

    displayChurches(filtered);
  }

  function displayChurches(churches) {
    churchList.innerHTML = "";

    if (churches.length === 0) {
      churchList.innerHTML = `
        <div class="status-message empty">
          <p class="text-lg">No churches match your search criteria.</p>
          <p class="text-md">Try adjusting your filters or clearing them.</p>
        </div>
      `;
      resultCount.textContent = "0 churches found";
      return;
    }

    resultCount.textContent = `${churches.length} church${churches.length === 1 ? '' : 'es'} found`;

    churches.forEach((church) => {
      const churchId = church.id;
      const churchName = church.church_name || church.name;
      
      if (!churchName) {
        return;
      }

      const card = document.createElement("div");
      card.className = "card card-hover";

      const link = document.createElement("a");
      link.href = (church.slug && church.slug.trim()) ? `church.html?slug=${church.slug}` : `church.html?id=${churchId}`;
      link.className = "link-plain";

      const title = document.createElement("h2");
      title.className = "gold mb-sm";
      title.textContent = churchName;

      link.appendChild(title);

      if (church.city || church.state) {
        const location = document.createElement("p");
        const locationParts = [];
        if (church.city) locationParts.push(church.city);
        if (church.state) locationParts.push(church.state);
        location.textContent = locationParts.join(', ');
        location.className = "opacity-80 mb-sm";
        link.appendChild(location);
      }

      if (church.description) {
        const desc = document.createElement("p");
        desc.textContent = church.description.length > 150 
          ? church.description.substring(0, 150) + "..." 
          : church.description;
        desc.className = "text-description";
        link.appendChild(desc);
      }

      card.appendChild(link);

      // Add business count with link to filtered business directory
      if (church.businessCount > 0) {
        const businessLink = document.createElement("a");
        businessLink.href = `business_directory.html?church_id=${churchId}`;
        businessLink.className = "btn btn-small btn-gold mt-sm";
        businessLink.textContent = `💼 ${church.businessCount} Member Business${church.businessCount === 1 ? '' : 'es'}`;
        card.appendChild(businessLink);
      }

      churchList.appendChild(card);
    });
  }

  function clearFilters() {
    filterDenomination.value = "";
    filterState.value = "";
    filterCity.value = "";
    filterName.value = "";
    displayChurches(allChurches);
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

onReady(initChurchDirectory);
