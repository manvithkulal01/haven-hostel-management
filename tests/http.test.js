process.env.JWT_SECRET = 'unit_test_secret_has_more_than_32_characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../server/src/app');
const db = require('../server/src/config/db');

test('health, protected access, and role boundaries respond over HTTP', async (t) => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const missing = await fetch(`${base}/api/not-a-route`); assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: 'API route not found' });
  const anonymous = await fetch(`${base}/api/tenants`);
  assert.equal(anonymous.status, 401);
  const tenantToken = jwt.sign({ id: 1, tenantId: 1, role: 'tenant' }, process.env.JWT_SECRET);
  const denied = await fetch(`${base}/api/tenants`, { headers: { Authorization: `Bearer ${tenantToken}` } });
  assert.equal(denied.status, 403);
  const bogusRole = jwt.sign({ id: 1, role: 'superuser' }, process.env.JWT_SECRET);
  const invalidRole = await fetch(`${base}/api/dashboard`, { headers: { Authorization: `Bearer ${bogusRole}` } });
  assert.equal(invalidRole.status, 403);
});
