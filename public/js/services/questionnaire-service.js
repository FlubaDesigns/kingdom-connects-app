import { db } from '../firebase-config.js';
import { collection, getDocs, doc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Canonical schema, with legacy aliases accepted only at the read boundary.
export function normalizeQuestion(id, data) {
  const aliases = {multiple_choice:'select', checkboxes:'multiselect', yes_no:'yesno'};
  return {...data, id, audience:data.audience || 'church',
    question_type:aliases[data.question_type] || data.question_type || 'text',
    required:data.required ?? data.is_required ?? false, active:data.active !== false,
    placeholder:data.placeholder ?? data.help_text ?? '',
    options:Array.isArray(data.options) ? data.options : [], order:Number(data.order ?? data.order_index) || 0};
}
export async function loadQuestionnaireQuestions({audience, activeOnly=false} = {}) {
  const snapshot = await getDocs(collection(db, 'questionnaire_questions'));
  return snapshot.docs.map(item => normalizeQuestion(item.id, item.data()))
    .filter(question => (!audience || question.audience === audience) && (!activeOnly || question.active))
    .sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
}
export async function moveQuestionInAudience(questions, id, direction) {
  const ordered = [...questions], index = ordered.findIndex(question => question.id === id);
  const next = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || next < 0 || next >= ordered.length) return;
  [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
  const batch = writeBatch(db);
  ordered.forEach((question, order) => batch.update(doc(db, 'questionnaire_questions', question.id), {order}));
  await batch.commit();
}
