require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes/api');
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use((req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err, req, res, next) => {
  const known = {
    ER_DUP_ENTRY: [409, 'A record with those unique details already exists'],
    ER_NO_REFERENCED_ROW_2: [400, 'A selected related record does not exist'],
    ER_ROW_IS_REFERENCED_2: [409, 'This record is still referenced by other records'],
    ER_CHECK_CONSTRAINT_VIOLATED: [400, 'A database constraint was not satisfied'],
  }[err.code];
  const status = err.status || known?.[0] || 500;
  if (status >= 500) console.error(err.message);
  res.status(status).json({ error: known?.[1] || (status < 500 ? err.message : 'Internal server error') });
});
module.exports = app;
