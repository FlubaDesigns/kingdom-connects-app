import { db } from '../firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function summarizeChurchTithes(records, now = new Date()) {
  const summary = { rows: [], total: 0, month: 0, year: 0, week: 0, notPaid: 0, monthly: {} };
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
  for (const record of records) {
    const amount = Number(record.tithe_amount);
    if (!Number.isFinite(amount)) throw Error('A tithe record contains an invalid amount.');
    const rawDate = record.created_at;
    const date = rawDate?.toDate ? rawDate.toDate() : rawDate?.seconds !== undefined ? new Date(rawDate.seconds * 1000) : new Date(rawDate);
    if (!rawDate || !Number.isFinite(date.getTime())) throw Error('A tithe record contains an invalid date.');
    const payoutStatus = record.payout_status === 'paid' ? 'paid' : 'recorded';
    summary.rows.push({ id: record.id, date, businessName: record.business_name || 'Business', proAmount: Number(record.amount_paid) || 0, churchAmount: amount, status: payoutStatus });
    summary.total += amount;
    if (payoutStatus !== 'paid') summary.notPaid += amount;
    const monthKey = date.getFullYear() + '-' + date.getMonth();
    summary.monthly[monthKey] = (summary.monthly[monthKey] || 0) + amount;
    if (date.getFullYear() === now.getFullYear()) {
      summary.year += amount;
      if (date.getMonth() === now.getMonth()) summary.month += amount;
    }
    if (date >= weekStart && date <= now) summary.week += amount;
  }
  summary.rows.sort((a,b) => b.date - a.date);
  return summary;
}

export async function fetchChurchTithes(churchId) {
  if (!churchId) throw Error('Choose a church first.');
  const snapshot = await getDocs(query(collection(db, 'tithes'), where('church_id', '==', churchId)));
  return summarizeChurchTithes(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
}
