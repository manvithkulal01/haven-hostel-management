const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const monthKey = (date) => String(date).slice(0, 7);

// Every calendar month that overlaps a stay is billed as one complete month.
function allocationMonths(start, end, today = new Date().toISOString().slice(0, 10)) {
  if (!start || start > today) return [];
  const last = end && end < today ? end : today;
  const [y, m] = start.slice(0, 7).split('-').map(Number);
  const [lastY, lastM] = last.slice(0, 7).split('-').map(Number);
  const out = [];
  for (let yy = y, mm = m; yy < lastY || (yy === lastY && mm <= lastM);) {
    out.push(`${yy}-${String(mm).padStart(2, '0')}`);
    if (++mm === 13) { mm = 1; yy++; }
  }
  return out;
}

function buildDuesRows(allocations, payments, today = new Date().toISOString().slice(0, 10)) {
  const paidBy = new Map();
  for (const p of payments) {
    const k = `${p.allocation_id}:${p.rent_period}`;
    paidBy.set(k, (paidBy.get(k) || 0) + Number(p.paid ?? p.amount ?? 0));
  }
  const byTenant = new Map();
  for (const a of allocations) {
    const row = byTenant.get(Number(a.tenant_id)) || { tenant_id: Number(a.tenant_id), full_name: a.full_name, email: a.email, billed: 0, paid: 0, due: 0 };
    for (const period of allocationMonths(a.start_date, a.end_date, today)) {
      row.billed += Number(a.agreed_rent);
      row.paid += paidBy.get(`${a.id}:${period}`) || 0;
    }
    byTenant.set(row.tenant_id, row);
  }
  return [...byTenant.values()].map(row => ({ ...row, billed: money(row.billed), paid: money(row.paid), due: money(Math.max(0, row.billed - row.paid)) })).sort((a,b) => b.due - a.due || a.full_name.localeCompare(b.full_name));
}

async function calculateDues(db, tenantId = null, today = null) {
  if (!today) { const [[current]] = await db.execute('SELECT CURDATE() today'); today = String(current.today).slice(0, 10); }
  const where = tenantId == null ? '' : ' AND a.tenant_id=?';
  const params = tenantId == null ? [today] : [today, tenantId];
  const [allocations] = await db.execute(`SELECT a.id,a.tenant_id,t.full_name,t.email,a.start_date,a.end_date,a.agreed_rent FROM allocations a JOIN tenants t ON t.id=a.tenant_id WHERE a.start_date<=?${where}`, params);
  if (!allocations.length) return [];
  const allocationIds = allocations.map(a => a.id);
  const marks = allocationIds.map(() => '?').join(',');
  const [payments] = await db.execute(`SELECT allocation_id,rent_period,SUM(amount) paid FROM rent_payments WHERE allocation_id IN (${marks}) GROUP BY allocation_id,rent_period`, allocationIds);
  return buildDuesRows(allocations, payments, today);
}

module.exports = { allocationMonths, buildDuesRows, calculateDues };
