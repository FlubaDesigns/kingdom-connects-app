import { fetchChurchTithes } from '../../js/services/church-tithes.js';
    import { db } from "../../js/firebase-config.js";
    import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { requireAuth } from "../../js/auth/access-control.js";
    import { isBusinessPro } from "../../js/role-utils.js";

    let churchId = null;
    let churchData = null;
    let monthlyProPrice = 8.99;

    requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
      console.log('🔐 Analytics: Auth verified, church:', churchContext?.id);
      
      const loadingMessage = document.getElementById('loadingMessage');
      const analyticsContent = document.getElementById('analyticsContent');
      
      if (!churchContext) {
        loadingMessage.textContent = 'No church found for your account.';
        loadingMessage.classList.add('text-error');
        return;
      }
      
      try {
        const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
        if (pricingDoc.exists()) {
          monthlyProPrice = parseFloat(pricingDoc.data().monthly_price) || 8.99;
        }
        
        churchId = churchContext.id;
        churchData = churchContext;

        await loadAnalytics();

        loadingMessage.classList.add('hidden');
        analyticsContent.classList.remove('hidden');

      } catch (error) {
        console.error('Error loading analytics:', error);
        loadingMessage.textContent = 'Error loading analytics: ' + error.message;
        loadingMessage.classList.add('text-error');
      }
    });

    async function loadAnalytics() {
      try {
        const q = query(collection(db, "business_listings_public"), where("church_id", "==", churchId));
        const querySnapshot = await getDocs(q);

        const totalBusinesses = querySnapshot.size;
        let proMembers = 0;
        let activeListings = 0;
        let pendingListings = 0;
        let totalTithe = 0;
        let thisMonthTithe = 0;
        const monthlyTithes = {};

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        querySnapshot.forEach((doc) => {
          const business = doc.data();
          
          // Use centralized Pro status check
          if (isBusinessPro(business)) {
            proMembers++;
          }

          if (business.listing_status === 'active') {
            activeListings++;
          } else if (business.listing_status === 'pending') {
            pendingListings++;
          }
        });

        const tithes = await fetchChurchTithes(churchId);
        totalTithe = tithes.total;
        thisMonthTithe = tithes.month;
        Object.assign(monthlyTithes, tithes.monthly);

        const monthCount = Object.keys(monthlyTithes).length || 1;
        const avgMonthlyTithe = totalTithe / monthCount;

        const parishionerCount = churchData.parishioner_count || 0;
        const estimatedBusinessOwners = Math.round(parishionerCount * 0.10);
        const penetrationRate = estimatedBusinessOwners > 0 ? ((totalBusinesses / estimatedBusinessOwners) * 100).toFixed(1) : 0;
        const proAdoptionRate = totalBusinesses > 0 ? ((proMembers / totalBusinesses) * 100).toFixed(1) : 0;

        document.getElementById('totalTithe').textContent = '$' + totalTithe.toFixed(2);
        document.getElementById('thisMonthTithe').textContent = '$' + thisMonthTithe.toFixed(2);
        document.getElementById('proMembers').textContent = proMembers;
        document.getElementById('avgMonthlyTithe').textContent = '$' + avgMonthlyTithe.toFixed(2);

        document.getElementById('parishionerCount').textContent = parishionerCount.toLocaleString();
        document.getElementById('totalBusinesses').textContent = totalBusinesses;
        document.getElementById('penetrationRate').textContent = penetrationRate + '%';
        document.getElementById('proAdoptionRate').textContent = proAdoptionRate + '%';

        document.getElementById('activeListings').textContent = activeListings;
        document.getElementById('pendingListings').textContent = pendingListings;
        document.getElementById('proListings').textContent = proMembers;
        document.getElementById('freeListings').textContent = (totalBusinesses - proMembers);

        const freeMembers = totalBusinesses - proMembers;
        const potentialMonthly = freeMembers * monthlyProPrice * 0.10;
        const potentialYearly = potentialMonthly * 12;

        document.getElementById('potentialBusinessCount').textContent = freeMembers;
        document.getElementById('potentialMonthly').textContent = '$' + potentialMonthly.toFixed(2);
        document.getElementById('potentialYearly').textContent = '$' + potentialYearly.toFixed(2);
        
        const priceExplainer = document.getElementById('priceExplainer');
        if (priceExplainer) {
          priceExplainer.textContent = `Based on Pro subscription of $${monthlyProPrice.toFixed(2)}/month × 10% tithe rate`;
        }

        generateRecommendations(totalBusinesses, proMembers, penetrationRate, parishionerCount);

      } catch (error) {
        console.error('Error loading analytics:', error);
        throw error;
      }
    }

    function generateRecommendations(totalBusinesses, proMembers, penetrationRate, parishionerCount) {
      const recommendations = [];

      if (totalBusinesses === 0) {
        recommendations.push('📢 <strong>Get Started:</strong> Share Kingdom Connects with your congregation! Announce it during services and in church bulletins.');
      } else if (totalBusinesses < 5) {
        recommendations.push('📢 <strong>Build Momentum:</strong> You have a few businesses listed. Personally invite more business owners in your congregation.');
      }

      if (parseFloat(penetrationRate) < 50 && parishionerCount > 0) {
        recommendations.push('🎯 <strong>Increase Reach:</strong> Only ' + penetrationRate + '% of potential business owners are listed. Host a "Business Sunday" to promote the platform.');
      }

      const freeMembers = totalBusinesses - proMembers;
      if (freeMembers > 0) {
        recommendations.push('💰 <strong>Encourage Pro Upgrades:</strong> You have ' + freeMembers + ' free-tier businesses. Highlight Pro benefits to boost church revenue.');
      }

      if (proMembers > 0 && proMembers < totalBusinesses * 0.5) {
        recommendations.push('⭐ <strong>Showcase Success:</strong> Feature Pro members prominently to demonstrate the value of upgrading.');
      }

      if (recommendations.length === 0) {
        recommendations.push('✅ <strong>Great Work!</strong> Your church has strong Kingdom Connects participation. Keep encouraging engagement!');
      }

      const recommendationsDiv = document.getElementById('recommendations');
      recommendationsDiv.innerHTML = '<ul>' + recommendations.map(r => `<li class="m-block-sm">${r}</li>`).join('') + '</ul>';
    }

    function setupParishionerEdit() {
      const editBtn = document.getElementById('editParishionerBtn');
      const countDisplay = document.getElementById('parishionerCount');
      const editContainer = document.getElementById('parishionerEditContainer');
      const input = document.getElementById('parishionerInput');
      const saveBtn = document.getElementById('saveParishionerBtn');
      const cancelBtn = document.getElementById('cancelParishionerBtn');

      if (!editBtn) return;

      editBtn.addEventListener('click', () => {
        const currentCount = parseInt(countDisplay.textContent.replace(/,/g, '')) || 0;
        input.value = currentCount;
        countDisplay.classList.add('hidden');
        editBtn.classList.add('hidden');
        editContainer.classList.remove('hidden');
        editContainer.style.display = 'inline-flex';
        input.focus();
        input.select();
      });

      cancelBtn.addEventListener('click', () => {
        editContainer.classList.add('hidden');
        editContainer.style.display = 'none';
        countDisplay.classList.remove('hidden');
        editBtn.classList.remove('hidden');
      });

      saveBtn.addEventListener('click', saveParishionerCount);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveParishionerCount();
        if (e.key === 'Escape') cancelBtn.click();
      });

      async function saveParishionerCount() {
        const newCount = parseInt(input.value) || 0;
        if (newCount < 0) {
          alert('Please enter a valid number');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
          await updateDoc(doc(db, 'churches', churchId), {
            parishioner_count: newCount
          });

          churchData.parishioner_count = newCount;
          countDisplay.textContent = newCount.toLocaleString();
          
          editContainer.classList.add('hidden');
          editContainer.style.display = 'none';
          countDisplay.classList.remove('hidden');
          editBtn.classList.remove('hidden');

          await loadAnalytics();

        } catch (error) {
          console.error('Error saving parishioner count:', error);
          alert('Failed to save: ' + error.message);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      }
    }

    document.addEventListener('DOMContentLoaded', setupParishionerEdit);
