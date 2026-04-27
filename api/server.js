const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ ok: true, status: 200, message: 'PingFin Team 20 API running', data: null });
});

app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
