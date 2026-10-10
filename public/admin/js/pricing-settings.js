    import { db } from '../../js/firebase-config.js';
    import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

    const messageDiv = document.getElementById('message');
    const monthlyInput = document.getElementById('monthlyPrice');
    const annualInput = document.getElementById('annualPrice');
    const trialInput = document.getElementById('freeTrialDays');

    async function loadPricingSettings() {
      try {
        const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
        
        if (pricingDoc.exists()) {
          const data = pricingDoc.data();
          monthlyInput.value = data.monthly_price ?? 8.99;
          annualInput.value = data.annual_price ?? 74.99;
          trialInput.value = data.free_trial_days ?? 30;
        }
        
        updatePreview();
      } catch (error) {
        console.error('Error loading pricing settings:', error);
        showMessage('Error loading settings: ' + error.message, 'error');
      }
    }

    function updatePreview() {
      const monthly = parseFloat(monthlyInput.value) || 0;
      const annual = parseFloat(annualInput.value) || 0;
      const trial = parseInt(trialInput.value) || 0;
      
      document.getElementById('previewMonthly').textContent = `$${monthly.toFixed(2)}`;
      document.getElementById('previewAnnual').textContent = `$${annual.toFixed(2)}`;
      document.getElementById('previewTrial').textContent = `${trial}-day`;
      document.getElementById('trialDaysInfo').textContent = trial;
      
      const annualIfMonthly = monthly * 12;
      const savings = annualIfMonthly - annual;
      const savingsPercent = annualIfMonthly > 0 ? ((savings / annualIfMonthly) * 100) : 0;
      
      if (savings > 0) {
        document.getElementById('savingsBadge').textContent = 
          `Save $${savings.toFixed(2)} (${savingsPercent.toFixed(0)}%)`;
      } else {
        document.getElementById('savingsBadge').textContent = 'No savings';
      }
    }

    monthlyInput.addEventListener('input', updatePreview);
    annualInput.addEventListener('input', updatePreview);
    trialInput.addEventListener('input', updatePreview);

    document.getElementById('savePricingBtn').addEventListener('click', async () => {
      const monthly = parseFloat(monthlyInput.value);
      const annual = parseFloat(annualInput.value);
      const trial = parseInt(trialInput.value);
      
      if (!Number.isFinite(monthly) || !Number.isFinite(annual) || !Number.isFinite(trial)) {
        showMessage('❌ Please fill in all required fields with valid numbers', 'error');
        return;
      }
      
      if (monthly <= 0 || annual <= 0 || trial < 0) {
        showMessage('❌ Prices must be greater than 0, trial must be 0 or more', 'error');
        return;
      }
      
      const saveBtn = document.getElementById('savePricingBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      try {
        await setDoc(doc(db, 'pricing_settings', 'default'), {
          monthly_price: monthly,
          annual_price: annual,
          free_trial_days: trial,
          updated_at: serverTimestamp(),
          updated_by: 'admin'
        }, { merge: true });
        
        showMessage('✅ Pricing settings saved successfully! Changes are live on pricing.html', 'success');
      } catch (error) {
        console.error('Error saving pricing settings:', error);
        showMessage('❌ Error saving settings: ' + error.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Pricing';
      }
    });

    function showMessage(text, type) {
      messageDiv.textContent = text;
      messageDiv.className = 'message ' + type + ' visible';
      
      setTimeout(() => {
        messageDiv.classList.remove('visible');
      }, 5000);
    }

    loadPricingSettings();
