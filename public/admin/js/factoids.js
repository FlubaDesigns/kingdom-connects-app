import { db } from "../../js/firebase-config.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const factoidList = document.getElementById('factoidList');
const factoidCount = document.getElementById('factoidCount');
const addForm = document.getElementById('addFactoidForm');
const questionInput = document.getElementById('factoidQuestion');
const answerInput = document.getElementById('factoidAnswer');
const questionCharCount = document.getElementById('questionCharCount');
const answerCharCount = document.getElementById('answerCharCount');
const masterToggle = document.getElementById('masterToggle');

questionInput?.addEventListener('input', () => {
  questionCharCount.textContent = questionInput.value.length;
});
answerInput?.addEventListener('input', () => {
  answerCharCount.textContent = answerInput.value.length;
});

async function loadFactoids() {
  try {
    const q = query(collection(db, "factoids"), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    const factoids = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    factoidCount.textContent = factoids.length;

    if (factoids.length === 0) {
      factoidList.innerHTML = `<p class="status-message empty">No factoids yet. Add your first one above!</p>`;
      return;
    }

    factoidList.innerHTML = factoids.map(f => {
      const createdDate = f.created_at ? new Date(f.created_at).toLocaleDateString() : 'N/A';
      const isActive = f.active !== false;
      const question = f.question || f.text || '';
      const answer = f.answer || '';
      
      return `
        <div class="admin-card factoid-card">
          <div class="factoid-content">
            <div class="factoid-question"><strong>Q:</strong> ${escapeHtml(question)}</div>
            ${answer ? `<div class="factoid-answer"><strong>A:</strong> ${escapeHtml(answer)}</div>` : ''}
          </div>
          <div class="factoid-meta">
            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
              ${isActive ? 'Active' : 'Inactive'}
            </span>
            <span>Created: ${createdDate}</span>
          </div>
          <div class="factoid-actions">
            <div class="toggle-wrapper">
              <label class="toggle-switch">
                <input type="checkbox" ${isActive ? 'checked' : ''} data-action="toggleActive" data-id="${f.id}" data-value="${isActive}">
                <span class="toggle-slider"></span>
              </label>
              <span class="toggle-label">Active</span>
            </div>
            <div class="button-group">
              <button class="btn btn-small btn-secondary" data-action="editFactoid" data-id="${f.id}" data-question="${escapeHtml(question).replace(/"/g, '&quot;')}" data-answer="${escapeHtml(answer).replace(/"/g, '&quot;')}">
                Edit
              </button>
              <button class="btn btn-small btn-danger" data-action="deleteFactoid" data-id="${f.id}">
                Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error("Error loading factoids:", error);
    factoidList.innerHTML = `<div class="error-box">Error loading factoids: ${error.message}</div>`;
  }
}

addForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (!question || !answer) {
    window.showToast('Please enter both question and answer.', 'info');
    return;
  }

  try {
    await addDoc(collection(db, "factoids"), {
      question: question,
      answer: answer,
      text: `${question} ${answer}`,
      active: true,
      created_at: new Date().toISOString()
    });

    addForm.reset();
    questionCharCount.textContent = '0';
    answerCharCount.textContent = '0';
    await loadFactoids();
    window.showToast('Factoid added!', 'success');
  } catch (error) {
    console.error("Error adding factoid:", error);
    window.showToast('Error adding factoid: ' + error.message, 'error');
  }
});

window.toggleActive = async (id, currentStatus) => {
  try {
    await updateDoc(doc(db, "factoids", id), { active: !currentStatus });
    await loadFactoids();
  } catch (error) {
    console.error("Error toggling active status:", error);
    window.showToast('Error updating active status: ' + error.message, 'error');
  }
};

window.editFactoid = async (id, currentQuestion, currentAnswer) => {
  const newQuestion = await window.showInputDialog(
    'Edit Question',
    'Update the question (150 characters max):',
    currentQuestion,
    { placeholder: 'Did you know...', confirmText: 'Next' }
  );
  
  if (newQuestion === null) return;
  
  const trimmedQuestion = newQuestion.trim();
  if (!trimmedQuestion) {
    window.showToast('Question cannot be empty.', 'info');
    return;
  }
  
  const newAnswer = await window.showInputDialog(
    'Edit Answer',
    'Update the answer (250 characters max):',
    currentAnswer,
    { placeholder: 'The answer...', confirmText: 'Save' }
  );
  
  if (newAnswer === null) return;
  
  const trimmedAnswer = newAnswer.trim();
  if (!trimmedAnswer) {
    window.showToast('Answer cannot be empty.', 'info');
    return;
  }

  try {
    await updateDoc(doc(db, "factoids", id), {
      question: trimmedQuestion,
      answer: trimmedAnswer,
      text: `${trimmedQuestion} ${trimmedAnswer}`
    });
    await loadFactoids();
    window.showToast('Factoid updated!', 'success');
  } catch (error) {
    console.error("Error updating factoid:", error);
    window.showToast('Error updating factoid: ' + error.message, 'error');
  }
};

window.deleteFactoid = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Delete Factoid', 'Are you sure you want to delete this factoid? This cannot be undone.', 'Delete', 'danger')
    : confirm('Are you sure you want to delete this factoid? This cannot be undone.');
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "factoids", id));
    await loadFactoids();
    window.showToast('Factoid deleted!', 'success');
  } catch (error) {
    console.error("Error deleting factoid:", error);
    window.showToast('Error deleting factoid: ' + error.message, 'error');
  }
};

masterToggle?.addEventListener('change', async (e) => {
  const setAllTo = e.target.checked;
  
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Toggle All Factoids', `Turn ${setAllTo ? 'ON' : 'OFF'} all factoids?`, setAllTo ? 'Turn On' : 'Turn Off', 'warning')
    : confirm(`Turn ${setAllTo ? 'ON' : 'OFF'} all factoids?`);
  if (!confirmed) {
    e.target.checked = !setAllTo;
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "factoids"));
    const updatePromises = snapshot.docs.map(docSnap => 
      updateDoc(doc(db, "factoids", docSnap.id), { active: setAllTo })
    );
    
    await Promise.all(updatePromises);
    await loadFactoids();
    window.showToast(`All factoids turned ${setAllTo ? 'ON' : 'OFF'}`, 'success');
  } catch (error) {
    console.error("Error toggling all factoids:", error);
    window.showToast('Error updating factoids: ' + error.message, 'error');
    e.target.checked = !setAllTo;
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

loadFactoids();

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  
  switch(action) {
    case 'editFactoid':
      const question = button.getAttribute('data-question');
      const answer = button.getAttribute('data-answer');
      if (typeof editFactoid === 'function') editFactoid(id, question, answer);
      break;
    case 'deleteFactoid':
      if (typeof deleteFactoid === 'function') deleteFactoid(id);
      break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('input[type="checkbox"][data-action="toggleActive"]')) {
    const id = e.target.getAttribute('data-id');
    const value = e.target.getAttribute('data-value') === 'true';
    if (typeof toggleActive === 'function') toggleActive(id, value);
  }
});
