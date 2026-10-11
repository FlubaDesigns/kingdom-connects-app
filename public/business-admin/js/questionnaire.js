import { loadQuestionnaireQuestions, moveQuestionInAudience } from '../../js/services/questionnaire-service.js';
import { escapeHtml } from '../../js/business-presentation.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, orderBy, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";

const form = document.getElementById('questionnaireForm');
    const questionsContainer = document.getElementById('questionsContainer');
    const loadingMessage = document.getElementById('loadingMessage');
    const completionBadge = document.getElementById('completionBadge');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const saveDraftBtn = document.getElementById('saveDraftBtn');

    let businessId = null;
    let currentData = {};
    let questions = [];

    async function loadQuestions() {
      try {
        questions = await loadQuestionnaireQuestions({audience:'business', activeOnly:true});
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
        const placeholder = escapeHtml(q.placeholder || '');

        let inputHTML = '';

        switch (q.question_type) {
          case 'text':
            inputHTML = `<input type="text" class="" id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" placeholder="${placeholder}" ${isRequired}>`;
            break;
          
          case 'number':
            inputHTML = `<input type="number" class="" id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" placeholder="${placeholder}" ${isRequired} min="0">`;
            break;
          
          case 'textarea':
            inputHTML = `<textarea class="" id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" rows="4" placeholder="${placeholder}" ${isRequired}></textarea>`;
            break;
          
          case 'select':
            inputHTML = `
              <select class="" id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" ${isRequired}>
                <option value="">Select an option...</option>
                ${(q.options || []).map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
              </select>
            `;
            break;
          
          case 'multiselect':
            inputHTML = `
              <div class="checkbox-group">
                ${(q.options || []).map(opt => `
                  <label class="flex-align-center cursor-pointer mb-sm">
                    <input type="checkbox" name="${escapeHtml(fieldName)}" value="${escapeHtml(opt)}">
                    <span>${escapeHtml(opt)}</span>
                  </label>
                `).join('')}
              </div>
            `;
            break;
          
          case 'yesno':
            inputHTML = `
              <select class="" id="${escapeHtml(fieldName)}" name="${escapeHtml(fieldName)}" ${isRequired}>
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="maybe">Maybe</option>
              </select>
            `;
            break;
        }

        return `
          <div class="form-field question-item">
            <label class="" for="${escapeHtml(fieldName)}">
              ${index + 1}. ${escapeHtml(q.question_text)}${q.required ? '<span class="req">*</span>' : ''}
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
      if (!businessId) return;

      const formData = new FormData(form);
      const answers = {};

      questions.forEach(q => {
        const fieldName = `q_${q.id}`;
        
        if (q.question_type === 'multiselect') {
          const checkboxes = document.querySelectorAll(`[name="${escapeHtml(fieldName)}"]:checked`);
          answers[fieldName] = Array.from(checkboxes).map(cb => cb.value);
        } else {
          const value = formData.get(fieldName);
          if (value !== null) {
            answers[fieldName] = value;
          }
        }
      });

      const data = {
        business_id: businessId,
        answers: answers,
        completed: isComplete,
        updated_at: serverTimestamp()
      };

      if (!currentData.created_at) {
        data.created_at = serverTimestamp();
      }

      const insightsRef = doc(db, 'business_insights', businessId);
      await setDoc(insightsRef, data, { merge: true });

      currentData = { ...currentData, ...data };
      return data;
    }

requireAuth({ requireBusiness: true }, async (userContext, firebaseUser, businessContext) => {
  try {
    const questionsLoaded = await loadQuestions();
    
    if (questionsLoaded.length === 0) {
      loadingMessage.textContent = 'No questions available. Please contact support.';
      return;
    }

    let activeBusiness = null;
    if (businessContext) {
      for (const biz of businessContext) {
        if (biz.listing_status === 'active') {
          activeBusiness = biz;
          break;
        }
      }
    }

    if (!activeBusiness) {
      loadingMessage.textContent = 'No active business found for your account.';
      return;
    }

    businessId = activeBusiness.id;

    renderQuestions();

    const insightsRef = doc(db, 'business_insights', businessId);
    const insightsSnap = await getDoc(insightsRef);

    if (insightsSnap.exists()) {
      currentData = insightsSnap.data();
      loadFormData(currentData);
      
      if (currentData.completed) {
        completionBadge.classList.remove('hidden');
      }
    }

    loadingMessage.classList.add('hidden');
    form.classList.remove('hidden');
    updateProgress();

    form.addEventListener('input', updateProgress);
    form.addEventListener('change', updateProgress);

  } catch (error) {
    console.error('Error loading questionnaire:', error);
    loadingMessage.textContent = 'Error loading questionnaire. Please try again.';
  }
});

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        await saveQuestionnaire(true);
        completionBadge.classList.remove('hidden');
        window.showToast('Questionnaire saved! Thank you for helping us understand your business.', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('Error saving questionnaire:', error);
        window.showToast('Error saving questionnaire. Please try again.', 'error');
      }
    });

    saveDraftBtn.addEventListener('click', async () => {
      try {
        await saveQuestionnaire(false);
        window.showToast('Draft saved! You can complete it later.', 'success');
      } catch (error) {
        console.error('Error saving draft:', error);
        window.showToast('Error saving draft. Please try again.', 'error');
      }
    });
