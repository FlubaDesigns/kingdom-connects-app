import { auth } from '../firebase-config.js';

export async function changeHierarchy(action, values = {}, providedUser = null) {
  const user = providedUser || auth.currentUser;
  if (!user) throw new Error('Please sign in first.');
  const response = await fetch('/api/hierarchy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ ...values, action })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to save this change.');
  return result;
}
