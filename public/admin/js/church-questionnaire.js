import { db } from '../../js/firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let allQuestions = [];
let allResponses = [];
let filteredResponses = [];
let editingQuestionId = null;
let currentTab = 'questions';
let responsesUnsubscribe = null;

const questionModal = document.getElementById('questionModal');
const questionForm = document.getElementById('questionForm');
const modalTitle = document.getElementById('modalTitle');

document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', function() {
    const tabName = this.getAttribute('data-tab');
    currentTab = tabName;
    
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    this.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'responses' && !responsesUnsubscribe) {
      loadResponses();
    }
  });
});

document.getElementById('addQuestionBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('questionForm').addEventListener('submit', saveQuestion);
document.getElementById('questionType').addEventListener('change', handleTypeChange);
document.getElementById('addOptionBtn').addEventListener('click', () => addOption(''));
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);
document.getElementById('exportCSV').addEventListener('click', exportToCSV);
document.getElementById('refreshData').addEventListener('click', () => {
  if (responsesUnsubscribe) responsesUnsubscribe();
  loadResponses();
});

async function loadQuestions() {
  try {
    document.getElementById('questionsLoading').classList.remove('hidden');
    document.getElementById('questionsError').classList.add('hidden');
    document.getElementById('questionsList').classList.add('hidden');
    document.getElementById('questionsEmpty').classList.add('hidden');

    const q = query(collection(db, 'questionnaire_questions'), orderBy('order_index', 'asc'));
    const snapshot = await getDocs(q);
    
    allQuestions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    document.getElementById('questionsLoading').classList.add('hidden');

    if (allQuestions.length === 0) {
      document.getElementById('questionsEmpty').classList.remove('hidden');
    } else {
      document.getElementById('questionsList').classList.remove('hidden');
      renderQuestions();
    }
  } catch (error) {
    console.error('Error loading questions:', error);
    document.getElementById('questionsLoading').classList.add('hidden');
    document.getElementById('questionsError').classList.remove('hidden');
  }
}

function renderQuestions() {
  const questionsList = document.getElementById('questionsList');
  questionsList.innerHTML = allQuestions.map((q, index) => {
    const typeLabel = {
      text: 'Short Text',
      textarea: 'Long Text',
      number: 'Number',
      yes_no: 'Yes/No',
      multiple_choice: 'Multiple Choice',
      checkboxes: 'Checkboxes'
    }[q.question_type] || q.question_type;

    return `
      <div class="card" data-question-id="${q.id}">
        <div class="card-header">
          <div>
            <strong>Q${index + 1}:</strong> ${escapeHtml(q.question_text)}
            ${q.is_required ? '<span class="badge badge-required">Required</span>' : ''}
          </div>
          <div class="flex-gap">
            <button class="btn btn-small btn-secondary" data-action="edit" data-id="${q.id}">Edit</button>
            <button class="btn btn-small btn-danger" data-action="delete" data-id="${q.id}">Delete</button>
            ${index > 0 ? `<button class="btn btn-small btn-icon" data-action="moveUp" data-id="${q.id}">↑</button>` : ''}
            ${index < allQuestions.length - 1 ? `<button class="btn btn-small btn-icon" data-action="moveDown" data-id="${q.id}">↓</button>` : ''}
          </div>
        </div>
        <div class="card-body">
          <p><strong>Type:</strong> ${typeLabel}</p>
          ${q.help_text ? `<p><strong>Help Text:</strong> ${escapeHtml(q.help_text)}</p>` : ''}
          ${q.options && q.options.length > 0 ? `<p><strong>Options:</strong> ${q.options.map(escapeHtml).join(', ')}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openAddModal() {
  editingQuestionId = null;
  modalTitle.textContent = 'Add Question';
  questionForm.reset();
  document.getElementById('optionsContainer').classList.add('hidden');
  questionModal.classList.remove('hidden');
}

function openEditModal(questionId) {
  const question = allQuestions.find(q => q.id === questionId);
  if (!question) return;

  editingQuestionId = questionId;
  modalTitle.textContent = 'Edit Question';
  
  document.getElementById('questionText').value = question.question_text || '';
  document.getElementById('questionType').value = question.question_type || 'text';
  document.getElementById('isRequired').checked = question.is_required || false;
  document.getElementById('helpText').value = question.help_text || '';

  handleTypeChange();

  if (question.options && question.options.length > 0) {
    const optionsList = document.getElementById('optionsList');
    optionsList.innerHTML = '';
    question.options.forEach(option => {
      addOption(option);
    });
  }

  questionModal.classList.remove('hidden');
}

function closeModal() {
  questionModal.classList.add('hidden');
  questionForm.reset();
  editingQuestionId = null;
}

function handleTypeChange() {
  const type = document.getElementById('questionType').value;
  const optionsContainer = document.getElementById('optionsContainer');
  
  if (type === 'multiple_choice' || type === 'checkboxes') {
    optionsContainer.classList.remove('hidden');
    if (document.getElementById('optionsList').children.length === 0) {
      addOption('');
      addOption('');
    }
  } else {
    optionsContainer.classList.add('hidden');
  }
}

function addOption(value = '') {
  const optionsList = document.getElementById('optionsList');
  const optionDiv = document.createElement('div');
  optionDiv.classList.add('flex-gap', 'option-item');
  
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('input-dark', 'option-input');
  input.placeholder = 'Option text';
  input.value = value;
  
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.classList.add('btn', 'btn-small', 'btn-danger');
  removeBtn.textContent = '×';
  removeBtn.setAttribute('data-action', 'removeOption');
  
  optionDiv.appendChild(input);
  optionDiv.appendChild(removeBtn);
  optionsList.appendChild(optionDiv);
}

async function saveQuestion(e) {
  e.preventDefault();

  const questionText = document.getElementById('questionText').value.trim();
  const questionType = document.getElementById('questionType').value;
  const isRequired = document.getElementById('isRequired').checked;
  const helpText = document.getElementById('helpText').value.trim();

  let options = [];
  if (questionType === 'multiple_choice' || questionType === 'checkboxes') {
    const optionInputs = document.querySelectorAll('.option-input');
    options = Array.from(optionInputs)
      .map(input => input.value.trim())
      .filter(val => val !== '');
    
    if (options.length < 2) {
      window.showToast('Please provide at least 2 options for multiple choice/checkbox questions', 'info');
      return;
    }
  }

  const questionData = {
    question_text: questionText,
    question_type: questionType,
    is_required: isRequired,
    help_text: helpText,
    options: options,
    updated_at: serverTimestamp()
  };

  try {
    if (editingQuestionId) {
      await updateDoc(doc(db, 'questionnaire_questions', editingQuestionId), questionData);
    } else {
      questionData.order_index = allQuestions.length;
      questionData.created_at = serverTimestamp();
      await addDoc(collection(db, 'questionnaire_questions'), questionData);
    }

    closeModal();
    loadQuestions();
  } catch (error) {
    console.error('Error saving question:', error);
    window.showToast('Error saving question: ' + error.message, 'error');
  }
}

async function deleteQuestion(questionId) {
  if (!confirm('Are you sure you want to delete this question? This cannot be undone.')) return;

  try {
    await deleteDoc(doc(db, 'questionnaire_questions', questionId));
    loadQuestions();
  } catch (error) {
    console.error('Error deleting question:', error);
    window.showToast('Error deleting question: ' + error.message, 'error');
  }
}

async function moveQuestion(questionId, direction) {
  const currentIndex = allQuestions.findIndex(q => q.id === questionId);
  if (currentIndex === -1) return;

  const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (newIndex < 0 || newIndex >= allQuestions.length) return;

  try {
    const currentQuestion = allQuestions[currentIndex];
    const swapQuestion = allQuestions[newIndex];

    await Promise.all([
      updateDoc(doc(db, 'questionnaire_questions', currentQuestion.id), { order_index: newIndex }),
      updateDoc(doc(db, 'questionnaire_questions', swapQuestion.id), { order_index: currentIndex })
    ]);

    loadQuestions();
  } catch (error) {
    console.error('Error reordering questions:', error);
    window.showToast('Error reordering questions: ' + error.message, 'error');
  }
}

async function loadResponses() {
  try {
    document.getElementById('responsesLoading').classList.remove('hidden');
    document.getElementById('responsesError').classList.add('hidden');
    document.getElementById('responsesList').classList.add('hidden');
    document.getElementById('responsesEmpty').classList.add('hidden');

    await loadQuestions();

    const insightsQuery = query(collection(db, 'church_insights'));
    
    responsesUnsubscribe = onSnapshot(insightsQuery, async (snapshot) => {
      allResponses = await Promise.all(snapshot.docs.map(async (responseDoc) => {
        const data = responseDoc.data();
        
        let churchName = 'Unknown Church';
        if (data.church_id) {
          try {
            const churchDoc = await getDoc(doc(db, 'churches', data.church_id));
            if (churchDoc.exists()) {
              churchName = churchDoc.data().church_name || 'Unknown Church';
            }
          } catch (err) {
            console.error('Error fetching church:', err);
          }
        }
        
        return {
          id: responseDoc.id,
          church_name: churchName,
          ...data
        };
      }));

      updateStats();
      applyFilters();
      
      document.getElementById('responsesLoading').classList.add('hidden');
      
      if (allResponses.length === 0) {
        document.getElementById('responsesEmpty').classList.remove('hidden');
      }
    }, (error) => {
      console.error('Error loading responses:', error);
      document.getElementById('responsesLoading').classList.add('hidden');
      document.getElementById('responsesError').classList.remove('hidden');
    });
  } catch (error) {
    console.error('Error setting up responses:', error);
    document.getElementById('responsesLoading').classList.add('hidden');
    document.getElementById('responsesError').classList.remove('hidden');
  }
}

function updateStats() {
  const total = allResponses.length;
  const completed = allResponses.filter(r => r.completed).length;
  const drafts = total - completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById('totalResponses').textContent = total;
  document.getElementById('completedResponses').textContent = completed;
  document.getElementById('draftResponses').textContent = drafts;
  document.getElementById('completionRate').textContent = completionRate + '%';
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;

  filteredResponses = allResponses.filter(response => {
    if (search && !response.id.toLowerCase().includes(search) && !response.church_name.toLowerCase().includes(search)) return false;
    if (status === 'complete' && !response.completed) return false;
    if (status === 'draft' && response.completed) return false;
    return true;
  });

  renderResponses();
}

function renderResponses() {
  const responsesList = document.getElementById('responsesList');
  
  if (filteredResponses.length === 0) {
    responsesList.classList.add('hidden');
    document.getElementById('responsesEmpty').classList.remove('hidden');
    return;
  }

  document.getElementById('responsesEmpty').classList.add('hidden');
  responsesList.classList.remove('hidden');

  responsesList.innerHTML = filteredResponses.map(response => {
    const answers = response.answers || {};
    let answersHTML = '';
    
    if (Object.keys(answers).length > 0) {
      answersHTML = Object.keys(answers).map(key => {
        const questionId = key.replace('q_', '');
        const rawValue = answers[key];
        const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
        const displayValue = (value === null || value === undefined || value === '') ? 'No answer' : String(value);
        return `
          <div class="answer-item">
            <div class="answer-question">${escapeHtml(getQuestionText(questionId))}</div>
            <div class="answer-value">${escapeHtml(displayValue)}</div>
          </div>
        `;
      }).join('');
    } else {
      const legacyFields = [
        { label: 'Active Members', value: response.active_members },
        { label: 'Years Established', value: response.years_established },
        { label: 'Weekly Services', value: response.weekly_services },
        { label: 'Ministries', value: response.ministries?.join(', ') },
        { label: 'Promotes Local Businesses', value: response.promotes_local_businesses },
        { label: 'Feature KC', value: response.feature_kc },
        { label: 'Estimated Weekly Reach', value: response.estimated_weekly_reach },
        { label: 'Referral Source', value: response.referral_source },
        { label: 'Wants Welcome Kit', value: response.wants_welcome_kit },
        { label: 'Mailing Address', value: response.mailing_address }
      ];
      
      answersHTML = legacyFields.filter(f => f.value !== undefined && f.value !== null && f.value !== '').map(field => `
        <div class="answer-item">
          <div class="answer-question">${escapeHtml(field.label)}</div>
          <div class="answer-value">${escapeHtml(String(field.value))}</div>
        </div>
      `).join('');
    }
    
    const answerCount = Object.keys(answers).length || 'Legacy';
    const updatedDate = response.updated_at ? new Date(response.updated_at.seconds * 1000).toLocaleDateString() : '';

    return `
      <div class="response-card">
        <div class="response-header">
          <div class="response-name">${escapeHtml(response.church_name)}</div>
          <div class="response-meta">
            <span class="badge ${response.completed ? 'badge-complete' : 'badge-draft'}">
              ${response.completed ? 'Complete' : 'Draft'}
            </span>
            <span>ID: ${escapeHtml(response.id)}</span>
            ${updatedDate ? `<span>Updated: ${updatedDate}</span>` : ''}
            <button class="toggle-btn" data-action="toggleAnswers" data-id="${response.id}">
              ${answerCount} Answers
            </button>
          </div>
        </div>
        <div id="answers-${response.id}" class="answers-grid answers-collapsed">
          ${answersHTML || '<p class="text-muted">No answers submitted yet.</p>'}
        </div>
      </div>
    `;
  }).join('');
}

function getQuestionText(questionId) {
  const q = allQuestions.find(q => q.id === questionId);
  return q ? q.question_text : 'Unknown Question';
}

function toggleAnswers(responseId) {
  const answersDiv = document.getElementById(`answers-${responseId}`);
  if (answersDiv) {
    answersDiv.classList.toggle('answers-collapsed');
  }
}

function exportToCSV() {
  if (filteredResponses.length === 0) {
    window.showToast('No data to export', 'info');
    return;
  }

  const allQuestionIds = new Set();
  const hasLegacy = filteredResponses.some(r => !r.answers || Object.keys(r.answers).length === 0);
  
  filteredResponses.forEach(r => {
    if (r.answers) {
      Object.keys(r.answers).forEach(key => allQuestionIds.add(key));
    }
  });

  const questionIds = Array.from(allQuestionIds).sort();
  let headers = ['Church Name', 'Church ID', 'Status', 'Updated'];
  
  if (hasLegacy) {
    headers.push('Active Members', 'Years Established', 'Weekly Services', 'Ministries', 'Promotes Local Businesses', 'Feature KC', 'Weekly Reach', 'Referral Source', 'Wants Welcome Kit', 'Mailing Address');
  }
  
  headers.push(...questionIds.map(id => getQuestionText(id.replace('q_', ''))));

  const rows = filteredResponses.map(response => {
    const baseData = [
      response.church_name ?? '',
      response.id ?? '',
      response.completed ? 'Complete' : 'Draft',
      response.updated_at ? new Date(response.updated_at.seconds * 1000).toLocaleString() : ''
    ];

    if (hasLegacy) {
      baseData.push(
        response.active_members ?? '',
        response.years_established ?? '',
        response.weekly_services ?? '',
        response.ministries?.join('; ') ?? '',
        response.promotes_local_businesses ?? '',
        response.feature_kc ?? '',
        response.estimated_weekly_reach ?? '',
        response.referral_source ?? '',
        response.wants_welcome_kit ?? '',
        response.mailing_address ?? ''
      );
    }

    const answerData = questionIds.map(qId => {
      const value = response.answers?.[qId];
      if (Array.isArray(value)) return value.join('; ');
      return (value === null || value === undefined) ? '' : String(value);
    });

    return [...baseData, ...answerData];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `church-questionnaire-responses-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');

  if (action === 'edit') {
    openEditModal(id);
  } else if (action === 'delete') {
    deleteQuestion(id);
  } else if (action === 'moveUp') {
    moveQuestion(id, 'up');
  } else if (action === 'moveDown') {
    moveQuestion(id, 'down');
  } else if (action === 'removeOption') {
    button.closest('.option-item').remove();
  } else if (action === 'toggleAnswers') {
    toggleAnswers(id);
  }
});

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

loadQuestions();
