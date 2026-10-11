import { requireAdmin } from './admin-auth-guard.js';
import { loadCommissionLedger, ledgerTotals } from '../../js/services/commission-ledger.js';
import { getAllBusinessesMerged } from '../../js/services/business-service.js';
import { isBusinessPro } from '../../js/role-utils.js';
import { escapeHtml } from '../../js/business-presentation.js';

let entries = [], businesses = [];
const element = id => document.getElementById(id);
const date = value => value?.toDate ? value.toDate().toLocaleDateString() : '—';
const money = value => '$' + value.toFixed(2);
requireAdmin(loadData);

async function loadData() {
  try {
    [entries, businesses] = await Promise.all([loadCommissionLedger(), getAllBusinessesMerged({throwOnError:true})]);
    const totals = ledgerTotals(entries);
    element('totalRevenue').textContent = money(totals.platform);
    element('totalCommissions').textContent = money(totals.commissions);
    element('totalTithes').textContent = money(totals.church);
    element('activeProBusiness').textContent = businesses.filter(isBusinessPro).length;
    element('monthlyRecurring').textContent = 'Unavailable';
    renderCommissions();
    renderProBusinesses();
    element('errorMessage').classList.add('hidden');
  } catch (error) {
    console.error('Error loading payment data:', error);
    element('errorMessage').classList.remove('hidden');
  } finally {
    element('commissionsLoading').classList.add('hidden');
    element('proLoading').classList.add('hidden');
  }
}
const businessName = entry => businesses.find(business => business.id === entry.business_id)?.business_name || entry.business_name || 'Direct payout';
function renderCommissions() {
  const filter = element('filterPaidStatus').value;
  const rows = entries.filter(entry => !filter || entry.status === filter)
    .sort((a,b) => (b.billing_date?.seconds || 0) - (a.billing_date?.seconds || 0));
  element('commissionsTableBody').innerHTML = rows.map(entry => `<tr>
    <td>${escapeHtml(businessName(entry))}</td>
    <td>${escapeHtml(entry.recipient_name || entry.referrer_display_name || entry.recipient_id || '—')}</td>
    <td>${escapeHtml(entry.recipient_type || 'Legacy allocation')}</td>
    <td>${money(entry.amount)}</td><td>${escapeHtml(entry.status)}</td>
    <td>${date(entry.billing_date)}</td><td>${date(entry.paid_at)}</td></tr>`).join('');
  element('commissionsContent').classList.toggle('hidden', !rows.length);
  element('commissionsEmpty').classList.toggle('hidden', !!rows.length);
}
function renderProBusinesses() {
  const pro = businesses.filter(isBusinessPro);
  element('proTableBody').innerHTML = pro.map(business => `<tr>
    <td>${escapeHtml(business.business_name)}</td><td>${escapeHtml(business.owner_email || '—')}</td>
    <td>${date(business.subscription_start || business.pro_start_date)}</td>
    <td>${date(business.pro_end_date)}</td><td>Active</td>
    <td>${escapeHtml(business.referrer_display_name || '—')}</td></tr>`).join('');
  element('proContent').classList.toggle('hidden', !pro.length);
  element('proEmpty').classList.toggle('hidden', !!pro.length);
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
element('filterPaidStatus').addEventListener('change', renderCommissions);
element('exportCommissions').addEventListener('click', () => {
  if (!entries.length) return window.showToast('No commissions to export', 'info');
  const rows = [['Business','Recipient','Type','Amount','Status','Date','Paid date'],
    ...entries.map(entry => [businessName(entry), entry.recipient_name || entry.recipient_id, entry.recipient_type,
      entry.amount.toFixed(2), entry.status, date(entry.billing_date), date(entry.paid_at)])];
  const url = URL.createObjectURL(new Blob([rows.map(row => row.map(csvCell).join(',')).join('\n')], {type:'text/csv'}));
  const link = document.createElement('a'); link.href = url;
  link.download = `kingdom-connects-ledger-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
});
document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab-button, .tab-content').forEach(item => item.classList.remove('active'));
  button.classList.add('active'); element(`tab-${button.dataset.tab}`).classList.add('active');
}));
