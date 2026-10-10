/* Kingdom Connects - Church Admin Insights */
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireChurchAdmin } from '../../js/auth/access-control.js';

const form = document.getElementById('questionnaireForm');
const questionsContainer = document.getElementById('questionsContainer');
const loadingMessage = document.getElementById('loadingMessage');
const lastUpdatedBadge = document.getElementById('lastUpdatedBadge');
const lastUpdatedText = document.getElementById('lastUpdatedText');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const saveDraftBtn = document.getElementById('saveDraftBtn');

let churchId = null;
let currentData = {};
let questions = [];

function displayLastUpdated(timestamp) {
  if (!timestamp) {
    // No timestamp - hide badge and reset state
    lastUpdatedBadge.classList.add('hidden');
    lastUpdatedBadge.classList.remove('warning');
    lastUpdatedText.textContent = '';
    return;
  }
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  let displayText;
  let isWarning = false;
  
  if (daysDiff === 0) {
    displayText = '✓ Updated today';
  } else if (daysDiff === 1) {
    displayText = 'Last updated yesterday';
  } else if (daysDiff < 30) {
    displayText = `Last updated ${daysDiff} days ago`;
  } else if (daysDiff < 90) {
    const months = Math.floor(daysDiff / 30);
    displayText = `Last updated ${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    displayText = `⚠️ Updated ${Math.floor(daysDiff / 30)} months ago - Consider refreshing`;
    isWarning = true;
  }
  
  lastUpdatedText.textContent = displayText;
  lastUpdatedBadge.classList.remove('hidden');
  
  // Use CSS class for warning state
  if (isWarning) {
    lastUpdatedBadge.classList.add('warning');
  } else {
    lastUpdatedBadge.classList.remove('warning');
  }
}

async function loadQuestions() {
  try {
    const snapshot = await getDocs(collection(db, 'questionnaire_questions'));
    questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    questions.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return questions;
  } catch (error) {
    console.error('Error loading questions:', error);
    return [];
  }
}

function renderQuestions() {
  if (questions.length === 0) {
    questionsContainer.innerHTML = '<p class="text-muted">No questions available at this time. Please check back later.</p>';
    return;
  }

  questionsContainer.innerHTML = questions.map((q, index) => {
    const fieldName = `q_${q.id}`;
    const isRequired = q.required ? 'required' : '';
    const placeholder = q.placeholder || '';

    let inputHTML = '';

    switch (q.question_type) {
      case 'text':
        inputHTML = `<input type="text" class="input-dark" id="${fieldName}" name="${fieldName}" placeholder="${placeholder}" ${isRequired}>`;
        break;
      
      case 'number':
        inputHTML = `<input type="number" class="input-dark" id="${fieldName}" name="${fieldName}" placeholder="${placeholder}" ${isRequired} min="0">`;
        break;
      
      case 'textarea':
        inputHTML = `<textarea class="input-dark" id="${fieldName}" name="${fieldName}" rows="4" placeholder="${placeholder}" ${isRequired}></textarea>`;
        break;
      
      case 'select':
        inputHTML = `
          <select class="input-dark" id="${fieldName}" name="${fieldName}" ${isRequired}>
            <option value="">Select an option...</option>
            ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        `;
        break;
      
      case 'multiselect':
        inputHTML = `
          <div class="checkbox-group">
            ${q.options.map(opt => `
              <label class="checkbox-label">
                <input type="checkbox" name="${fieldName}" value="${opt}">
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
        break;
      
      case 'yesno':
        inputHTML = `
          <select class="input-dark" id="${fieldName}" name="${fieldName}" ${isRequired}>
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="maybe">Maybe</option>
          </select>
        `;
        break;
    }

    return `
      <div class="form-group">
        <label for="${fieldName}">
          ${index + 1}. ${q.question_text}${q.required ? '<span class="req">*</span>' : ''}
        </label>
        ${inputHTML}
      </div>
    `;
  }).join('');
}

function updateProgress() {
  const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
  let filled = 0;
  inputs.forEach(input => {
    if (input.value && input.value.trim()) filled++;
  });
  
  const totalRequired = inputs.length;
  const progress = totalRequired > 0 ? Math.round((filled / totalRequired) * 100) : 0;
  progressFill.style.width = progress + '%';
  progressText.textContent = `Progress: ${progress}% complete (${filled} of ${totalRequired} required fields)`;
}

function loadFormData(data) {
  if (!data.answers) return;
  
  Object.keys(data.answers).forEach(key => {
    const value = data.answers[key];
    const element = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
    
    if (!element) return;

    if (element.type === 'checkbox') {
      const checkboxes = document.querySelectorAll(`[name="${key}"]`);
      if (Array.isArray(value)) {
        checkboxes.forEach(cb => {
          cb.checked = value.includes(cb.value);
        });
      }
    } else {
      element.value = value;
    }
  });
}

async function saveQuestionnaire(isComplete) {
  if (!churchId) return;

  const formData = new FormData(form);
  const answers = {};

  questions.forEach(q => {
    const fieldName = `q_${q.id}`;
    
    if (q.question_type === 'multiselect') {
      const checkboxes = document.querySelectorAll(`[name="${fieldName}"]:checked`);
      answers[fieldName] = Array.from(checkboxes).map(cb => cb.value);
    } else {
      const value = formData.get(fieldName);
      if (value !== null) {
        answers[fieldName] = value;
      }
    }
  });

  const data = {
    church_id: churchId,
    answers: answers,
    completed: isComplete,
    updated_at: serverTimestamp()
  };

  if (!currentData.created_at) {
    data.created_at = serverTimestamp();
  }

  const insightsRef = doc(db, 'church_insights', churchId);
  await setDoc(insightsRef, data, { merge: true });

  return data;
}

requireChurchAdmin(async (userContext, firebaseUser, churchContext) => {
  try {
    const questionsLoaded = await loadQuestions();
    
    if (questionsLoaded.length === 0) {
      loadingMessage.textContent = 'No questions available. Please contact support.';
      return;
    }

    if (!churchContext) {
      loadingMessage.textContent = 'No church found for your account.';
      return;
    }

    churchId = churchContext.id;

    renderQuestions();

    const insightsRef = doc(db, 'church_insights', churchId);
    const insightsSnap = await getDoc(insightsRef);

    if (insightsSnap.exists()) {
      currentData = insightsSnap.data();
      loadFormData(currentData);
      
      if (currentData.updated_at || currentData.created_at) {
        displayLastUpdated(currentData.updated_at || currentData.created_at);
      }
    }

    loadingMessage.classList.add('hidden');
    form.classList.remove('hidden');
    updateProgress();

    form.addEventListener('input', updateProgress);
    form.addEventListener('change', updateProgress);

  } catch (error) {
    console.error('Error loading church insights:', error);
    loadingMessage.textContent = 'Error loading church insights. Please try again.';
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    await saveQuestionnaire(true);
    
    // Reload data to get the fresh serverTimestamp and refresh UI
    const insightsRef = doc(db, 'church_insights', churchId);
    const insightsSnap = await getDoc(insightsRef);
    if (insightsSnap.exists()) {
      currentData = insightsSnap.data();
      loadFormData(currentData);
      displayLastUpdated(currentData.updated_at || currentData.created_at);
      updateProgress();
    }
    
    window.showToast('Church insights updated! Your data helps us serve you better.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Error saving church insights:', error);
    window.showToast('Error saving church insights. Please try again.', 'error');
  }
});

saveDraftBtn.addEventListener('click', async () => {
  try {
    await saveQuestionnaire(false);
    
    // Reload data to get the fresh serverTimestamp and refresh UI
    const insightsRef = doc(db, 'church_insights', churchId);
    const insightsSnap = await getDoc(insightsRef);
    if (insightsSnap.exists()) {
      currentData = insightsSnap.data();
      loadFormData(currentData);
      displayLastUpdated(currentData.updated_at || currentData.created_at);
      updateProgress();
    }
    
    window.showToast('Draft saved. You can update this anytime.', 'success');
  } catch (error) {
    console.error('Error saving draft:', error);
    window.showToast('Error saving draft. Please try again.', 'error');
  }
});
