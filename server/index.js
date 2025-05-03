require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Retry logic helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// PostgreSQL pool config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create tables
const createTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name TEXT,
      phonenumber TEXT,
      email TEXT,
      comment TEXT
    );
  `);
  console.log('✅ Tables created or already exist');
};

// Endpoints
app.get('/', (req, res) => res.send('Hello World'));

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO users(username, password) VALUES($1, $2)', [username, hashed]);
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('❌ Error signing up user:', err.message);
    res.status(400).json({ error: 'User already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/contacts', async (req, res) => {
  const { name, phonenumber, email, comment } = req.body;
  try {
    await pool.query(
      'INSERT INTO contacts(name, phonenumber, email, comment) VALUES($1, $2, $3, $4)',
      [name, phonenumber, email, comment]
    );
    res.status(201).json({ message: 'Contact saved' });
  } catch (err) {
    console.error('❌ Error saving contact:', err.message);
    res.status(500).json({ error: 'Failed to save contact' });
  }
});

// Startup logic with retry
const startServer = async () => {
  let retries = 5;
  while (retries) {
    try {
      await pool.connect();
      console.log('✅ Connected to PostgreSQL');
      await createTables();
      app.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
      });
      return;
    } catch (err) {
      retries--;
      console.error(`❌ PostgreSQL not ready. Retries left: ${retries}`);
      await sleep(5000);
    }
  }

  console.error('🚫 Could not connect to PostgreSQL after retries.');
  process.exit(1);
};

startServer();
