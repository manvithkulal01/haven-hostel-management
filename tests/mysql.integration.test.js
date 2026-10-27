// Opt-in integration test. Requires schema/views/routines/triggers/seed and `npm run admin`.
// It inserts a uniquely named tenant/room, then removes only those test-owned rows.
process.env.JWT_SECRET ||= 'mysql_integration_test_secret_at_least_32_chars';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/src/app');
const db = require('../server/src/config/db');
const enabled = process.env.MYSQL_INTEGRATION === '1';

test('MySQL-backed administrator and tenant workflows', { skip: !enabled }, async (t) => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `integration${suffix}@example.test`; const otherEmail = `other${suffix}@example.test`; const thirdEmail = `third${suffix}@example.test`;
  const roomNumber = `T${suffix}`.slice(-20);
  const tenantPassword = 'IntegrationTenant123!';
  let tenantId = null; let userId = null; let otherTenantId = null; let thirdTenantId = null; let roomId = null; let bedId = null; let maintenanceId = null; let allocationId = null; let raceAllocationId = null; let routineAllocationId = null;
  const request = async (path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    return { status: response.status, data };
  };
  try {
    const login = await request('/auth/login', { method: 'POST', body: { email: process.env.TEST_ADMIN_EMAIL || 'admin@haven.local', password: process.env.TEST_ADMIN_PASSWORD || 'ChangeMe123!' } });
    assert.equal(login.status, 200, `admin login failed: ${login.data.error || ''}`);
    const admin = login.data.token;
    assert.equal((await request('/auth/login', { method: 'POST', body: { email: process.env.TEST_ADMIN_EMAIL || 'admin@haven.local', password: 'incorrect-password' } })).status, 401);
    const createdTenant = await request('/tenants', { method: 'POST', token: admin, body: { full_name: 'Integration Tenant', email, phone: '+1 555 0100', password: tenantPassword } });
    assert.equal(createdTenant.status, 201); tenantId = createdTenant.data.id;
    assert.equal((await request('/tenants', { method: 'POST', token: admin, body: { full_name: 'Duplicate Tenant', email, phone: '', password: tenantPassword } })).status, 409);
    const tenantDetail = await request(`/tenants/${tenantId}`, { token: admin });
    assert.equal(tenantDetail.status, 200); assert.equal(tenantDetail.data.email, email);
    const searched = await request(`/tenants?q=${encodeURIComponent(suffix)}`, { token: admin }); assert.ok(searched.data.some(t => t.id === tenantId));
    assert.equal((await request(`/tenants/999999999`, { token: admin })).status, 404);
    const other = await request('/tenants', { method: 'POST', token: admin, body: { full_name: 'Other Integration Tenant', email: otherEmail, phone: '', password: tenantPassword } }); assert.equal(other.status, 201); otherTenantId = other.data.id;
    const third = await request('/tenants', { method: 'POST', token: admin, body: { full_name: 'Third Integration Tenant', email: thirdEmail, phone: '', password: tenantPassword } }); assert.equal(third.status, 201); thirdTenantId = third.data.id;
    assert.equal((await request(`/tenants/${tenantId}`, { method: 'PUT', token: admin, body: { full_name: 'Updated Integration Tenant', email, phone: '+1 555 0101' } })).status, 200);
    assert.equal((await request(`/tenants/${tenantId}`, { token: admin })).data.full_name, 'Updated Integration Tenant');
    const [users] = await db.execute('SELECT user_id FROM tenants WHERE id=?', [tenantId]); userId = users[0].user_id;
    const [[databaseToday]] = await db.execute('SELECT CURDATE() today'); const today = String(databaseToday.today).slice(0, 10); const period = today.slice(0, 7);
    const room = await request('/rooms', { method: 'POST', token: admin, body: { room_number: roomNumber, floor: 9 } }); assert.equal(room.status, 201); roomId = room.data.id;
    const bed = await request('/beds', { method: 'POST', token: admin, body: { room_id: roomId, label: 'A', monthly_rent: 12000 } }); assert.equal(bed.status, 201); bedId = bed.data.id;
    const bed2 = await request('/beds', { method: 'POST', token: admin, body: { room_id: roomId, label: 'B', monthly_rent: 12000 } }); assert.equal(bed2.status, 201);
    assert.equal((await request(`/rooms/${roomId}`, { method: 'PUT', token: admin, body: { room_number: roomNumber, floor: 8 } })).status, 200);
    assert.equal((await request(`/beds/${bedId}`, { method: 'PUT', token: admin, body: { label: 'A', monthly_rent: 12000 } })).status, 200);
    assert.equal((await request(`/rooms/${roomId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 200);
    assert.equal((await request('/beds', { method: 'POST', token: admin, body: { room_id: roomId, label: 'C', monthly_rent: 12000 } })).status, 409);
    assert.equal((await request(`/rooms/${roomId}/active`, { method: 'PATCH', token: admin, body: { is_active: true } })).status, 200);
    assert.equal((await request(`/rooms/${roomId}`, { token: admin })).data.beds.length, 2);
    const maintenance = await request('/maintenance', { method: 'POST', token: admin, body: { room_id: roomId, description: 'Integration maintenance record', cost: 0, completed_on: today } }); assert.equal(maintenance.status, 201); maintenanceId = maintenance.data.id;
    assert.ok((await request('/maintenance', { token: admin })).data.some(m => m.id === maintenanceId));
    const allocation = await request('/allocations', { method: 'POST', token: admin, body: { tenant_id: tenantId, bed_id: bedId, start_date: today, agreed_rent: 12000 } }); assert.equal(allocation.status, 201); allocationId = allocation.data.id;
    assert.equal((await request('/allocations', { method: 'POST', token: admin, body: { tenant_id: tenantId, bed_id: bedId, start_date: today, agreed_rent: 12000 } })).status, 409);
    assert.equal((await request('/allocations', { method: 'POST', token: admin, body: { tenant_id: tenantId, bed_id: bed2.data.id, start_date: today, agreed_rent: 12000 } })).status, 409);
    assert.equal((await request(`/beds/${bedId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 409);
    assert.equal((await request(`/rooms/${roomId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 409);
    const blockedDeactivation = await request(`/tenants/${tenantId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } }); assert.equal(blockedDeactivation.status, 409);
    assert.equal((await request('/allocations', { method: 'POST', token: admin, body: { tenant_id: otherTenantId, bed_id: bedId, start_date: today, agreed_rent: 12000 } })).status, 409);
    const race = await Promise.all([otherTenantId, thirdTenantId].map(id => request('/allocations', { method: 'POST', token: admin, body: { tenant_id: id, bed_id: bed2.data.id, start_date: today, agreed_rent: 12000 } })));
    assert.deepEqual(race.map(x => x.status).sort(), [201, 409]); raceAllocationId = race.find(x => x.status === 201).data.id;
    const allocationsAfterRace = await request('/allocations', { token: admin }); assert.equal(allocationsAfterRace.data.filter(x => x.bed_id === bed2.data.id && !x.end_date).length, 1); assert.equal(allocationsAfterRace.data.filter(x => x.tenant_id === tenantId && !x.end_date).length, 1);
    assert.equal((await request(`/allocations/${raceAllocationId}/checkout`, { method: 'POST', token: admin, body: { end_date: today } })).status, 200);
    // Run the stored procedures themselves against the same isolated records.
    const winnerIndex = race.findIndex(x => x.status === 201); const winnerTenant = winnerIndex === 0 ? otherTenantId : thirdTenantId;
    await db.execute('CALL sp_allocate_bed(?,?,?,?)', [winnerTenant, bed2.data.id, today, 12000]);
    const [[routineAlloc]] = await db.execute('SELECT id FROM allocations WHERE tenant_id=? AND bed_id=? AND end_date IS NULL', [winnerTenant, bed2.data.id]); routineAllocationId = routineAlloc.id;
    await db.execute('CALL sp_checkout(?,?)', [routineAllocationId, today]);
    const [[routineHistory]] = await db.execute('SELECT end_date FROM allocations WHERE id=?', [routineAllocationId]); assert.equal(String(routineHistory.end_date).slice(0, 10), today);
    const payment = (amount) => request('/payments', { method: 'POST', token: admin, body: { allocation_id: allocationId, amount, payment_date: today, method: 'UPI', reference: `INT-${suffix}-${amount}`, rent_period: period } });
    assert.equal((await payment(2000)).status, 201); assert.equal((await payment(2000)).status, 409); assert.equal((await payment(3000)).status, 201); assert.equal((await payment(8000)).status, 409); assert.equal((await payment(-1)).status, 400);
    assert.equal((await request('/payments', { method: 'POST', token: admin, body: { allocation_id: allocationId, amount: 100, payment_date: today, method: 'UPI', rent_period: '1999-01' } })).status, 400);
    await assert.rejects(db.execute("INSERT INTO rent_payments(allocation_id,amount,payment_date,method,reference,rent_period) VALUES(?,100,CURDATE(),'Cash',?,'1999-01')", [allocationId, `TRIGGER-${suffix}`]), error => error.code === 'ER_SIGNAL_EXCEPTION');
    const tenantLogin = await request('/auth/login', { method: 'POST', body: { email, password: tenantPassword } }); assert.equal(tenantLogin.status, 200); const tenantToken = tenantLogin.data.token;
    const ownPayments = await request('/payments/mine', { token: tenantToken }); assert.equal(ownPayments.status, 200); assert.equal(ownPayments.data.reduce((n,p) => n + Number(p.amount), 0), 5000); assert.ok(ownPayments.data.every(p => !Object.hasOwn(p, 'password_hash')));
    assert.equal((await request('/auth/me', { token: tenantToken })).data.user.email, email);
    assert.equal((await request('/complaints', { method: 'POST', token: tenantToken, body: { category: 'Plumbing', description: 'Leaking tap needs repair.', priority: 'High' } })).status, 201);
    const otherLogin = await request('/auth/login', { method: 'POST', body: { email: otherEmail, password: tenantPassword } }); assert.equal(otherLogin.status, 200);
    assert.equal((await request('/complaints', { method: 'POST', token: otherLogin.data.token, body: { category: 'Electrical', description: 'A light needs checking.', priority: 'Low' } })).status, 201);
    const ownComplaints = await request('/complaints', { token: tenantToken }); assert.equal(ownComplaints.status, 200); assert.equal(ownComplaints.data.length, 1); assert.equal(ownComplaints.data[0].tenant_id, tenantId);
    assert.equal((await request('/payments', { token: tenantToken })).status, 403);
    const complaintId = ownComplaints.data[0].id;
    assert.equal((await request(`/complaints/${complaintId}`, { method: 'PATCH', token: tenantToken, body: { status: 'Resolved' } })).status, 403);
    assert.equal((await request(`/complaints/${complaintId}`, { method: 'PATCH', token: admin, body: { status: 'Resolved', resolution_notes: 'Replaced washer.' } })).status, 200);
    const updatedComplaints = await request('/complaints', { token: tenantToken }); assert.equal(updatedComplaints.data[0].status, 'Resolved'); assert.equal(updatedComplaints.data[0].resolution_notes, 'Replaced washer.');
    const dues = await request('/reports/dues', { token: admin }); const dueRow = dues.data.find(x => x.tenant_id === tenantId); assert.equal(dueRow.due, 7000);
    assert.equal((await payment(7000)).status, 201);
    assert.equal((await request('/reports/dues', { token: admin })).data.find(x => x.tenant_id === tenantId).due, 0);
    const ownPaymentsAfterFull = await request('/payments/mine', { token: tenantToken }); assert.equal(ownPaymentsAfterFull.data.reduce((n,p) => n + Number(p.amount), 0), 12000);
    const tenantReport = await request('/reports/tenants', { token: admin }); assert.equal(Number(tenantReport.data.find(x => x.email === email).total_paid), 12000);
    const paymentReport = await request('/reports/payments', { token: admin }); assert.ok(Number(paymentReport.data.find(x => x.rent_period === period).collected) >= 12000);
    const complaintReport = await request('/reports/complaints', { token: admin }); assert.ok(complaintReport.data.some(x => x.status === 'Resolved'));
    assert.equal((await request('/reports/occupancy', { token: admin })).status, 200);
    const yesterday = new Date(`${today}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    assert.equal((await request(`/allocations/${allocationId}/checkout`, { method: 'POST', token: admin, body: { end_date: yesterday.toISOString().slice(0, 10) } })).status, 400);
    const checkout = await request(`/allocations/${allocationId}/checkout`, { method: 'POST', token: admin, body: { end_date: today } }); assert.equal(checkout.status, 200);
    const history = await request('/allocations', { token: admin }); assert.ok(history.data.some(x => x.id === allocationId && x.end_date));
    const inventory = await request('/beds', { token: admin }); assert.ok(inventory.data.some(x => x.id === bedId && x.status === 'Available'));
    assert.equal((await request(`/beds/${bedId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 200);
    assert.ok((await request('/beds', { token: admin })).data.some(x => x.id === bedId && x.status === 'Inactive'));
    assert.equal((await request(`/beds/${bedId}/active`, { method: 'PATCH', token: admin, body: { is_active: true } })).status, 200);
    assert.equal((await request(`/rooms/${roomId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 200);
    const occupancyReport = await request('/reports/occupancy', { token: admin }); assert.ok(occupancyReport.data.some(x => x.room_number === roomNumber && Number(x.occupied) === 0));
    assert.equal((await request(`/tenants/${tenantId}/active`, { method: 'PATCH', token: admin, body: { is_active: false } })).status, 200);
    assert.equal((await request('/dashboard', { token: tenantToken })).status, 401);
  } finally {
    try {
      if (allocationId) await db.execute('DELETE FROM rent_payments WHERE allocation_id=?', [allocationId]);
      if (maintenanceId) await db.execute('DELETE FROM maintenance_records WHERE id=?', [maintenanceId]);
      if (tenantId) await db.execute('DELETE FROM complaints WHERE tenant_id=?', [tenantId]);
      if (otherTenantId) await db.execute('DELETE FROM complaints WHERE tenant_id=?', [otherTenantId]);
      const createdTenantIds = [tenantId, otherTenantId, thirdTenantId].filter(Boolean);
      if (createdTenantIds.length) { const marks = createdTenantIds.map(() => '?').join(','); const [allocRows] = await db.execute(`SELECT id FROM allocations WHERE tenant_id IN (${marks})`, createdTenantIds); for (const row of allocRows) await db.execute('DELETE FROM rent_payments WHERE allocation_id=?', [row.id]); await db.execute(`DELETE FROM allocations WHERE tenant_id IN (${marks})`, createdTenantIds); }
      if (bedId) await db.execute('DELETE FROM beds WHERE room_id=?', [roomId]);
      if (roomId) await db.execute('DELETE FROM rooms WHERE id=?', [roomId]);
      if (tenantId) await db.execute('DELETE FROM tenants WHERE id=?', [tenantId]);
      for (const id of [otherTenantId, thirdTenantId].filter(Boolean)) { const [u] = await db.execute('SELECT user_id FROM tenants WHERE id=?', [id]); await db.execute('DELETE FROM tenants WHERE id=?', [id]); if (u[0]) await db.execute('DELETE FROM users WHERE id=?', [u[0].user_id]); }
      if (userId) await db.execute('DELETE FROM users WHERE id=?', [userId]);
    } finally { await new Promise(resolve => server.close(resolve)); await db.end(); }
  }
});
