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
        const insightsQuery = query(collection(db, 'church_insights'));
        
        unsubscribe = onSnapshot(insightsQuery, async (snapshot) => {
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
        if (search && !response.id.toLowerCase().includes(search) && !response.church_name.toLowerCase().includes(search)) return false;
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
        let answersHTML = '';
        
        if (Object.keys(answers).length > 0) {
          answersHTML = Object.keys(answers).map(key => {
            const questionId = key.replace('q_', '');
            const value = Array.isArray(answers[key]) ? answers[key].join(', ') : answers[key];
            return `
              <div class="answer-item">
                <div class="answer-question">${escapeHtml(getQuestionText(questionId))}</div>
                <div class="answer-value">${escapeHtml(value || 'No answer')}</div>
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
              <div class="answer-question">${field.label}</div>
              <div class="answer-value">${escapeHtml(field.value)}</div>
            </div>
          `).join('');
        }
        
        const answerCount = Object.keys(answers).length || 'Legacy';

        return `
          <div class="response-card">
            <div class="response-header">
              <div class="response-name">${escapeHtml(response.church_name)}</div>
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
          response.church_name || '',
          response.id || '',
          response.completed ? 'Complete' : 'Draft',
          response.updated_at ? new Date(response.updated_at.seconds * 1000).toLocaleString() : ''
        ];

        if (hasLegacy) {
          baseData.push(
            response.active_members || '',
            response.years_established || '',
            response.weekly_services || '',
            response.ministries?.join('; ') || '',
            response.promotes_local_businesses || '',
            response.feature_kc || '',
            response.estimated_weekly_reach || '',
            response.referral_source || '',
            response.wants_welcome_kit || '',
            response.mailing_address || ''
          );
        }

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
      a.download = `church-questionnaire-responses-${new Date().toISOString().split('T')[0]}.csv`;
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
