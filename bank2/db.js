const mysql = require('mysql2/promise');

const pool = mysql.createPool({

                                host: process.env.DB2_HOST || 'mysql.railway.internal',

    port: parseInt(process.env.DB2_PORT) || 3306,

    user: process.env.DB2_USER || 'root',

    password: process.env.DB2_PASS || '',

    database: process.env.DB2_NAME || 'railway',

    waitForConnections: true,

    connectionLimit: 10,

});

module.exports = pool;
