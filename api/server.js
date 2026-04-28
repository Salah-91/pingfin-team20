require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', require('./routes/info'));
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/po'));
app.use('/api', require('./routes/ack'));

app.get('/', (req, res) => {
  res.json({ ok: true, status: 200, message: 'PingFin Bank Team 20 API is running', data: null });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, status: 404, code: null, message: 'Endpoint not found', data: null });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
