import { db } from '../firebase-config.js';
import { collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const TASK_STATUSES = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', deferred: 'Deferred', done: 'Done', archived: 'Archived' };
export const TASK_PRIORITIES = { high: 'High', normal: 'Normal', low: 'Low' };
export function safeTaskLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  try {
    const url = new URL(link, 'https://kingdom-commerce.web.app');
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}
export function taskValues(values) {
  const title = String(values.title || '').trim();
  const notes = String(values.notes || '').trim();
  const rawLink = String(values.link || '').trim();
  const link = safeTaskLink(rawLink);
  if (!title || title.length > 160) throw Error('Enter a title of 1–160 characters.');
  if (notes.length > 5000) throw Error('Keep notes under 5,000 characters.');
  if (rawLink && !link) throw Error('Use a valid HTTPS link or a page path.');
  if (link.length > 2000) throw Error('The action link is too long.');
  if (!Object.hasOwn(TASK_STATUSES, values.status) || !Object.hasOwn(TASK_PRIORITIES, values.priority)) throw Error('Choose a valid status and priority.');
  return { title, notes, link, status: values.status, priority: values.priority };
}
export function watchAdminTasks(onTasks, onError) {
  return onSnapshot(collection(db, 'admin_tasks'), snapshot => {
    const tasks = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    const priority = { high: 0, normal: 1, low: 2 };
    tasks.sort((a,b) => (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) || a.title.localeCompare(b.title));
    onTasks(tasks);
  }, onError);
}
export async function saveAdminTask(id, values, uid) {
  const data = { ...taskValues(values), updated_at: serverTimestamp() };
  if (id) await updateDoc(doc(db, 'admin_tasks', id), data);
  else await addDoc(collection(db, 'admin_tasks'), { ...data, created_at: serverTimestamp(), created_by: uid });
}
export async function setAdminTaskStatus(id, status) {
  if (!Object.hasOwn(TASK_STATUSES, status)) throw Error('Choose a valid status.');
  await updateDoc(doc(db, 'admin_tasks', id), { status, updated_at: serverTimestamp() });
}
