import { requireAdmin } from '../../js/auth/access-control.js';
import { TASK_STATUSES, TASK_PRIORITIES, safeTaskLink, watchAdminTasks, saveAdminTask, setAdminTaskStatus } from '../../js/services/admin-tasks.js';
const el = id => document.getElementById(id);
let tasks = [], userId = '';
function message(text) { el('taskMessage').textContent = text; }
function resetEditor() { el('taskForm').reset(); el('taskId').value = ''; el('taskEditor').open = false; }
function editTask(task) {
  for (const [id,key] of [['taskId','id'],['taskTitle','title'],['taskNotes','notes'],['taskLink','link'],['taskPriority','priority'],['taskStatus','status']]) el(id).value = task[key] || '';
  el('taskEditor').open = true;
  el('taskTitle').focus();
}
function render() {
  el('activeTaskCount').textContent = tasks.filter(t => ['open','in_progress','blocked'].includes(t.status)).length;
  el('doneTaskCount').textContent = tasks.filter(t => t.status === 'done').length;
  const filter = el('taskFilter').value;
  const visible = tasks.filter(t => filter === 'all' ? t.status !== 'archived' : filter === 'active' ? ['open','in_progress','blocked'].includes(t.status) : t.status === filter);
  const list = el('taskList'); list.replaceChildren();
  el('taskEmpty').classList.toggle('hidden', visible.length > 0);
  for (const task of visible) {
    const card = document.createElement('article'); card.className = 'card mb-md';
    const heading = document.createElement('h2'); heading.className = 'gold'; heading.textContent = task.title;
    const priority = document.createElement('p'); priority.className = 'text-sm text-muted'; priority.textContent = (TASK_PRIORITIES[task.priority] || 'Normal') + ' priority';
    const notes = document.createElement('p'); notes.textContent = task.notes; notes.style.whiteSpace = 'pre-wrap';
    card.append(heading, priority, notes);
    const actions = document.createElement('div'); actions.className = 'btn-row mt-md';
    const link = safeTaskLink(task.link);
    if (link) { const a = document.createElement('a'); a.href = link; a.textContent = 'Open action'; a.className = 'btn btn-gold'; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.append(a); }
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.textContent = 'Edit'; edit.addEventListener('click', () => editTask(task)); actions.append(edit);
    const label = document.createElement('label'); label.textContent = 'Status '; label.htmlFor = 'status-' + task.id;
    const status = document.createElement('select'); status.id = label.htmlFor; status.className = 'input-dark'; status.setAttribute('aria-label', 'Status for ' + task.title);
    for (const [value,text] of Object.entries(TASK_STATUSES)) { const option=document.createElement('option'); option.value=value; option.textContent=text; status.append(option); }
    status.value = task.status;
    status.addEventListener('change', async () => {
      status.disabled = true;
      try { await setAdminTaskStatus(task.id, status.value); message('Status saved.'); }
      catch (error) { status.value = task.status; message('Could not save status. ' + error.message); }
      finally { status.disabled = false; }
    });
    label.append(status); actions.append(label); card.append(actions); list.append(card);
  }
}
requireAdmin((context, user) => {
  userId = user.uid;
  el('todoContent').classList.remove('hidden');
  message('Loading tasks…');
  const unsubscribe = watchAdminTasks(next => { tasks = next; render(); message('Tasks are up to date.'); }, error => message('Could not load tasks. Refresh to retry. ' + error.message));
  window.addEventListener('pagehide', unsubscribe, {once:true});
  el('taskFilter').addEventListener('change', render);
  el('cancelTask').addEventListener('click', resetEditor);
  el('taskForm').addEventListener('submit', async event => {
    event.preventDefault(); el('saveTask').disabled = true;
    try {
      await saveAdminTask(el('taskId').value, {title:el('taskTitle').value,notes:el('taskNotes').value,link:el('taskLink').value,priority:el('taskPriority').value,status:el('taskStatus').value}, userId);
      resetEditor(); message('Task saved.');
    } catch (error) { message('Could not save task. ' + error.message); }
    finally { el('saveTask').disabled = false; }
  });
});
