require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect()
  .then(() => client.query('SELECT NOW()'))
  .then(res => {
    console.log('✅ Connected! Server time:', res.rows[0].now);
    client.end();
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
  });