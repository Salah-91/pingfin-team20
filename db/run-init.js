// Eénmalige helper: voert db/init.sql uit op de gegeven MySQL.
// Gebruik:
//   node db/run-init.js                       (gebruikt env vars)
//   MYSQL_URL=mysql://... node db/run-init.js
//
// Vereist: npm install mysql2 in de api/ folder.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const url = process.env.MYSQL_URL || process.argv[2];
  let cfg;
  if (url) {
    const u = new URL(url);
    cfg = {
      host: u.hostname,
      port: parseInt(u.port, 10) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      multipleStatements: true,
      ssl: u.protocol === 'mysqls:' ? { rejectUnauthorized: false } : undefined,
    };
  } else {
    cfg = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || 3306, 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      multipleStatements: true,
    };
  }

  const sqlPath = process.env.SQL_FILE || path.resolve(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`[init] connect ${cfg.host}:${cfg.port} user=${cfg.user}`);
  const conn = await mysql.createConnection(cfg);
  console.log('[init] connected');

  // Splits op statements; mysql2 multipleStatements werkt, maar we voeren ook nog INSERT-blokken uit.
  await conn.query(sql);
  console.log('[init] init.sql uitgevoerd');

  // Verificatie
  const [dbs] = await conn.query("SHOW DATABASES LIKE 'pingfin\\_%'");
  console.log('[init] databases gevonden:', dbs.map(r => Object.values(r)[0]));

  for (const dbName of ['pingfin_b1', 'pingfin_b2']) {
    await conn.query(`USE \`${dbName}\``);
    const [tables] = await conn.query('SHOW TABLES');
    const [accs] = await conn.query('SELECT COUNT(*) AS n FROM accounts');
    console.log(`[init] ${dbName}: ${tables.length} tables, ${accs[0].n} accounts`);
  }

  await conn.end();
  console.log('[init] klaar.');
}

main().catch(err => { console.error('FOUT:', err.message); process.exit(1); });
