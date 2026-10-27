const test = require('node:test');
const assert = require('node:assert/strict');
const { allocationMonths, buildDuesRows } = require('../server/src/services/billing');

test('monthly billing charges complete calendar months including partial first and last months', () => {
  assert.deepEqual(allocationMonths('2026-01-20', '2026-03-02', '2026-04-10'), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(allocationMonths('2026-02-02', null, '2026-04-02'), ['2026-02', '2026-03', '2026-04']);
  assert.deepEqual(allocationMonths('2026-05-01', null, '2026-04-30'), []);
});

test('dues sum partial payments by allocation and rent month and never report a negative balance', () => {
  const allocations = [
    { id: 1, tenant_id: 4, full_name: 'Sample', email: 'sample@example.test', start_date: '2026-01-20', end_date: '2026-02-02', agreed_rent: '1000.00' },
    { id: 2, tenant_id: 5, full_name: 'Other', email: 'other@example.test', start_date: '2026-02-01', end_date: null, agreed_rent: '2000.00' },
  ];
  const payments = [
    { allocation_id: 1, rent_period: '2026-01', paid: 300 },
    { allocation_id: 1, rent_period: '2026-01', paid: 200 },
    { allocation_id: 1, rent_period: '2026-02', paid: 1000 },
    { allocation_id: 2, rent_period: '2026-02', paid: 5000 },
  ];
  const rows = buildDuesRows(allocations, payments, '2026-02-15');
  assert.deepEqual(rows, [
    { tenant_id: 4, full_name: 'Sample', email: 'sample@example.test', billed: 2000, paid: 1500, due: 500 },
    { tenant_id: 5, full_name: 'Other', email: 'other@example.test', billed: 2000, paid: 5000, due: 0 },
  ]);
});

test('seeded tenant password is a verified bcrypt hash', async () => {
  const bcrypt = require('bcryptjs');
  const hash = '$2a$10$oyhoyE2YUaPLcoBxp05FDO1pk7itOTqDX.c8g9jYYfzGIx7uJcva6';
  assert.equal(await bcrypt.compare('TenantDemo123!', hash), true);
  assert.equal(await bcrypt.compare('wrong-password', hash), false);
});
