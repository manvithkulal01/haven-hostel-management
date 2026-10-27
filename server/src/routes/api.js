const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/db');
const auth = require('../middleware/auth');
const { calculateDues } = require('../services/billing');

const r = express.Router();
const signed = auth();
const admin = auth(['admin']);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  next();
};
const positiveId = param('id').isInt({ min: 1 }).withMessage('A valid record ID is required');
const cleanError = (error) => {
  if (error.code === 'ER_DUP_ENTRY') return Object.assign(new Error('A record with those unique details already exists'), { status: 409 });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return Object.assign(new Error('The selected related record does not exist'), { status: 400 });
  return error;
};
const money = body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero');

r.post('/auth/login', [body('email').isEmail().normalizeEmail(), body('password').isString().isLength({ min: 8, max: 200 })], validate, wrap(async (req, res) => {
  const [rows] = await db.execute('SELECT u.id,u.email,u.password_hash,u.role,t.id tenant_id,t.full_name name,t.is_active FROM users u LEFT JOIN tenants t ON t.user_id=u.id WHERE u.email=? LIMIT 1', [req.body.email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(req.body.password, u.password_hash)) || (u.role === 'tenant' && !u.is_active)) return res.status(401).json({ error: 'Email or password is incorrect' });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(500).json({ error: 'Server authentication is not configured' });
  const user = { id: u.id, tenantId: u.tenant_id, role: u.role, name: u.name || 'Administrator', email: u.email };
  res.json({ token: jwt.sign(user, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }), user });
}));
r.get('/auth/me', signed, wrap(async (req, res) => {
  if (req.auth.role === 'admin') return res.json({ user: req.auth });
  const [rows] = await db.execute('SELECT id,full_name name,email,phone FROM tenants WHERE id=?', [req.auth.tenantId]);
  if (!rows.length) return res.status(404).json({ error: 'Tenant profile not found' });
  res.json({ user: { ...req.auth, ...rows[0] } });
}));

r.get('/dashboard', signed, wrap(async (req, res) => {
  if (req.auth.role === 'tenant') {
    const [alloc] = await db.execute(`SELECT a.id allocation_id,r.room_number,b.label bed_label,a.start_date,a.end_date,a.agreed_rent
      FROM allocations a JOIN beds b ON b.id=a.bed_id JOIN rooms r ON r.id=b.room_id
      WHERE a.tenant_id=? ORDER BY (a.end_date IS NULL) DESC,a.start_date DESC LIMIT 1`, [req.auth.tenantId]);
    const [payments] = await db.execute('SELECT COALESCE(SUM(amount),0) collected FROM rent_payments p JOIN allocations a ON a.id=p.allocation_id WHERE a.tenant_id=?', [req.auth.tenantId]);
    const [complaints] = await db.execute("SELECT COUNT(*) open_complaints FROM complaints WHERE tenant_id=? AND status<>'Resolved'", [req.auth.tenantId]);
    const dues = await calculateDues(db, req.auth.tenantId);
    return res.json({ currentAllocation: alloc.find((a) => !a.end_date) || null, latestAllocation: alloc[0] || null, totalPaid: Number(payments[0].collected), outstandingDues: dues.reduce((n, x) => n + x.due, 0), openComplaints: complaints[0].open_complaints });
  }
  const [summary] = await db.execute(`SELECT
    (SELECT COUNT(*) FROM allocations WHERE end_date IS NULL) active_tenants,
    (SELECT COUNT(*) FROM rooms WHERE is_active=1) total_rooms,
    (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id=b.room_id WHERE b.is_active=1 AND r.is_active=1) total_beds,
    (SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id=b.room_id WHERE b.is_active=1 AND r.is_active=1 AND EXISTS(SELECT 1 FROM allocations a WHERE a.bed_id=b.id AND a.end_date IS NULL)) occupied_beds,
    (SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE rent_period=DATE_FORMAT(CURDATE(),'%Y-%m')) monthly_collected,
    (SELECT COUNT(*) FROM complaints WHERE status<>'Resolved') open_complaints`);
  const dues = await calculateDues(db);
  const [[billing]] = await db.execute("SELECT COALESCE(SUM(a.agreed_rent),0) monthly_billed FROM allocations a WHERE a.start_date<=LAST_DAY(CURDATE()) AND (a.end_date IS NULL OR a.end_date>=DATE_FORMAT(CURDATE(),'%Y-%m-01'))");
  const currentDues = dues.reduce((n, x) => n + x.due, 0);
  const occupied = summary[0].occupied_beds;
  res.json({ activeTenants: summary[0].active_tenants, totalRooms: summary[0].total_rooms, totalBeds: summary[0].total_beds, occupiedBeds: occupied, availableBeds: summary[0].total_beds - occupied, monthlyCollected: Number(summary[0].monthly_collected), monthlyBilled: Number(billing.monthly_billed), outstandingDues: currentDues, openComplaints: summary[0].open_complaints, occupancyPercent: summary[0].total_beds ? Math.round(100 * occupied / summary[0].total_beds) : 0 });
}));

// Tenant management
r.get('/tenants', admin, wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim().slice(0, 100)}%`;
  const active = req.query.active;
  if (active !== undefined && !['true', 'false'].includes(active)) return res.status(400).json({ error: 'active must be true or false' });
  const [rows] = await db.execute(`SELECT t.id,t.full_name,t.email,t.phone,t.is_active,t.created_at,
      a.id active_allocation_id,r.room_number,b.label bed_label,a.agreed_rent
    FROM tenants t LEFT JOIN allocations a ON a.tenant_id=t.id AND a.end_date IS NULL
    LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN rooms r ON r.id=b.room_id
    WHERE (t.full_name LIKE ? OR t.email LIKE ? OR COALESCE(t.phone,'') LIKE ?) AND (? IS NULL OR t.is_active=?)
    ORDER BY t.full_name`, [q, q, q, active ?? null, active === undefined ? null : active === 'true']);
  res.json(rows);
}));
r.post('/tenants', admin, [body('full_name').trim().isLength({ min: 2, max: 120 }), body('email').isEmail().normalizeEmail(), body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }), body('password').isString().isLength({ min: 8, max: 200 })], validate, wrap(async (req, res) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [u] = await c.execute('INSERT INTO users(email,password_hash,role) VALUES(?,?,\'tenant\')', [req.body.email, await bcrypt.hash(req.body.password, 12)]);
    const [t] = await c.execute('INSERT INTO tenants(user_id,full_name,email,phone) VALUES(?,?,?,?)', [u.insertId, req.body.full_name, req.body.email, req.body.phone || null]);
    await c.commit(); res.status(201).json({ id: t.insertId });
  } catch (e) { await c.rollback(); throw cleanError(e); } finally { c.release(); }
}));
r.get('/tenants/:id', admin, [positiveId], validate, wrap(async (req, res) => {
  const [rows] = await db.execute(`SELECT t.id,t.full_name,t.email,t.phone,t.is_active,t.created_at FROM tenants t WHERE t.id=?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Tenant not found' });
  const [allocations] = await db.execute(`SELECT a.id,a.bed_id,r.room_number,b.label bed_label,a.start_date,a.end_date,a.agreed_rent FROM allocations a JOIN beds b ON b.id=a.bed_id JOIN rooms r ON r.id=b.room_id WHERE a.tenant_id=? ORDER BY a.start_date DESC`, [req.params.id]);
  const [payments] = await db.execute(`SELECT p.id,p.amount,p.payment_date,p.method,p.reference,p.rent_period FROM rent_payments p JOIN allocations a ON a.id=p.allocation_id WHERE a.tenant_id=? ORDER BY p.payment_date DESC`, [req.params.id]);
  res.json({ ...rows[0], allocations, payments });
}));
r.put('/tenants/:id', admin, [positiveId, body('full_name').trim().isLength({ min: 2, max: 120 }), body('email').isEmail().normalizeEmail(), body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 })], validate, wrap(async (req, res) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute('SELECT user_id FROM tenants WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await c.rollback(); return res.status(404).json({ error: 'Tenant not found' }); }
    await c.execute('UPDATE tenants SET full_name=?,email=?,phone=? WHERE id=?', [req.body.full_name, req.body.email, req.body.phone || null, req.params.id]);
    await c.execute('UPDATE users SET email=? WHERE id=?', [req.body.email, rows[0].user_id]);
    await c.commit(); res.json({ ok: true });
  } catch (e) { await c.rollback(); throw cleanError(e); } finally { c.release(); }
}));
r.patch('/tenants/:id/active', admin, [positiveId, body('is_active').isBoolean()], validate, wrap(async (req, res) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute('SELECT id,is_active FROM tenants WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await c.rollback(); return res.status(404).json({ error: 'Tenant not found' }); }
    if (!req.body.is_active) {
      const [active] = await c.execute('SELECT id FROM allocations WHERE tenant_id=? AND end_date IS NULL FOR UPDATE', [req.params.id]);
      if (active.length) { await c.rollback(); return res.status(409).json({ error: 'Check out this tenant before deactivation' }); }
    }
    await c.execute('UPDATE tenants SET is_active=? WHERE id=?', [req.body.is_active, req.params.id]);
    await c.commit(); res.json({ ok: true });
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}));

// Rooms and beds. A room is created independently; beds are managed via /beds.
r.get('/rooms', admin, wrap(async (req, res) => {
  const [rows] = await db.execute(`SELECT r.id,r.room_number,r.floor,r.is_active,COUNT(CASE WHEN b.is_active=1 THEN b.id END) total_beds,
    SUM(CASE WHEN b.is_active=1 AND a.id IS NOT NULL THEN 1 ELSE 0 END) occupied_beds,
    SUM(CASE WHEN b.id IS NOT NULL AND a.id IS NULL AND b.is_active=1 THEN 1 ELSE 0 END) available_beds
    FROM rooms r LEFT JOIN beds b ON b.room_id=r.id LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL
    GROUP BY r.id ORDER BY r.room_number`);
  res.json(rows);
}));
r.post('/rooms', admin, [body('room_number').trim().isLength({ min: 1, max: 20 }), body('floor').optional().isInt({ min: 0, max: 100 })], validate, wrap(async (req, res) => {
  const [out] = await db.execute('INSERT INTO rooms(room_number,floor) VALUES(?,?)', [req.body.room_number, req.body.floor ?? 0]); res.status(201).json({ id: out.insertId });
}));
r.get('/rooms/:id', admin, [positiveId], validate, wrap(async (req, res) => {
  const [rows] = await db.execute('SELECT id,room_number,floor,is_active,created_at FROM rooms WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Room not found' });
  const [beds] = await db.execute(`SELECT b.id,b.label,b.monthly_rent,b.is_active,CASE WHEN b.is_active=0 OR r.is_active=0 THEN 'Inactive' WHEN a.id IS NULL THEN 'Available' ELSE 'Occupied' END status,r.is_active room_is_active,a.tenant_id,t.full_name tenant_name
    FROM beds b JOIN rooms r ON r.id=b.room_id LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL LEFT JOIN tenants t ON t.id=a.tenant_id WHERE b.room_id=? ORDER BY b.label`, [req.params.id]);
  res.json({ ...rows[0], beds });
}));
r.put('/rooms/:id', admin, [positiveId, body('room_number').trim().isLength({ min: 1, max: 20 }), body('floor').isInt({ min: 0, max: 100 })], validate, wrap(async (req, res) => {
  const [exists] = await db.execute('SELECT id FROM rooms WHERE id=?', [req.params.id]); if (!exists.length) return res.status(404).json({ error: 'Room not found' });
  await db.execute('UPDATE rooms SET room_number=?,floor=? WHERE id=?', [req.body.room_number, req.body.floor, req.params.id]); res.json({ ok: true });
}));
r.patch('/rooms/:id/active', admin, [positiveId, body('is_active').isBoolean()], validate, wrap(async (req, res) => {
  const c = await db.getConnection(); try {
    await c.beginTransaction();
    const [found] = await c.execute('SELECT id FROM rooms WHERE id=? FOR UPDATE', [req.params.id]);
    if (!found.length) { await c.rollback(); return res.status(404).json({ error: 'Room not found' }); }
    if (!req.body.is_active) { const [active] = await c.execute('SELECT a.id FROM allocations a JOIN beds b ON b.id=a.bed_id WHERE b.room_id=? AND a.end_date IS NULL FOR UPDATE', [req.params.id]); if (active.length) { await c.rollback(); return res.status(409).json({ error: 'Room has active allocations' }); } }
    await c.execute('UPDATE rooms SET is_active=? WHERE id=?', [req.body.is_active, req.params.id]); await c.commit(); res.json({ ok: true });
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}));
r.get('/beds', admin, wrap(async (req, res) => {
  const [rows] = await db.execute(`SELECT b.id,b.room_id,r.room_number,b.label,b.monthly_rent,b.is_active,
    a.id active_allocation_id,a.tenant_id,t.full_name tenant_name,a.start_date,CASE WHEN b.is_active=0 OR r.is_active=0 THEN 'Inactive' WHEN a.id IS NULL THEN 'Available' ELSE 'Occupied' END status,r.is_active room_is_active
    FROM beds b JOIN rooms r ON r.id=b.room_id LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL LEFT JOIN tenants t ON t.id=a.tenant_id
    ORDER BY r.room_number,b.label`); res.json(rows);
}));
r.post('/beds', admin, [body('room_id').isInt({ min: 1 }), body('label').trim().isLength({ min: 1, max: 20 }), body('monthly_rent').isFloat({ gt: 0 })], validate, wrap(async (req, res) => {
  const c = await db.getConnection(); try {
    await c.beginTransaction();
    const [rooms] = await c.execute('SELECT id,is_active FROM rooms WHERE id=? FOR UPDATE', [req.body.room_id]);
    if (!rooms.length) { await c.rollback(); return res.status(404).json({ error: 'Room not found' }); }
    if (!rooms[0].is_active) { await c.rollback(); return res.status(409).json({ error: 'Cannot add a bed to an inactive room' }); }
    const [out] = await c.execute('INSERT INTO beds(room_id,label,monthly_rent) VALUES(?,?,?)', [req.body.room_id, req.body.label, req.body.monthly_rent]);
    await c.commit(); res.status(201).json({ id: out.insertId });
  } catch (e) { await c.rollback(); throw cleanError(e); } finally { c.release(); }
}));
r.put('/beds/:id', admin, [positiveId, body('label').trim().isLength({ min: 1, max: 20 }), body('monthly_rent').isFloat({ gt: 0 })], validate, wrap(async (req, res) => {
  const [rows] = await db.execute('SELECT id FROM beds WHERE id=?', [req.params.id]); if (!rows.length) return res.status(404).json({ error: 'Bed not found' });
  await db.execute('UPDATE beds SET label=?,monthly_rent=? WHERE id=?', [req.body.label, req.body.monthly_rent, req.params.id]); res.json({ ok: true });
}));
r.patch('/beds/:id/active', admin, [positiveId, body('is_active').isBoolean()], validate, wrap(async (req, res) => {
  const c = await db.getConnection(); try {
    await c.beginTransaction();
    const [rows] = await c.execute('SELECT id FROM beds WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await c.rollback(); return res.status(404).json({ error: 'Bed not found' }); }
    if (!req.body.is_active) { const [a] = await c.execute('SELECT id FROM allocations WHERE bed_id=? AND end_date IS NULL FOR UPDATE', [req.params.id]); if (a.length) { await c.rollback(); return res.status(409).json({ error: 'Check out the occupant before deactivating this bed' }); } }
    await c.execute('UPDATE beds SET is_active=? WHERE id=?', [req.body.is_active, req.params.id]); await c.commit(); res.json({ ok: true });
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}));

// Allocations; unique generated-column indexes remain the last concurrency guard.
r.get('/allocations', admin, wrap(async (req, res) => {
  const [rows] = await db.execute(`SELECT a.id,a.tenant_id,t.full_name tenant,a.bed_id,b.label bed_label,r.room_number,a.start_date,a.end_date,a.agreed_rent
    FROM allocations a JOIN tenants t ON t.id=a.tenant_id JOIN beds b ON b.id=a.bed_id JOIN rooms r ON r.id=b.room_id ORDER BY a.start_date DESC`); res.json(rows);
}));
r.post('/allocations', admin, [body('tenant_id').isInt({ min: 1 }), body('bed_id').isInt({ min: 1 }), body('start_date').isDate({ format: 'YYYY-MM-DD', strictMode: true }), body('agreed_rent').isFloat({ gt: 0 })], validate, wrap(async (req, res) => {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [ts] = await c.execute('SELECT id,is_active FROM tenants WHERE id=? FOR UPDATE', [req.body.tenant_id]);
    const [bs] = await c.execute('SELECT b.id,b.is_active,r.is_active room_active FROM beds b JOIN rooms r ON r.id=b.room_id WHERE b.id=? FOR UPDATE', [req.body.bed_id]);
    if (!ts.length || !ts[0].is_active) { await c.rollback(); return res.status(400).json({ error: 'Tenant not found or inactive' }); }
    const [[dbDate]] = await c.execute('SELECT CURDATE() today');
    if (req.body.start_date > dbDate.today) { await c.rollback(); return res.status(400).json({ error: 'Check-in date cannot be in the future' }); }
    if (!bs.length || !bs[0].is_active || !bs[0].room_active) { await c.rollback(); return res.status(400).json({ error: 'Bed or room not found or inactive' }); }
    const [active] = await c.execute('SELECT id FROM allocations WHERE tenant_id=? AND end_date IS NULL FOR UPDATE', [req.body.tenant_id]);
    if (active.length) { await c.rollback(); return res.status(409).json({ error: 'Tenant already has an active allocation' }); }
    const [occupied] = await c.execute('SELECT id FROM allocations WHERE bed_id=? AND end_date IS NULL FOR UPDATE', [req.body.bed_id]);
    if (occupied.length) { await c.rollback(); return res.status(409).json({ error: 'Bed is already occupied' }); }
    const [out] = await c.execute('INSERT INTO allocations(tenant_id,bed_id,start_date,agreed_rent) VALUES(?,?,?,?)', [req.body.tenant_id, req.body.bed_id, req.body.start_date, req.body.agreed_rent]);
    await c.commit(); res.status(201).json({ id: out.insertId });
  } catch (e) { await c.rollback(); if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Allocation conflicts with an active tenant or bed' }); throw cleanError(e); } finally { c.release(); }
}));
r.post('/allocations/:id/checkout', admin, [positiveId, body('end_date').isDate({ format: 'YYYY-MM-DD', strictMode: true })], validate, wrap(async (req, res) => {
  const c = await db.getConnection(); try {
    await c.beginTransaction();
    const [rows] = await c.execute('SELECT id,start_date,end_date FROM allocations WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await c.rollback(); return res.status(404).json({ error: 'Allocation not found' }); }
    if (rows[0].end_date) { await c.rollback(); return res.status(409).json({ error: 'Allocation is already checked out' }); }
    if (req.body.end_date < rows[0].start_date) { await c.rollback(); return res.status(400).json({ error: 'Checkout date cannot precede check-in' }); }
    const [[dbDate]] = await c.execute('SELECT CURDATE() today'); if (req.body.end_date > dbDate.today) { await c.rollback(); return res.status(400).json({ error: 'Checkout date cannot be in the future' }); }
    await c.execute('UPDATE allocations SET end_date=? WHERE id=?', [req.body.end_date, req.params.id]); await c.commit(); res.json({ ok: true });
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}));

// Rent, payment history, and dues use a single calendar-month rule (full month on any overlap).
r.get('/payments', admin, wrap(async (req, res) => { const [rows] = await db.execute(`SELECT p.id,p.allocation_id,t.full_name tenant,p.amount,p.payment_date,p.method,p.reference,p.rent_period
  FROM rent_payments p JOIN allocations a ON a.id=p.allocation_id JOIN tenants t ON t.id=a.tenant_id ORDER BY p.payment_date DESC,p.id DESC`); res.json(rows); }));
r.get('/payments/mine', signed, wrap(async (req, res) => {
  if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'Tenant account required' });
  const [rows] = await db.execute(`SELECT p.id,p.allocation_id,p.amount,p.payment_date,p.method,p.reference,p.rent_period FROM rent_payments p JOIN allocations a ON a.id=p.allocation_id WHERE a.tenant_id=? ORDER BY p.payment_date DESC,p.id DESC`, [req.auth.tenantId]); res.json(rows);
}));
r.post('/payments', admin, [body('allocation_id').isInt({ min: 1 }), money, body('payment_date').isDate({ format: 'YYYY-MM-DD', strictMode: true }), body('method').isIn(['Cash', 'Bank transfer', 'UPI', 'Card', 'Other']), body('reference').optional({ values: 'falsy' }).trim().isLength({ max: 100 }), body('rent_period').matches(/^\d{4}-(0[1-9]|1[0-2])$/)], validate, wrap(async (req, res) => {
  const c = await db.getConnection(); try {
    await c.beginTransaction();
    const [alloc] = await c.execute('SELECT id,tenant_id,start_date,end_date,agreed_rent FROM allocations WHERE id=? FOR UPDATE', [req.body.allocation_id]);
    if (!alloc.length) { await c.rollback(); return res.status(404).json({ error: 'Allocation not found' }); }
    const [[dbDate]] = await c.execute('SELECT CURDATE() today');
    if (req.body.payment_date > dbDate.today) { await c.rollback(); return res.status(400).json({ error: 'Payment date cannot be in the future' }); }
    const monthStart = `${req.body.rent_period}-01`;
    const monthEnd = new Date(Date.UTC(Number(req.body.rent_period.slice(0,4)), Number(req.body.rent_period.slice(5), 10), 0)).toISOString().slice(0, 10);
    if (req.body.payment_date.slice(0, 7) !== req.body.rent_period) { await c.rollback(); return res.status(400).json({ error: 'Payment date must be in the selected rent period' }); }
    if (req.body.payment_date < alloc[0].start_date || req.body.payment_date > (alloc[0].end_date || '9999-12-31')) { await c.rollback(); return res.status(400).json({ error: 'Payment date must fall within allocation dates' }); }
    if (alloc[0].start_date > monthEnd || (alloc[0].end_date && alloc[0].end_date < monthStart)) { await c.rollback(); return res.status(400).json({ error: 'Rent period does not overlap the allocation' }); }
    const [paid] = await c.execute('SELECT COALESCE(SUM(amount),0) total FROM rent_payments WHERE allocation_id=? AND rent_period=?', [req.body.allocation_id, req.body.rent_period]);
    const amount = Number(req.body.amount);
    if (Number(paid[0].total) + amount > Number(alloc[0].agreed_rent) + 0.0001) { await c.rollback(); return res.status(409).json({ error: 'Payment exceeds the remaining rent for this period' }); }
    const [out] = await c.execute('INSERT INTO rent_payments(allocation_id,amount,payment_date,method,reference,rent_period) VALUES(?,?,?,?,?,?)', [req.body.allocation_id, amount, req.body.payment_date, req.body.method, req.body.reference || null, req.body.rent_period]);
    await c.commit(); res.status(201).json({ id: out.insertId });
  } catch (e) { await c.rollback(); throw cleanError(e); } finally { c.release(); }
}));
r.get('/reports/dues', admin, wrap(async (req, res) => res.json(await calculateDues(db))));
r.get('/reports/occupancy', admin, wrap(async (req, res) => { const [rows] = await db.execute(`SELECT r.id room_id,r.room_number,r.floor,COUNT(b.id) total_beds,SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) occupied,SUM(CASE WHEN b.id IS NOT NULL AND a.id IS NULL THEN 1 ELSE 0 END) available,ROUND(100*SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END)/NULLIF(COUNT(b.id),0),1) occupancy_percent FROM rooms r LEFT JOIN beds b ON b.room_id=r.id AND b.is_active=1 LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL GROUP BY r.id ORDER BY r.room_number`); res.json(rows); }));
r.get('/reports/tenants', admin, wrap(async (req, res) => { const [rows] = await db.execute(`SELECT t.id,t.full_name,t.email,t.phone,t.is_active,COUNT(DISTINCT a.id) allocation_count,MAX(a.start_date) last_check_in,COALESCE(SUM(p.amount),0) total_paid FROM tenants t LEFT JOIN allocations a ON a.tenant_id=t.id LEFT JOIN rent_payments p ON p.allocation_id=a.id GROUP BY t.id ORDER BY t.full_name`); res.json(rows); }));
r.get('/reports/payments', admin, wrap(async (req, res) => { const [rows] = await db.execute('SELECT rent_period,COUNT(*) payment_count,SUM(amount) collected,AVG(amount) average_payment,MAX(amount) largest_payment FROM rent_payments GROUP BY rent_period ORDER BY rent_period DESC'); res.json(rows); }));
r.get('/reports/complaints', admin, wrap(async (req, res) => { const [rows] = await db.execute('SELECT status,priority,COUNT(*) total FROM complaints GROUP BY status,priority ORDER BY status,priority'); res.json(rows); }));
r.get('/reports', admin, wrap(async (req, res) => { const [rows] = await db.execute(`SELECT r.room_number,COUNT(b.id) total_beds,SUM(a.id IS NOT NULL) occupied,SUM(b.id IS NOT NULL AND b.is_active=1 AND a.id IS NULL) available FROM rooms r LEFT JOIN beds b ON b.room_id=r.id AND b.is_active=1 LEFT JOIN allocations a ON a.bed_id=b.id AND a.end_date IS NULL GROUP BY r.id ORDER BY r.room_number`); res.json(rows); }));

// Complaints are tenant-scoped by the authenticated token; tenant_id is never accepted from the client.
r.get('/complaints', signed, wrap(async (req, res) => {
  const isAdmin = req.auth.role === 'admin'; const params = [];
  let sql = `SELECT c.id,c.tenant_id,t.full_name tenant,c.category,c.description,c.priority,c.status,c.created_at,c.resolved_at,c.resolution_notes FROM complaints c JOIN tenants t ON t.id=c.tenant_id`;
  if (!isAdmin) { sql += ' WHERE c.tenant_id=?'; params.push(req.auth.tenantId); }
  sql += ' ORDER BY c.created_at DESC'; const [rows] = await db.execute(sql, params); res.json(rows);
}));
r.post('/complaints', signed, [body('category').trim().isLength({ min: 2, max: 80 }), body('description').trim().isLength({ min: 5, max: 2000 }), body('priority').isIn(['Low', 'Medium', 'High', 'Urgent'])], validate, wrap(async (req, res) => {
  if (req.auth.role !== 'tenant') return res.status(403).json({ error: 'Tenant account required' });
  const [out] = await db.execute('INSERT INTO complaints(tenant_id,category,description,priority) VALUES(?,?,?,?)', [req.auth.tenantId, req.body.category, req.body.description, req.body.priority]); res.status(201).json({ id: out.insertId });
}));
r.patch('/complaints/:id', admin, [positiveId, body('status').isIn(['Open', 'In Progress', 'Resolved']), body('resolution_notes').optional({ values: 'falsy' }).trim().isLength({ max: 2000 })], validate, wrap(async (req, res) => {
  const [rows] = await db.execute('SELECT id FROM complaints WHERE id=?', [req.params.id]); if (!rows.length) return res.status(404).json({ error: 'Complaint not found' });
  await db.execute('UPDATE complaints SET status=?,resolution_notes=?,resolved_at=IF(?=\'Resolved\',CURRENT_TIMESTAMP,NULL) WHERE id=?', [req.body.status, req.body.resolution_notes || null, req.body.status, req.params.id]); res.json({ ok: true });
}));

r.get('/maintenance', admin, wrap(async (req, res) => { const [rows] = await db.execute(`SELECT m.id,m.room_id,r.room_number,m.complaint_id,m.description,m.cost,m.completed_on,m.created_at FROM maintenance_records m JOIN rooms r ON r.id=m.room_id ORDER BY m.created_at DESC`); res.json(rows); }));
r.post('/maintenance', admin, [body('room_id').isInt({ min: 1 }), body('complaint_id').optional({ values: 'falsy' }).isInt({ min: 1 }), body('description').trim().isLength({ min: 3, max: 500 }), body('cost').isFloat({ min: 0 }), body('completed_on').optional({ values: 'falsy' }).isDate({ format: 'YYYY-MM-DD', strictMode: true })], validate, wrap(async (req, res) => { const [out] = await db.execute('INSERT INTO maintenance_records(room_id,complaint_id,description,cost,completed_on) VALUES(?,?,?,?,?)', [req.body.room_id, req.body.complaint_id || null, req.body.description, req.body.cost, req.body.completed_on || null]); res.status(201).json({ id: out.insertId }); }));

module.exports = r;
