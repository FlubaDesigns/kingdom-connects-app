import { escapeHtml } from '../../js/business-presentation.js';
import { adminReady } from './admin-auth-guard.js';
await adminReady;
    import { db } from '../../js/firebase-config.js';
    import { collection, getDocs, query, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

    let allResponses = [];
    let filteredResponses = [];
    let questions = [];
    let unsubscribe = null;

    const responsesList = document.getElementById('responsesList');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');

    async function loadQuestions() {
      try {
        const q = query(collection(db, 'questionnaire_questions'));
        const snapshot = await getDocs(q);
        questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.error('Error loading questions:', error);
      }
    }

    function getQuestionText(questionId) {
      const q = questions.find(q => q.id === questionId);
      return q ? q.question_text : 'Unknown Question';
    }

    function setupRealtimeListener() {
      try {
        const insightsQuery = query(collection(db, 'business_insights'));
        
        unsubscribe = onSnapshot(insightsQuery, async (snapshot) => {
          allResponses = await Promise.all(snapshot.docs.map(async (responseDoc) => {
            const data = responseDoc.data();
            
            let businessName = 'Unknown Business';
            if (data.business_id) {
              try {
                const businessDoc = await getDoc(doc(db, 'business_listings_public', data.business_id));
                if (businessDoc.exists()) {
                  businessName = businessDoc.data().business_name || 'Unknown Business';
                }
              } catch (err) {
                console.error('Error fetching business:', err);
              }
            }
            
            return {
              id: responseDoc.id,
              business_name: businessName,
              ...data
            };
          }));

          updateStats();
          applyFilters();
          
        }, (error) => {
          console.error('Error loading responses:', error);
          responsesList.innerHTML = `<p class="status-message error">Error loading responses. Please try again.</p>`;
        });
      } catch (error) {
        console.error('Error setting up real-time listener:', error);
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
      const search = searchInput.value.toLowerCase();
      const status = statusFilter.value;

      filteredResponses = allResponses.filter(response => {
        if (search && !response.id.toLowerCase().includes(search) && !response.business_name.toLowerCase().includes(search)) return false;
        if (status === 'complete' && !response.completed) return false;
        if (status === 'draft' && response.completed) return false;
        return true;
      });

      renderResponses();
    }

    function renderResponses() {
      if (filteredResponses.length === 0) {
        responsesList.innerHTML = `<p class="status-message empty">No responses found.</p>`;
        return;
      }

      responsesList.innerHTML = filteredResponses.map(response => {
        const answers = response.answers || {};
        const answersHTML = Object.keys(answers).map(key => {
          const questionId = key.replace('q_', '');
          const value = Array.isArray(answers[key]) ? answers[key].join(', ') : answers[key];
          return `
            <div class="answer-item">
              <div class="answer-question">${escapeHtml(getQuestionText(questionId))}</div>
              <div class="answer-value">${escapeHtml(value || 'No answer')}</div>
            </div>
          `;
        }).join('');
        
        const answerCount = Object.keys(answers).length;

        return `
          <div class="response-card">
            <div class="response-header">
              <div class="response-name">${escapeHtml(response.business_name)}</div>
              <div class="response-meta">
                <span class="badge ${response.completed ? 'badge-complete' : 'badge-draft'}">
                  ${response.completed ? 'Complete' : 'Draft'}
                </span>
                <span>ID: ${escapeHtml(response.id)}</span>
                ${response.updated_at ? `<span>Updated: ${new Date(response.updated_at.seconds * 1000).toLocaleDateString()}</span>` : ''}
                <button class="toggle-btn" data-action="toggleAnswers" data-id="${escapeHtml(response.id)}">
                  ${answerCount} Answers
                </button>
              </div>
            </div>
            <div id="answers-${escapeHtml(response.id)}" class="answers-grid answers-collapsed">
              ${answersHTML || '<p class="text-muted">No answers submitted yet.</p>'}
            </div>
          </div>
        `;
      }).join('');
    }

    window.toggleAnswers = (responseId) => {
      const answersDiv = document.getElementById(`answers-${responseId}`);
      answersDiv.classList.toggle('answers-collapsed');
    };

    function exportToCSV() {
      if (filteredResponses.length === 0) {
        window.showToast('No data to export', 'info');
        return;
      }

      const allQuestionIds = new Set();
      filteredResponses.forEach(r => {
        if (r.answers) {
          Object.keys(r.answers).forEach(key => allQuestionIds.add(key));
        }
      });

      const questionIds = Array.from(allQuestionIds).sort();
      const headers = ['Business Name', 'Business ID', 'Status', 'Updated', ...questionIds.map(id => getQuestionText(id.replace('q_', '')))];

      const rows = filteredResponses.map(response => {
        const baseData = [
          response.business_name || '',
          response.id || '',
          response.completed ? 'Complete' : 'Draft',
          response.updated_at ? new Date(response.updated_at.seconds * 1000).toLocaleString() : ''
        ];

        const answerData = questionIds.map(qId => {
          const value = response.answers?.[qId];
          if (Array.isArray(value)) return value.join('; ');
          return value || '';
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
      a.download = `business-questionnaire-responses-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);

    document.getElementById('exportCSV').addEventListener('click', exportToCSV);
    document.getElementById('refreshData').addEventListener('click', () => {
      if (unsubscribe) unsubscribe();
      loadData();
    });

    async function loadData() {
      await loadQuestions();
      setupRealtimeListener();
    }

    loadData();

// Event delegation for dynamically created buttons
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  
  if (action === 'toggleAnswers' && typeof toggleAnswers === 'function') {
    toggleAnswers(id);
  }
});
