import { auth } from '../firebase-config.js';
export const PARTNER_ID = 'kingdom-connects';
export const QRGEAR_WIDGET_URL = 'https://qrgear-c1ffd.web.app/widget';

export async function generateWidgetToken(entityType, entityData) {
  const entityId = entityType === 'member' ? entityData.uid || entityData.id : entityData.id;
  if (!['member', 'church', 'business'].includes(entityType) || !entityId) throw new Error('A permanent entity ID is required.');
  if (!auth.currentUser) throw new Error('Please sign in first.');
  const response = await fetch('/api/qr-widget-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    body: JSON.stringify({ entityType, entityId })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to prepare the store.');
  return result.token;
}

export function createWidgetEmbed(token) {
  const frame = document.createElement('iframe');
  frame.src = `${QRGEAR_WIDGET_URL}?token=${encodeURIComponent(token)}`;
  frame.title = 'QR Gear store';
  frame.width = '100%';
  frame.height = '480';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  return frame;
}

export async function embedQrGearWidget(target, entityType, entityData) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!element) throw new Error('Store container not found.');
  const token = await generateWidgetToken(entityType, entityData);
  element.replaceChildren(createWidgetEmbed(token));
  return true;
}
