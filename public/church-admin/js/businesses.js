import { changeHierarchy } from '../../js/services/hierarchy-service.js';
    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAuth } from "../../js/auth/access-control.js";
    import { sendTemplate } from "../../js/email/email-service.js";
    import { isBusinessPro } from "../../js/role-utils.js";

    let churchId = null;
    let churchData = null;
    let allBusinesses = [];

    requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
      console.log('🔐 Businesses: Auth verified, church:', churchContext?.id);
      
      const loadingMessage = document.getElementById('loadingMessage');
      const contentArea = document.getElementById('contentArea');
      
      if (!churchContext) {
        loadingMessage.classList.add('hidden');
        contentArea.classList.remove('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        return;
      }

      try {
        churchId = churchContext.id;
        churchData = churchContext;

        const churchSlug = churchData.slug || generateSlug(churchData.church_name);
        const shareUrl = `${window.location.host}/church?slug=${churchSlug}`;
        document.getElementById('shareLink').textContent = shareUrl;

        await loadBusinesses();

        loadingMessage.classList.add('hidden');
        contentArea.classList.remove('hidden');

      } catch (error) {
        console.error('Error loading businesses:', error);
        loadingMessage.textContent = 'Error loading data: ' + error.message;
        loadingMessage.classList.add('text-error');
      }
    });

    async function loadBusinesses() {
      try {
        const q = query(collection(db, "business_listings_public"), where("church_id", "==", churchId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.size === 0) {
          document.getElementById('emptyState').classList.remove('hidden');
          return;
        }

        const businessList = document.getElementById('businessList');
        businessList.innerHTML = '';

        allBusinesses = [];
        querySnapshot.forEach((doc) => {
          allBusinesses.push({ id: doc.id, ...doc.data() });
        });

        renderBusinesses();

      } catch (error) {
        console.error('Error loading businesses:', error);
        document.getElementById('emptyState').innerHTML = '<p class="error">Error loading businesses: ' + error.message + '</p>';
        document.getElementById('emptyState').classList.remove('hidden');
      }
    }

    function renderBusinesses() {
      const businessList = document.getElementById('businessList');
      businessList.innerHTML = '';

      // Sort: Featured first, then chronological (first in = first shown)
      allBusinesses.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        
        // CHRONOLOGICAL SORTING: First in = highest order (oldest first)
        const aTime = a.created_at?.seconds || 0;
        const bTime = b.created_at?.seconds || 0;
        return aTime - bTime;
        
        // COMMENTED OUT: Pro placement sorting (Pro features still functional, just no placement priority)
        // const aIsPro = a.pro_status === true || a.pro_status === "pro";
        // const bIsPro = b.pro_status === true || b.pro_status === "pro";
        // if (aIsPro && !bIsPro) return -1;
        // if (!aIsPro && bIsPro) return 1;
        // return (a.business_name || '').localeCompare(b.business_name || '');
      });

      const featuredCount = allBusinesses.filter(b => b.is_featured === true).length;

      allBusinesses.forEach((business) => {
          const item = document.createElement('div');
          item.className = 'business-item';

          const isPro = isBusinessPro(business);
          const isFeatured = business.is_featured === true;
          const proBadge = isPro ? '<span class="pro-badge">PRO</span>' : '';
          const featuredBadge = isFeatured ? '<span class="featured-badge">FEATURED</span>' : '';

          const rating = business.average_rating || 0;
          const stars = rating > 0 ? '⭐'.repeat(Math.round(rating)) : 'No reviews yet';

          const statusMap = {
            'active': '✅ Active',
            'pending': '⏳ Pending',
            'suspended': '⛔ Suspended'
          };
          const status = statusMap[business.listing_status] || business.listing_status || 'Unknown';

          const locationParts = [];
          if (business.city) locationParts.push(business.city);
          if (business.state) locationParts.push(business.state);
          const location = locationParts.length > 0 ? locationParts.join(', ') : 'Location not set';

          item.innerHTML = `
            <div class="flex-between-center">
              <h4 class="gold m-0">${escapeHtml(business.business_name || 'Unnamed Business')}${proBadge}${featuredBadge}</h4>
              <span>${status}</span>
            </div>
            <p class="text-sm opacity-70 mt-sm">${escapeHtml(business.primary_category || 'Uncategorized')} • ${location}</p>
            <p class="mt-sm">${escapeHtml(business.description || 'No description').substring(0, 150)}${business.description && business.description.length > 150 ? '...' : ''}</p>
            <div class="flex-between-center mt-sm">
              <div>
                <span class="gold">${stars}</span>
                ${rating > 0 ? `<span class="opacity-70 text-sm ml-sm">${rating.toFixed(1)}</span>` : ''}
              </div>
              <div>
                <span class="opacity-70 text-sm">Owner: ${escapeHtml(business.owner_name || 'N/A')}</span>
              </div>
            </div>
            ${business.phone || business.email ? `
              <div class="mt-sm text-sm opacity-80">
                ${business.phone ? `📞 ${escapeHtml(business.phone)}` : ''}
                ${business.phone && business.email ? ' • ' : ''}
                ${business.email ? `✉️ ${escapeHtml(business.email)}` : ''}
              </div>
            ` : ''}
          `;

          // Button container
          const btnContainer = document.createElement('div');
          btnContainer.className = 'flex-gap mt-md';
          
          // Add Feature/Unfeature button
          const featureBtn = document.createElement('button');
          featureBtn.className = 'btn btn-small';
          
          if (isFeatured) {
            featureBtn.textContent = 'Remove from Featured';
            featureBtn.classList.add('btn-danger');
            featureBtn.onclick = () => toggleFeature(business.id, false);
          } else {
            featureBtn.textContent = '⭐ Feature This Business';
            featureBtn.classList.add('btn-gold');
            featureBtn.onclick = () => {
              if (featuredCount >= 5) {
                window.showToast('You can only feature up to 5 businesses. Please remove one first.', 'info');
                return;
              }
              toggleFeature(business.id, true);
            };
          }

          btnContainer.appendChild(featureBtn);
          const statusBtn = document.createElement('button');
          statusBtn.className = 'btn btn-small btn-gold';
          const decision = business.church_suspended ? 'activate' : business.church_approved ? 'suspend' : 'approve';
          statusBtn.textContent = decision === 'activate' ? 'Reactivate' : decision === 'suspend' ? 'Suspend' : 'Approve';
          statusBtn.onclick = async () => {
            try { await changeHierarchy('reviewBusiness', { businessId: business.id, decision }); await loadBusinesses(); }
            catch (error) { window.showToast(error.message, 'error'); }
          };
          btnContainer.appendChild(statusBtn);
          
          // Add Remove Business button
          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn btn-small btn-danger';
          removeBtn.textContent = 'Remove from Church';
          removeBtn.onclick = () => removeBusiness(business.id, business.business_name);
          
          btnContainer.appendChild(removeBtn);
          item.appendChild(btnContainer);
          businessList.appendChild(item);
        });
    }

    async function toggleFeature(businessId, isFeatured) {
      try {
        await changeHierarchy('featureBusiness', { businessId, featured: isFeatured });

        const business = allBusinesses.find(b => b.id === businessId);
        if (business) {
          business.is_featured = isFeatured;
        }

        renderBusinesses();

        const action = isFeatured ? 'featured' : 'removed from featured';
        window.showToast(`Business ${action}!`, 'success');

      } catch (error) {
        console.error('Error updating feature status:', error);
        window.showToast('Error updating business: ' + error.message, 'error');
      }
    }

    async function removeBusiness(businessId, businessName) {
      const confirmed = confirm(
        `⚠️ Remove ${businessName} from your church?\n\n` +
        `This will:\n` +
        `• Remove them from your church directory\n` +
        `• Pause their listing and store until a new church approves affiliation\n` +
        `• They can request to join a different church\n` +
        `• They will be notified of this change\n\n` +
        `Click OK to remove, or Cancel to keep them affiliated.`
      );
      
      if (!confirmed) return;
      
      try {
        const business = allBusinesses.find(b => b.id === businessId);
        const businessEmail = business?.email;
        
        await changeHierarchy('removeBusiness', { businessId });

        if (businessEmail) {
          try {
            await sendTemplate('business_unchurched_by_church', businessEmail, {
              business_name: businessName,
              church_name: churchData.church_name
            });
          } catch (emailError) {
            console.error('Email sending failed (non-fatal):', emailError);
          }
        }

        // Remove from local array and re-render
        allBusinesses = allBusinesses.filter(b => b.id !== businessId);
        renderBusinesses();

        if (allBusinesses.length === 0) {
          document.getElementById('emptyState').classList.remove('hidden');
        }

        window.showToast(`${businessName} has been removed from your church.`, 'success');

      } catch (error) {
        console.error('Error removing business:', error);
        window.showToast('Error removing business: ' + error.message, 'error');
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Generate slug from church name
    function generateSlug(churchName) {
      if (!churchName) return 'your-church';
      return churchName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }

