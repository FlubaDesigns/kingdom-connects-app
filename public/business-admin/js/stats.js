import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import analytics from "../../js/services/analytics-service.js";
import { isBusinessPro } from "../../js/role-utils.js";

let businessId = null;
let currentBusiness = null;

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  initPage(businessContext);
});

async function initPage(businesses) {
  const loadingMessage = document.getElementById('loadingMessage');
  const noBusinessMessage = document.getElementById('noBusinessMessage');
  const statsContent = document.getElementById('statsContent');

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
      loadingMessage.classList.add('hidden');
      noBusinessMessage.classList.remove('hidden');
      return;
    }

    businessId = activeBusiness.id;
    currentBusiness = activeBusiness;

    await loadStats();

    loadingMessage.classList.add('hidden');
    statsContent.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading business:', error);
    loadingMessage.textContent = 'Error loading business: ' + error.message;
    loadingMessage.classList.add('error-text');
  }
}

    async function loadStats() {
      const business = currentBusiness;
      const isPro = isBusinessPro(business);

      document.getElementById('totalViews').textContent = business.total_views || 0;
      document.getElementById('averageRating').textContent = business.average_rating ? business.average_rating.toFixed(1) : '0.0';
      
      const reviewCount = await getReviewCount(businessId);
      document.getElementById('reviewCount').textContent = reviewCount;

      const photoCount = business.photos && Array.isArray(business.photos) ? business.photos.length : 0;
      document.getElementById('photoCount').textContent = photoCount;

      const statusMap = {
        'active': '✅ Active',
        'pending': '⏳ Pending Approval',
        'suspended': '⛔ Suspended'
      };
      document.getElementById('listingStatus').textContent = statusMap[business.listing_status] || business.listing_status || 'Unknown';
      document.getElementById('membershipTier').textContent = isPro ? '⭐ Pro Member' : '🆓 Free Tier';
      
      const primaryCategoryLabel = await getCategoryLabel(business.primary_category);
      document.getElementById('primaryCategory').textContent = primaryCategoryLabel || business.primary_category || 'Not set';

      if (business.created_at) {
        const createdDate = business.created_at.toDate ? business.created_at.toDate() : new Date(business.created_at);
        document.getElementById('memberSince').textContent = createdDate.toLocaleDateString();
      } else {
        document.getElementById('memberSince').textContent = 'Unknown';
      }

      if (business.church_id) {
        const churchName = await getChurchName(business.church_id);
        document.getElementById('churchAffiliation').textContent = churchName;
      } else {
        document.getElementById('churchAffiliation').textContent = 'None';
      }

      if (business.categories && Array.isArray(business.categories) && business.categories.length > 0) {
        const categoryLabels = await Promise.all(
          business.categories.map(slug => getCategoryLabel(slug))
        );
        document.getElementById('secondaryCategories').textContent = categoryLabels.filter(Boolean).join(', ');
      } else {
        document.getElementById('secondaryCategories').textContent = 'None';
      }
      
      const locationParts = [business.city, business.state].filter(Boolean);
      document.getElementById('businessLocation').textContent = locationParts.length > 0 ? locationParts.join(', ') : 'Not set';
      document.getElementById('websiteListed').textContent = business.website ? 'Yes' : 'No';

      if (isPro) {
        document.getElementById('proPromo').classList.add('hidden');
        document.getElementById('proStats').classList.remove('hidden');
        
        await loadProAnalytics(businessId, 30);
        
        const dateSelect = document.getElementById('dateRangeSelect');
        if (dateSelect) {
          dateSelect.addEventListener('change', async (e) => {
            const days = parseInt(e.target.value, 10);
            await loadProAnalytics(businessId, days);
          });
        }
      } else {
        document.getElementById('proPromo').classList.remove('hidden');
        document.getElementById('proStats').classList.add('hidden');
      }

      generateOptimizationTips(business, reviewCount, photoCount, isPro);
    }

    async function getReviewCount(businessId) {
      try {
        const q = query(collection(db, "reviews"), where("business_id", "==", businessId));
        const querySnapshot = await getDocs(q);
        return querySnapshot.size;
      } catch (error) {
        console.error('Error counting reviews:', error);
        return 0;
      }
    }

    async function getChurchName(churchId) {
      try {
        const docSnap = await getDoc(doc(db, "churches", churchId));
        if (docSnap.exists()) {
          return docSnap.data().church_name || 'Unknown Church';
        }
        return 'Unknown Church';
      } catch (error) {
        console.error('Error loading church:', error);
        return 'Unknown Church';
      }
    }

    async function getCategoryLabel(slug) {
      if (!slug) return null;
      try {
        const q = query(collection(db, "categories"), where("slug", "==", slug));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          return querySnapshot.docs[0].data().label;
        }
        return slug;
      } catch (error) {
        console.error('Error loading category:', error);
        return slug;
      }
    }

    function generateOptimizationTips(business, reviewCount, photoCount, isPro) {
      const tips = [];

      if (!business.description || business.description.length < 50) {
        tips.push('📝 <strong>Add a detailed description</strong> - Listings with detailed descriptions get 3x more views');
      }

      if (photoCount === 0 && isPro) {
        tips.push('📸 <strong>Add photos to your listing</strong> - Listings with photos get 5x more engagement');
      }

      if (photoCount > 0 && photoCount < 5 && isPro) {
        tips.push(`📸 <strong>Add more photos</strong> - You have ${photoCount}/10 photos. More photos = more trust`);
      }

      if (reviewCount === 0) {
        tips.push('⭐ <strong>Ask satisfied customers for reviews</strong> - Reviews build credibility and trust');
      }

      if (!business.website) {
        tips.push('🌐 <strong>Add your website URL</strong> - Direct customers to learn more about your business');
      }

      if (!business.church_id) {
        tips.push('⛪ <strong>Connect with your church</strong> - Support your church through our 10% tithing program');
      }

      if (!business.hours_of_operation || Object.keys(business.hours_of_operation).length === 0) {
        tips.push('🕐 <strong>Add business hours</strong> - Customers want to know when you\'re open');
      }

      const secondaryCount = business.categories && Array.isArray(business.categories) ? business.categories.length : 0;
      if (secondaryCount === 0) {
        tips.push('🏷️ <strong>Add subcategories</strong> - Increase your visibility in searches');
      }

      if (secondaryCount > 0 && secondaryCount < 3 && isPro) {
        tips.push(`🏷️ <strong>Add more subcategories</strong> - Pro members can add up to 3 (you have ${secondaryCount})`);
      }

      if (!isPro) {
        tips.push('⭐ <strong>Consider upgrading to Pro</strong> - Pro members get 10x more visibility');
      }

      const tipsContainer = document.getElementById('optimizationTips');
      if (tips.length === 0) {
        tipsContainer.innerHTML = '<p class="text-center">✅ Your listing is fully optimized! Great job!</p>';
      } else {
        tipsContainer.innerHTML = '<ul>' + tips.map(tip => `<li class="m-block-sm">${tip}</li>`).join('') + '</ul>';
      }
    }

    async function loadProAnalytics(businessId, days) {
      try {
        document.getElementById('clickThroughRate').textContent = '...';
        document.getElementById('searchImpressions').textContent = '...';
        document.getElementById('websiteClicks').textContent = '...';
        document.getElementById('phoneClicks').textContent = '...';

        const analyticsData = await analytics.getBusinessAnalytics(businessId, days);
        
        if (analyticsData) {
          document.getElementById('clickThroughRate').textContent = analyticsData.ctr + '%';
          document.getElementById('searchImpressions').textContent = analyticsData.impressions;
          document.getElementById('websiteClicks').textContent = analyticsData.website_clicks;
          document.getElementById('phoneClicks').textContent = analyticsData.phone_clicks;
        } else {
          document.getElementById('clickThroughRate').textContent = '0%';
          document.getElementById('searchImpressions').textContent = '0';
          document.getElementById('websiteClicks').textContent = '0';
          document.getElementById('phoneClicks').textContent = '0';
        }
      } catch (error) {
        console.error('Error loading pro analytics:', error);
        document.getElementById('clickThroughRate').textContent = '-';
        document.getElementById('searchImpressions').textContent = '-';
        document.getElementById('websiteClicks').textContent = '-';
        document.getElementById('phoneClicks').textContent = '-';
      }
    }
