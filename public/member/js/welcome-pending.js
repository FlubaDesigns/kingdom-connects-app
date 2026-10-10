import { db } from '../../js/firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireMember } from '../../js/auth/access-control.js';

requireMember((userContext, firebaseUser) => {
  loadPendingStatus(firebaseUser);
}, { allowPending: true });

async function loadPendingStatus(user) {
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (!userDoc.exists()) {
      document.getElementById('loadingMessage').classList.add('hidden');
      document.getElementById('errorMessage').classList.remove('hidden');
      return;
    }

    const userData = userDoc.data();
    const userName = userData.name || user.email.split('@')[0];
    
    document.getElementById('userName').textContent = userName;

    const churchMembershipStatus = userData.church_membership_status || 'pending';
    const accountStatus = userData.account_status || 'pending';

    if (churchMembershipStatus === 'approved' && accountStatus === 'active') {
      document.getElementById('loadingMessage').classList.add('hidden');
      document.getElementById('contentArea').classList.remove('hidden');
      document.getElementById('contentArea').querySelector('article').classList.add('hidden');
      document.getElementById('contentArea').querySelector('article:nth-child(2)').classList.add('hidden');
      document.getElementById('contentArea').querySelector('article:nth-child(3)').classList.add('hidden');
      document.getElementById('alreadyApproved').classList.remove('hidden');
      return;
    }

    if (userData.home_church_id) {
      const churchDoc = await getDoc(doc(db, 'churches', userData.home_church_id));
      if (churchDoc.exists()) {
        const churchData = churchDoc.data();
        document.getElementById('churchName').textContent = churchData.church_name || churchData.name || 'Your Church';
        document.getElementById('churchInfo').classList.remove('hidden');
        document.getElementById('pendingMessage').textContent = 
          'Your membership request has been sent to your church for approval. You\'ll receive an email once approved.';
        const findChurchesBtn = document.getElementById('findChurchesBtn');
        if (findChurchesBtn) findChurchesBtn.classList.add('hidden');
      }
    } else {
      document.getElementById('pendingMessage').textContent = 
        'Your account is being reviewed by our team. You\'ll receive an email once approved.';
    }

    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('contentArea').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading pending status:', error);
    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.remove('hidden');
  }
}
