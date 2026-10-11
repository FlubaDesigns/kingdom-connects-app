import { db } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const money = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export function normalizeLedgerEntry(id, data) {
  return {...data, id, amount:money(data.amount ?? data.commission_amount),
    status:data.status || (data.commission_paid === true ? 'paid' : 'pending'),
    billing_date:data.billing_date || data.created_at, paid_at:data.paid_at || data.payment_date};
}
export async function loadCommissionLedger() {
  const snapshot = await getDocs(collection(db, 'commission_ledger'));
  return snapshot.docs.map(doc => normalizeLedgerEntry(doc.id, doc.data()));
}
export function ledgerTotals(entries) {
  return entries.reduce((totals, entry) => {
    if (entry.recipient_type) {
      if (['platform','kingdom_connect'].includes(entry.recipient_type)) totals.platform += entry.amount;
      else if (['church','charitable_fund'].includes(entry.recipient_type)) {
        totals.church += entry.amount;
        if (!entry.recipient_id || entry.recipient_type === 'charitable_fund') totals.charitable += entry.amount;
      } else totals.commissions += entry.amount;
    } else {
      // Older invoice-level ledger rows contain the split rather than a recipient amount.
      totals.platform += money(entry.platform_share);
      totals.commissions += money(entry.commission_amount);
      const tithe = money(entry.church_tithe ?? entry.tithe_amount);
      totals.church += tithe;
      if (!entry.church_id) totals.charitable += tithe;
    }
    return totals;
  }, {platform:0, commissions:0, church:0, charitable:0});
}
