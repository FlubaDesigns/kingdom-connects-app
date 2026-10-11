import { adminReady } from './admin-auth-guard.js';
await adminReady;
import { db, auth } from '../../js/firebase-config.js';
import { collection, addDoc, getDocs, getDoc, query, where, orderBy, serverTimestamp, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { sendCustomEmail } from '../../js/email/email-service.js';
import { isBusinessPro } from '../../js/role-utils.js';
import { showToast, showConfirmDialog, showSuccessAnimation, escapeHtml } from '../../js/utils.js';

let platformSettings = {
  monthly_price: 9,
  annual_price: 69.99,
  agent_commission: 20,
  director_commission: 15,
  church_tithe: 10,
  origination_fee: 20
};

async function loadPlatformSettings() {
  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    if (pricingDoc.exists()) {
      const pricing = pricingDoc.data();
      platformSettings.monthly_price = pricing.monthly_price ?? 9;
      platformSettings.annual_price = pricing.annual_price ?? 69.99;
    }

    const commissionDoc = await getDoc(doc(db, 'commission_policies', 'default'));
    if (commissionDoc.exists()) {
      const data = commissionDoc.data();
      platformSettings.agent_commission = data.salesperson_percentage ?? 20;
      platformSettings.director_commission = data.sales_director_percentage ?? 15;
      platformSettings.church_tithe = data.church_percentage ?? 10;
      platformSettings.origination_fee = data.origination_fee ?? 20;
    }
  } catch (error) {
    console.error('Error loading platform settings:', error);
  }
}

const newCampaignBtn = document.getElementById('newCampaignBtn');
const newCampaignModal = document.getElementById('newCampaignModal');
const closeCampaignModal = document.getElementById('closeCampaignModal');
const cancelCampaign = document.getElementById('cancelCampaign');
const campaignForm = document.getElementById('campaignForm');
const campaignList = document.getElementById('campaignList');
const sendNowBtn = document.getElementById('sendNowBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');

newCampaignBtn.addEventListener('click', () => {
  newCampaignModal.classList.add('active');
  loadSegmentCounts();
});

closeCampaignModal.addEventListener('click', closeModal);
cancelCampaign.addEventListener('click', closeModal);

function closeModal() {
  newCampaignModal.classList.remove('active');
  campaignForm.reset();
}

document.querySelectorAll('.segment-option').forEach(option => {
  option.addEventListener('click', function(e) {
    if (e.target.type !== 'checkbox') {
      const checkbox = this.querySelector('input[type="checkbox"]');
      checkbox.checked = !checkbox.checked;
    }
    this.classList.toggle('selected', this.querySelector('input').checked);
  });
});

async function loadSegmentCounts() {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const businessesSnap = await getDocs(collection(db, 'business_listings_public'));
    const churchesSnap = await getDocs(collection(db, 'churches'));

    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const businesses = businessesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newSignups = users.filter(u => {
      const created = u.created_at?.toDate ? u.created_at.toDate() : new Date(u.created_at);
      return created > thirtyDaysAgo;
    }).length;

    const proLapsed = businesses.filter(b => 
      !isBusinessPro(b) && b.was_pro === true
    ).length;

    const activeBusinesses = businesses.filter(b => 
      b.listing_status === 'active'
    ).length;

    document.getElementById('count-new-signups').textContent = `${newSignups} recipients`;
    document.getElementById('count-pro-lapsed').textContent = `${proLapsed} recipients`;
    document.getElementById('count-active-businesses').textContent = `${activeBusinesses} recipients`;
    document.getElementById('count-churches').textContent = `${churchesSnap.size} recipients`;

  } catch (error) {
    console.error('Error loading segment counts:', error);
  }
}

async function getRecipients(segments) {
  const recipients = [];
  
  const usersSnap = await getDocs(collection(db, 'users'));
  const businessesSnap = await getDocs(collection(db, 'business_listings_public'));
  const churchesSnap = await getDocs(collection(db, 'churches'));
  
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const businesses = businessesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const churches = churchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  if (segments.includes('new_signups')) {
    users.forEach(u => {
      const created = u.created_at?.toDate ? u.created_at.toDate() : new Date(u.created_at);
      if (created > thirtyDaysAgo && u.email) {
        recipients.push({
          email: u.email,
          name: u.display_name || u.email.split('@')[0],
          type: 'user'
        });
      }
    });
  }
  
  if (segments.includes('pro_lapsed')) {
    businesses.forEach(b => {
      if (!isBusinessPro(b) && b.was_pro === true) {
        const email = b.email || b.contact_email;
        if (email) {
          recipients.push({
            email: email,
            name: b.business_name || email.split('@')[0],
            business_name: b.business_name,
            type: 'business'
          });
        }
      }
    });
  }
  
  if (segments.includes('active_businesses')) {
    businesses.forEach(b => {
      if (b.listing_status === 'active') {
        const email = b.email || b.contact_email;
        if (email) {
          recipients.push({
            email: email,
            name: b.business_name || email.split('@')[0],
            business_name: b.business_name,
            type: 'business'
          });
        }
      }
    });
  }
  
  if (segments.includes('churches')) {
    churches.forEach(c => {
      const email = c.email || c.contact_email;
      if (email) {
        recipients.push({
          email: email,
          name: c.name || c.church_name || email.split('@')[0],
          church_name: c.name || c.church_name,
          type: 'church'
        });
      }
    });
  }
  
  const uniqueRecipients = [];
  const seen = new Set();
  recipients.forEach(r => {
    if (!seen.has(r.email)) {
      seen.add(r.email);
      uniqueRecipients.push(r);
    }
  });
  
  return uniqueRecipients;
}

const manualLinks = {
  sales: 'https://kingdomconnects.org/sales/user-manual.html',
  business: 'https://kingdomconnects.org/business-admin/user-manual.html',
  church: 'https://kingdomconnects.org/church-admin/user-manual.html',
  member: 'https://kingdomconnects.org/member/user-manual.html',
  marketing: 'https://kingdomconnects.org/marketing/user-manual.html'
};

function replaceVariables(text, recipient) {
  let contextualManualLink = manualLinks.sales;
  if (recipient.type === 'business') {
    contextualManualLink = manualLinks.business;
  } else if (recipient.type === 'church') {
    contextualManualLink = manualLinks.church;
  } else if (recipient.type === 'user') {
    contextualManualLink = manualLinks.member;
  }

  return text
    .replace(/\{\{name\}\}/g, recipient.name || '')
    .replace(/\{\{business_name\}\}/g, recipient.business_name || '')
    .replace(/\{\{church_name\}\}/g, recipient.church_name || '')
    .replace(/\{\{email\}\}/g, recipient.email || '')
    .replace(/\{\{monthly_price\}\}/g, '$' + platformSettings.monthly_price)
    .replace(/\{\{annual_price\}\}/g, '$' + platformSettings.annual_price)
    .replace(/\{\{agent_commission\}\}/g, platformSettings.agent_commission + '%')
    .replace(/\{\{director_commission\}\}/g, platformSettings.director_commission + '%')
    .replace(/\{\{church_tithe\}\}/g, platformSettings.church_tithe + '%')
    .replace(/\{\{origination_fee\}\}/g, '$' + platformSettings.origination_fee)
    .replace(/\{\{manual_link\}\}/g, contextualManualLink)
    .replace(/\{\{sales_manual_link\}\}/g, manualLinks.sales)
    .replace(/\{\{business_manual_link\}\}/g, manualLinks.business)
    .replace(/\{\{church_manual_link\}\}/g, manualLinks.church)
    .replace(/\{\{member_manual_link\}\}/g, manualLinks.member)
    .replace(/\{\{marketing_manual_link\}\}/g, manualLinks.marketing);
}

async function sendCampaign(campaignData) {
  const user = auth.currentUser;
  if (!user) {
    showToast('Please log in first.', 'error');
    return { success: false, sent: 0 };
  }
  
  await loadPlatformSettings();
  
  const recipients = await getRecipients(campaignData.segments);
  
  if (recipients.length === 0) {
    showToast('No recipients found for selected segments.', 'error');
    return { success: false, sent: 0 };
  }
  
  let sentCount = 0;
  let errors = 0;
  
  for (const recipient of recipients) {
    const personalizedBody = replaceVariables(campaignData.body, recipient);
    const personalizedSubject = replaceVariables(campaignData.subject, recipient);
    
    try {
      await sendCustomEmail(recipient.email, personalizedSubject, personalizedBody.replace(/\n/g, '<br>'));
      sentCount++;
    } catch (error) {
      errors++;
      console.error(`Error sending to ${recipient.email}:`, error);
    }
  }
  
  return { success: true, sent: sentCount, errors, total: recipients.length };
}

saveDraftBtn.addEventListener('click', async () => {
  const selectedSegments = Array.from(document.querySelectorAll('input[name="segment"]:checked'))
    .map(cb => cb.value);

  if (selectedSegments.length === 0) {
    showToast('Please select at least one audience segment.', 'info');
    return;
  }

  const campaignData = {
    name: document.getElementById('campaignName').value.trim(),
    subject: document.getElementById('emailSubject').value.trim(),
    body: document.getElementById('emailBody').value.trim(),
    template: document.getElementById('emailTemplate').value,
    segments: selectedSegments,
    status: 'draft',
    created_at: serverTimestamp(),
    sent_count: 0
  };

  try {
    await addDoc(collection(db, 'email_campaigns'), campaignData);
    showToast('Campaign saved as draft!', 'success');
    closeModal();
    loadCampaigns();
  } catch (error) {
    console.error('Error saving draft:', error);
    showToast('Failed to save draft.', 'error');
  }
});

campaignForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedSegments = Array.from(document.querySelectorAll('input[name="segment"]:checked'))
    .map(cb => cb.value);

  if (selectedSegments.length === 0) {
    showToast('Please select at least one audience segment.', 'info');
    return;
  }

  const campaignData = {
    name: document.getElementById('campaignName').value.trim(),
    subject: document.getElementById('emailSubject').value.trim(),
    body: document.getElementById('emailBody').value.trim(),
    template: document.getElementById('emailTemplate').value,
    segments: selectedSegments
  };

  if (!campaignData.name || !campaignData.subject || !campaignData.body) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  sendNowBtn.disabled = true;
  sendNowBtn.textContent = 'Sending...';

  try {
    const result = await sendCampaign(campaignData);
    
    if (result.success) {
      await addDoc(collection(db, 'email_campaigns'), {
        ...campaignData,
        status: 'sent',
        sent_at: serverTimestamp(),
        created_at: serverTimestamp(),
        sent_count: result.sent,
        error_count: result.errors || 0
      });
      
      showToast(`Campaign sent! ${result.sent} of ${result.total} emails delivered.`, 'success');
      closeModal();
      loadCampaigns();
    }
  } catch (error) {
    console.error('Error sending campaign:', error);
    showToast('Failed to send campaign. Please try again.', 'error');
  } finally {
    sendNowBtn.disabled = false;
    sendNowBtn.textContent = 'Send Now';
  }
});

async function loadCampaigns() {
  try {
    const q = query(collection(db, 'email_campaigns'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      campaignList.innerHTML = '<p class="text-muted">No campaigns yet. Create your first one!</p>';
      return;
    }

    campaignList.innerHTML = '';
    snapshot.forEach(docSnap => {
      const campaign = docSnap.data();

      const card = document.createElement('div');
      card.className = 'campaign-card';
      card.innerHTML = `
        <div class="campaign-header">
          <div>
            <h3>${campaign.name}</h3>
            <p class="text-sm text-muted">${campaign.segments.join(', ')}</p>
          </div>
          <span class="status-badge status-${campaign.status}">${campaign.status.toUpperCase()}</span>
        </div>
        <p class="text-sm"><strong>Subject:</strong> ${campaign.subject}</p>
        ${campaign.status === 'sent' ? `
          <div class="campaign-stats">
            <div class="stat-item">
              <div class="stat-value">${campaign.sent_count || 0}</div>
              <div class="stat-label">Sent</div>
            </div>
            ${campaign.error_count ? `
              <div class="stat-item">
                <div class="stat-value text-red">${campaign.error_count}</div>
                <div class="stat-label">Errors</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      `;
      campaignList.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading campaigns:', error);
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    this.classList.add('active');
    document.getElementById(this.dataset.tab + '-tab').classList.add('active');
  });
});

loadCampaigns();
