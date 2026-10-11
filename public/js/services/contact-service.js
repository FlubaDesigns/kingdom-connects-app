export async function submitContact(values, user) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + await user.getIdToken();
  const response = await fetch('/api/contact', {
    method: 'POST', headers, body: JSON.stringify(values)
  });
  if (!response.ok) {
    const message = response.status === 429
      ? 'Too many messages. Please wait an hour before trying again.'
      : response.status === 400 ? 'Please check your contact details and message.'
      : response.status === 401 ? 'Please sign in again and retry your message.'
      : 'We could not save your message. Please try again.';
    throw Object.assign(new Error(message), { contactMessage: message });
  }
  return response.json();
}
