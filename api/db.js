const sql = require('mssql');

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || 'yourpassword',
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'pingfin',
  options: { encrypt: false, trustServerCertificate: true },
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}

module.exports = { getPool, sql };
