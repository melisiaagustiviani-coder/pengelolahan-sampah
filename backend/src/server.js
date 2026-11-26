require('dotenv').config();

const cors = require('cors');
const express = require('express');
const path = require('path');
const pool = require('./db');
const { ensureActivityLogsTable } = require('./activity-logs');
const apiRouter = require('./routes');

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRouter);

app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran foto maksimal 5 MB.'
      : 'Upload foto tidak berhasil.' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Data sudah terdaftar atau kode sudah digunakan.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'Pengguna atau laporan yang dipilih tidak ditemukan.' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ message: 'Data masih digunakan dan tidak dapat dihapus.' });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

async function start() {
  await ensureActivityLogsTable(pool);
  app.listen(port, () => {
    console.log(`Waste management API running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to initialize the database or start the API:', error);
  process.exitCode = 1;
});
