import { escapeHtml } from '../../js/business-presentation.js';
import { loadQuestionnaireQuestions, moveQuestionInAudience } from '../../js/services/questionnaire-service.js';
import { adminReady } from './admin-auth-guard.js';
await adminReady;
    import { db } from '../../js/firebase-config.js';
    import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

    let currentAudience = 'church';
    let allQuestions = [];

    const questionList = document.getElementById('questionList');
    const questionCount = document.getElementById('questionCount');
    const addForm = document.getElementById('addQuestionForm');
    const currentAudienceInput = document.getElementById('currentAudience');
    const questionTypeRadios = document.querySelectorAll('input[name="questionType"]');
    const optionsField = document.getElementById('optionsField');

    // Tab switching
    document.querySelectorAll('.audience-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.audience-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentAudience = tab.dataset.audience;
        currentAudienceInput.value = currentAudience;
        renderQuestions();
      });
    });

    // Show/hide options field based on question type
    questionTypeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const type = document.querySelector('input[name="questionType"]:checked').value;
        const showOptions = (type === 'select' || type === 'multiselect');
        if (showOptions) {
          optionsField.classList.remove('hidden');
        } else {
          optionsField.classList.add('hidden');
        }
        document.getElementById('questionOptions').required = showOptions;
      });
    });

    // Load questions
    async function loadQuestions() {
      try {
        allQuestions = await loadQuestionnaireQuestions();
        renderQuestions();
      } catch (error) {
        console.error('Error loading questions:', error);
        questionList.innerHTML = `<p class="status-message error">Error loading questions. Please try again.</p>`;
      }
    }

    function renderQuestions() {
      const filtered = allQuestions.filter(q => q.audience === currentAudience);
      questionCount.textContent = filtered.length;

      if (filtered.length === 0) {
        questionList.innerHTML = `<p class="status-message empty">No ${currentAudience} questions yet. Add your first one above!</p>`;
        return;
      }

      questionList.innerHTML = filtered.map((q, index) => `
        <div class="question-card" data-id="${q.id}">
          <div class="question-header">
            <div class="question-number">${index + 1}</div>
            <div class="question-text">${escapeHtml(q.question_text)}</div>
            <div class="order-controls">
              <button class="order-btn" data-action="moveQuestion" data-id="${q.id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="order-btn" data-action="moveQuestion" data-id="${q.id}" data-direction="down" ${index === filtered.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
          </div>
          
          <div class="question-meta">
            <span class="question-type-badge">${escapeHtml(q.question_type)}</span>
            ${q.required ? '<span>✓ Required</span>' : '<span>Optional</span>'}
            <span class="status-active ${q.active ? 'status-active' : 'status-inactive'}">${q.active ? 'Active' : 'Inactive'}</span>
            ${q.options && q.options.length ? `<span>Options: ${escapeHtml(q.options.join(', '))}</span>` : ''}
          </div>

          <div class="question-actions">
            <button class="btn btn-small btn-primary" data-action="editQuestion" data-id="${q.id}">Edit</button>
            <button class="btn btn-small ${q.active ? 'btn-secondary' : 'btn-gold'}" data-action="toggleActive" data-id="${q.id}" data-value="${!q.active}">${q.active ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-small btn-danger" data-action="deleteQuestion" data-id="${q.id}">Delete</button>
          </div>

          <div id="edit-${q.id}" class="hidden"></div>
        </div>
      `).join('');
    }

    // Add question
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(addForm);
      const type = formData.get('questionType');
      const optionsText = formData.get('questionOptions');
      const options = (type === 'select' || type === 'multiselect') && optionsText 
        ? optionsText.split('\n').map(o => o.trim()).filter(o => o) 
        : [];

      if ((type === 'select' || type === 'multiselect') && options.length === 0) {
        window.showToast('Please provide at least one option for this question type.', 'info');
        return;
      }

      try {
        const filtered = allQuestions.filter(q => q.audience === currentAudience);
        const maxOrder = filtered.length > 0 ? Math.max(...filtered.map(q => q.order || 0)) : 0;

        await addDoc(collection(db, 'questionnaire_questions'), {
          question_text: formData.get('questionText'),
          question_type: type,
          audience: formData.get('audience'),
          options: options,
          placeholder: formData.get('questionPlaceholder') || '',
          required: formData.get('isRequired') === 'on',
          active: formData.get('isActive') === 'on',
          order: maxOrder + 1,
          created_at: Timestamp.now()
        });

        addForm.reset();
        currentAudienceInput.value = currentAudience;
        document.querySelector('input[name="questionType"][value="text"]').checked = true;
        optionsField.classList.add('hidden');
        await loadQuestions();
      } catch (error) {
        console.error('Error adding question:', error);
        window.showToast('Error adding question. Please try again.', 'error');
      }
    });

    // Toggle active status
    window.toggleActive = async (id, newStatus) => {
      try {
        await updateDoc(doc(db, 'questionnaire_questions', id), { active: newStatus });
        await loadQuestions();
      } catch (error) {
        console.error('Error toggling status:', error);
        window.showToast('Error updating question. Please try again.', 'error');
      }
    };

    // Delete question
    window.deleteQuestion = async (id) => {
      if (!confirm('Are you sure you want to delete this question? This cannot be undone.')) return;
      
      try {
        await deleteDoc(doc(db, 'questionnaire_questions', id));
        await loadQuestions();
      } catch (error) {
        console.error('Error deleting question:', error);
        window.showToast('Error deleting question. Please try again.', 'error');
      }
    };

    // Move question up/down
    window.moveQuestion = async (id, direction) => {
      const filtered = allQuestions.filter(q => q.audience === currentAudience);
      const currentIndex = filtered.findIndex(q => q.id === id);
      
      if (currentIndex === -1) return;
      if (direction === 'up' && currentIndex === 0) return;
      if (direction === 'down' && currentIndex === filtered.length - 1) return;

      const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const current = filtered[currentIndex];
      const swap = filtered[swapIndex];

      try {
        await moveQuestionInAudience(filtered, id, direction);
        await loadQuestions();
      } catch (error) {
        console.error('Error reordering questions:', error);
        window.showToast('Error reordering questions. Please try again.', 'error');
      }
    };

    // Edit question
    window.editQuestion = (id) => {
      const question = allQuestions.find(q => q.id === id);
      if (!question) return;

      const editContainer = document.getElementById(`edit-${id}`);
      editContainer.classList.remove('hidden');
      editContainer.innerHTML = `
        <div class="edit-form">
          <h4 class="mt-0">Edit Question</h4>
          <form id="editForm-${id}">
            <div class="form-field">
              <label class="">Question Text</label>
              <textarea class="" rows="2" required>${escapeHtml(question.question_text)}</textarea>
            </div>
            <div class="form-field">
              <label class="">Placeholder</label>
              <input type="text" class="" value="${escapeHtml(question.placeholder || '')}">
            </div>
            ${question.options && question.options.length ? `
            <div class="form-field">
              <label class="">Options (one per line)</label>
              <textarea class="" rows="4">${escapeHtml(question.options.join('\n'))}</textarea>
            </div>
            ` : ''}
            <div class="flex gap-sm">
              <button type="submit" class="btn btn-small btn-gold">Save</button>
              <button type="button" class="btn btn-small btn-secondary" data-action="cancelEdit" data-id="${id}">Cancel</button>
            </div>
          </form>
        </div>
      `;

      document.getElementById(`editForm-${id}`).addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = e.target.querySelectorAll('input, textarea');
        const newText = inputs[0].value;
        const newPlaceholder = inputs[1].value;
        const newOptions = inputs[2] ? inputs[2].value.split('\n').map(o => o.trim()).filter(o => o) : question.options;

        try {
          await updateDoc(doc(db, 'questionnaire_questions', id), {
            question_text: newText,
            placeholder: newPlaceholder,
            options: newOptions
          });
          await loadQuestions();
        } catch (error) {
          console.error('Error updating question:', error);
          window.showToast('Error updating question. Please try again.', 'error');
        }
      });
    };

    window.cancelEdit = (id) => {
      document.getElementById(`edit-${id}`).classList.add('hidden');
    };

    loadQuestions();

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  
  switch(action) {
    case 'moveQuestion':
      const direction = button.getAttribute('data-direction');
      if (typeof moveQuestion === 'function') moveQuestion(id, direction);
      break;
    case 'editQuestion':
      if (typeof editQuestion === 'function') editQuestion(id);
      break;
    case 'toggleActive':
      const value = button.getAttribute('data-value') === 'true';
      if (typeof toggleActive === 'function') toggleActive(id, value);
      break;
    case 'deleteQuestion':
      if (typeof deleteQuestion === 'function') deleteQuestion(id);
      break;
    case 'cancelEdit':
      if (typeof cancelEdit === 'function') cancelEdit(id);
      break;
  }
});
