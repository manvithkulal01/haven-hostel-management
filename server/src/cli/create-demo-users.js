require('dotenv').config();
const db = require('../config/db');
const bcrypt = require('bcryptjs');

(async () => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const temporaryPassword = 'ChangeMe123!';
    const demoAccounts = [
      ['admin@haven.local', 'admin', 'Demo Administrator'],
      ['tenant@haven.local', 'tenant', 'Demo Tenant'],
    ];
    for (const [email, role, name] of demoAccounts) {
      const hash = await bcrypt.hash(temporaryPassword, 12);
      await connection.execute(
        'INSERT INTO users(email,password_hash,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),role=VALUES(role)',
        [email, hash, role],
      );
      if (role === 'tenant') {
        const [[user]] = await connection.execute('SELECT id FROM users WHERE email=?', [email]);
        await connection.execute(
          'INSERT INTO tenants(user_id,full_name,email,phone) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name)',
          [user.id, name, email, '+91 90000 00000'],
        );
      }
    }
    await connection.commit();
    console.log('Demo accounts created or refreshed. The temporary password is documented in README; change it before use outside a local demo.');
  } catch (error) {
    await connection.rollback();
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await db.end();
  }
})();
