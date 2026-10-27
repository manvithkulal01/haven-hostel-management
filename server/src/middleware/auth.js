const jwt = require('jsonwebtoken');
const db = require('../config/db');
module.exports = (roles = []) => async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    if (!['admin', 'tenant'].includes(req.auth.role)) return res.status(403).json({ error: 'Invalid account role' });
    if (roles.length && !roles.includes(req.auth.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    if (req.auth.role === 'tenant') {
      const [rows] = await db.execute('SELECT is_active FROM tenants WHERE id=?', [req.auth.tenantId]);
      if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'Tenant account is inactive' });
    }
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Invalid or expired session' });
    next(e);
  }
};
