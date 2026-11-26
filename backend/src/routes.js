const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const pool = require('./db');
const { recordActivity } = require('./activity-logs');
const { asyncHandler, requireUser, validateCoordinates, validateId } = require('./middleware');

const router = express.Router();
const adminPassword = process.env.ADMIN_PASSWORD || 'majukankebersihan';
const uploadDirectory = path.join(__dirname, '..', 'uploads');
const imageExtensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${imageExtensions[file.mimetype] || '.img'}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      const error = new Error('Foto harus berformat JPEG, PNG, WEBP, atau GIF.');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  }
});

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maxLength) {
    const error = new Error(`${label} wajib diisi (maksimal ${maxLength} karakter).`);
    error.status = 400;
    throw error;
  }
  return text;
}

async function recordExists(table, column, id) {
  const [rows] = await pool.execute(`SELECT ${column} FROM ${table} WHERE ${column} = ?`, [id]);
  return rows.length > 0;
}

function parseRoute(row) {
  const route = { ...row };
  let parsedBoundary = null;

  if (row.boundary_geojson) {
    if (typeof row.boundary_geojson === 'object') {
      parsedBoundary = row.boundary_geojson;
    } else if (typeof row.boundary_geojson === 'string') {
      try {
        parsedBoundary = JSON.parse(row.boundary_geojson);
      } catch {
        parsedBoundary = null;
      }
    }
  }

  route.boundary = parsedBoundary;
  delete route.boundary_geojson;
  return route;
}


function makePolygonWkt(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    const error = new Error('Batas rute harus memiliki minimal tiga titik.');
    error.status = 400;
    throw error;
  }
  const points = coordinates.map((point) => validateCoordinates(point.lng, point.lat));
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lng !== last.lng || first.lat !== last.lat) points.push(first);
  if (new Set(points.slice(0, -1).map((point) => `${point.lng},${point.lat}`)).size < 3) {
    const error = new Error('Batas rute harus memiliki minimal tiga titik yang berbeda.');
    error.status = 400;
    throw error;
  }
  return `POLYGON((${points.map(({ lng, lat }) => `${lng} ${lat}`).join(',')}))`;
}

function getImageUrl(filename) {
  return filename ? `/uploads/${encodeURIComponent(filename)}` : null;
}

router.post(['/auth/login', '/login'], asyncHandler(async (req, res) => {
  const fullName = requiredText(req.body.full_name, 'Nama lengkap', 100);
  const phone = requiredText(req.body.phone_number, 'Nomor telepon', 15);
  if (!/^[+0-9][0-9]{6,14}$/.test(phone)) {
    return res.status(400).json({ message: 'Nomor telepon tidak valid.' });
  }
  const loginMode = req.body.login_mode;
  const password = typeof req.body.password === 'string' ? req.body.password.trim() : '';
  if (!['RESIDENT', 'ADMIN'].includes(loginMode)) {
    return res.status(400).json({ message: 'Mode login tidak valid.' });
  }

  if (loginMode === 'ADMIN' || password) {
    if (password !== 'majukankebersihan') {
      return res.status(401).json({ message: 'Password admin salah.' });
    }

    const [existingAdmins] = await pool.execute(
      'SELECT user_id FROM users WHERE phone_number = ?',
      [phone]
    );

    if (existingAdmins.length > 0) {
      await pool.execute(
        "UPDATE users SET full_name = ?, role = 'ADMIN' WHERE phone_number = ?",
        [fullName, phone]
      );
    } else {
      await pool.execute(
        "INSERT INTO users (full_name, phone_number, role) VALUES (?, ?, 'ADMIN')",
        [fullName, phone]
      );
    }

    const [users] = await pool.execute(
      'SELECT user_id, full_name, phone_number, role FROM users WHERE phone_number = ?',
      [phone]
    );
    const user = users[0];

    await recordActivity(pool, user, 'LOGIN', 'Login Admin berhasil.');
    return res.json({
      user: { id: user.user_id, name: user.full_name, phone_number: user.phone_number, role: user.role }
    });
  }

  // Mode RESIDENT (Warga)
  const [existingResidents] = await pool.execute(
    'SELECT user_id FROM users WHERE phone_number = ?',
    [phone]
  );

  if (existingResidents.length > 0) {
    await pool.execute(
      "UPDATE users SET full_name = ?, role = 'RESIDENT' WHERE phone_number = ?",
      [fullName, phone]
    );
  } else {
    await pool.execute(
      "INSERT INTO users (full_name, phone_number, role) VALUES (?, ?, 'RESIDENT')",
      [fullName, phone]
    );
  }

  const [residentUsers] = await pool.execute(
    'SELECT user_id, full_name, phone_number, role FROM users WHERE phone_number = ?',
    [phone]
  );
  const residentUser = residentUsers[0];

  await recordActivity(pool, residentUser, 'LOGIN', 'Login Warga berhasil.');
  return res.json({
    user: {
      id: residentUser.user_id,
      name: residentUser.full_name,
      phone_number: residentUser.phone_number,
      role: residentUser.role
    }
  });
}));

router.get('/activity-logs', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const [logs] = await pool.execute(
    `SELECT log_id, user_id, actor_name, role, \`action\`, description, created_at
     FROM activity_logs ORDER BY created_at DESC LIMIT 50`
  );
  res.json(logs);
}));

router.get('/map/overview', requireUser(), asyncHandler(async (req, res) => {
  const [bins] = await pool.execute(
    `SELECT bin_id, bin_code, capacity, status, ST_X(location) AS lng, ST_Y(location) AS lat,
            created_at, created_by
     FROM waste_bins ORDER BY bin_id`
  );
  const [dumps] = await pool.execute(
    `SELECT d.dump_id, d.reported_by, d.description, d.status, d.photo_url, d.created_at,
            ST_X(d.location) AS lng, ST_Y(d.location) AS lat, u.full_name AS reporter_name
     FROM illegal_dumpsites d JOIN users u ON u.user_id = d.reported_by
     ORDER BY d.created_at DESC`
  );
  const routeQuery = `SELECT r.route_id, r.officer_id, r.route_name, r.schedule, r.created_at,
                             ST_AsGeoJSON(r.boundary) AS boundary_geojson,
                             u.full_name AS officer_name
                      FROM collection_routes r JOIN users u ON u.user_id = r.officer_id
                      ${req.user.role === 'OFFICER' ? 'WHERE r.officer_id = ?' : ''}
                      ORDER BY r.route_id`;
  const [routes] = req.user.role === 'OFFICER'
    ? await pool.execute(routeQuery, [req.user.user_id])
    : await pool.execute(routeQuery);
  res.json({
    bins,
    dumps: dumps.map((dump) => ({ ...dump, photo_url: getImageUrl(dump.photo_url) })),
    routes: routes.map(parseRoute)
  });
}));

router.get('/admin/stats', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const [[bins]] = await pool.query(
    `SELECT COUNT(*) AS total_bins,
            SUM(status = 'AVAILABLE') AS available_bins,
            SUM(status = 'FULL') AS full_bins,
            SUM(status = 'MAINTENANCE') AS maintenance_bins
     FROM waste_bins`
  );
  const [[dumps]] = await pool.query(
    `SELECT COUNT(*) AS total_reports,
            SUM(status = 'REPORTED') AS reported,
            SUM(status = 'IN_PROGRESS') AS in_progress,
            SUM(status = 'CLEANED') AS cleaned
     FROM illegal_dumpsites`
  );
  const [[users]] = await pool.query(
    `SELECT COUNT(*) AS total_users,
            SUM(role = 'RESIDENT') AS residents,
            SUM(role = 'OFFICER') AS officers
     FROM users`
  );
  res.json({ bins, dumps, users });
}));

router.get('/users', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const [users] = await pool.execute(
    'SELECT user_id, full_name, phone_number, role, created_at FROM users ORDER BY full_name'
  );
  res.json(users);
}));

router.post('/users', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const fullName = requiredText(req.body.full_name, 'Nama lengkap', 100);
  const phone = requiredText(req.body.phone_number, 'Nomor telepon', 15);
  const role = req.body.role;
  if (!/^[+0-9][0-9]{6,14}$/.test(phone) || !['RESIDENT', 'ADMIN'].includes(role)) {
    return res.status(400).json({ message: 'Nomor telepon atau role tidak valid.' });
  }
  const [existingUsers] = await pool.execute(
    'SELECT user_id FROM users WHERE phone_number = ? LIMIT 1',
    [phone]
  );
  if (existingUsers.length) return res.status(409).json({ message: 'Nomor telepon sudah digunakan.' });
  const [result] = await pool.execute(
    'INSERT INTO users (full_name, phone_number, role) VALUES (?, ?, ?)',
    [fullName, phone, role]
  );
  await recordActivity(pool, req.user, 'USER_CREATED', `Pengguna ${fullName} ditambahkan dengan role ${role}.`);
  res.status(201).json({ user_id: result.insertId, full_name: fullName, phone_number: phone, role });
}));

router.put('/users/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID pengguna');
  const fullName = requiredText(req.body.full_name, 'Nama lengkap', 100);
  const phone = requiredText(req.body.phone_number, 'Nomor telepon', 15);
  const role = req.body.role;
  if (!/^[+0-9][0-9]{6,14}$/.test(phone) || !['RESIDENT', 'ADMIN'].includes(role)) {
    return res.status(400).json({ message: 'Nomor telepon atau role tidak valid.' });
  }
  const [existingUsers] = await pool.execute(
    'SELECT user_id FROM users WHERE phone_number = ? AND user_id <> ? LIMIT 1',
    [phone, id]
  );
  if (existingUsers.length) return res.status(409).json({ message: 'Nomor telepon sudah digunakan.' });
  const [result] = await pool.execute(
    'UPDATE users SET full_name = ?, phone_number = ?, role = ? WHERE user_id = ?',
    [fullName, phone, role, id]
  );
  if (!result.affectedRows && !(await recordExists('users', 'user_id', id))) {
    return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
  }
  await recordActivity(pool, req.user, 'USER_UPDATED', `Data pengguna ${fullName} (ID ${id}) diperbarui.`);
  res.json({ user_id: id, full_name: fullName, phone_number: phone, role });
}));

router.delete('/users/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID pengguna');
  const [result] = await pool.execute('DELETE FROM users WHERE user_id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
  await recordActivity(pool, req.user, 'USER_DELETED', `Pengguna dengan ID ${id} dihapus.`);
  res.status(204).end();
}));

router.post('/bins', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const code = requiredText(req.body.bin_code, 'Kode kontainer', 20);
  const capacity = Number(req.body.capacity);
  const status = req.body.status || 'AVAILABLE';
  const point = validateCoordinates(req.body.lng, req.body.lat);
  if (!Number.isInteger(capacity) || capacity < 1 ||
      !['AVAILABLE', 'FULL', 'MAINTENANCE'].includes(status)) {
    return res.status(400).json({ message: 'Kapasitas atau status kontainer tidak valid.' });
  }
  const [existingBins] = await pool.execute(
    'SELECT bin_id FROM waste_bins WHERE bin_code = ? LIMIT 1',
    [code]
  );
  if (existingBins.length) return res.status(409).json({ message: 'Kode kontainer sudah digunakan.' });
  const [result] = await pool.execute(
    `INSERT INTO waste_bins (bin_code, capacity, status, location, created_by)
     VALUES (?, ?, ?, ST_GeomFromText(?), ?)`,
    [code, capacity, status, `POINT(${point.lng} ${point.lat})`, req.user.user_id]
  );
  await recordActivity(pool, req.user, 'BIN_CREATED', `Kontainer ${code} ditambahkan.`);
  res.status(201).json({ bin_id: result.insertId, bin_code: code, capacity, status, ...point });
}));

router.put('/bins/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID kontainer');
  const code = requiredText(req.body.bin_code, 'Kode kontainer', 20);
  const capacity = Number(req.body.capacity);
  const status = req.body.status;
  const point = validateCoordinates(req.body.lng, req.body.lat);
  if (!Number.isInteger(capacity) || capacity < 1 ||
      !['AVAILABLE', 'FULL', 'MAINTENANCE'].includes(status)) {
    return res.status(400).json({ message: 'Kapasitas atau status kontainer tidak valid.' });
  }
  const [existingBins] = await pool.execute(
    'SELECT bin_id FROM waste_bins WHERE bin_code = ? AND bin_id <> ? LIMIT 1',
    [code, id]
  );
  if (existingBins.length) return res.status(409).json({ message: 'Kode kontainer sudah digunakan.' });
  const [result] = await pool.execute(
    `UPDATE waste_bins SET bin_code = ?, capacity = ?, status = ?,
       location = ST_GeomFromText(?) WHERE bin_id = ?`,
    [code, capacity, status, `POINT(${point.lng} ${point.lat})`, id]
  );
  if (!result.affectedRows && !(await recordExists('waste_bins', 'bin_id', id))) {
    return res.status(404).json({ message: 'Kontainer tidak ditemukan.' });
  }
  await recordActivity(pool, req.user, 'BIN_UPDATED', `Data kontainer ${code} (ID ${id}) diperbarui.`);
  res.json({ bin_id: id, bin_code: code, capacity, status, ...point });
}));

router.patch('/bins/:id/status', requireUser('OFFICER'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID kontainer');
  const status = req.body.status;
  if (!['AVAILABLE', 'FULL', 'MAINTENANCE'].includes(status)) {
    return res.status(400).json({ message: 'Status kontainer tidak valid.' });
  }
  const [[bin]] = await pool.execute(
    'SELECT bin_code, status FROM waste_bins WHERE bin_id = ?',
    [id]
  );
  if (!bin) return res.status(404).json({ message: 'Kontainer tidak ditemukan.' });
  await pool.execute('UPDATE waste_bins SET status = ? WHERE bin_id = ?', [status, id]);
  if (bin.status !== status) {
    await recordActivity(
      pool,
      req.user,
      'BIN_STATUS_CHANGED',
      `Status kontainer ${bin.bin_code} berubah dari ${bin.status} menjadi ${status}.`
    );
  }
  res.json({ bin_id: id, status });
}));

router.delete('/bins/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID kontainer');
  const [[bin]] = await pool.execute('SELECT bin_code FROM waste_bins WHERE bin_id = ?', [id]);
  if (!bin) return res.status(404).json({ message: 'Kontainer tidak ditemukan.' });
  const [result] = await pool.execute('DELETE FROM waste_bins WHERE bin_id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Kontainer tidak ditemukan.' });
  await recordActivity(pool, req.user, 'BIN_DELETED', `Kontainer ${bin.bin_code} dihapus.`);
  res.status(204).end();
}));

router.get('/dumps/mine', requireUser('RESIDENT'), asyncHandler(async (req, res) => {
  const [dumps] = await pool.execute(
    `SELECT dump_id, description, status, photo_url, created_at,
            ST_X(location) AS lng, ST_Y(location) AS lat
     FROM illegal_dumpsites WHERE reported_by = ? ORDER BY created_at DESC`,
    [req.user.user_id]
  );
  res.json(dumps.map((dump) => ({ ...dump, photo_url: getImageUrl(dump.photo_url) })));
}));

router.post('/dumps', requireUser('RESIDENT'), upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Foto bukti wajib diunggah.' });
  const description = requiredText(req.body.description, 'Deskripsi', 2000);
  const point = validateCoordinates(req.body.lng, req.body.lat);
  const [result] = await pool.execute(
    `INSERT INTO illegal_dumpsites (reported_by, description, photo_url, location)
     VALUES (?, ?, ?, ST_GeomFromText(?))`,
    [req.user.user_id, description, req.file.filename, `POINT(${point.lng} ${point.lat})`]
  );
  await recordActivity(pool, req.user, 'DUMP_REPORTED', `TPS liar dilaporkan: ${description}`);
  res.status(201).json({
    dump_id: result.insertId,
    description,
    status: 'REPORTED',
    photo_url: getImageUrl(req.file.filename),
    ...point
  });
}));

router.patch('/dumps/:id/status', requireUser('OFFICER'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID laporan');
  if (req.body.status !== 'IN_PROGRESS') {
    return res.status(400).json({ message: 'Petugas hanya dapat memulai penanganan laporan.' });
  }
  const [result] = await pool.execute(
    `UPDATE illegal_dumpsites SET status = 'IN_PROGRESS'
     WHERE dump_id = ? AND status = 'REPORTED'`,
    [id]
  );
  if (!result.affectedRows) return res.status(409).json({ message: 'Laporan tidak ditemukan atau sudah diproses.' });
  await recordActivity(pool, req.user, 'DUMP_STATUS_CHANGED', `Laporan TPS liar #${id} mulai ditangani.`);
  res.json({ dump_id: id, status: 'IN_PROGRESS' });
}));

router.get('/cleanup-reports', requireUser('OFFICER', 'ADMIN'), asyncHandler(async (req, res) => {
  const [reports] = await pool.execute(
    `SELECT c.report_id, c.dump_id, c.officer_id, c.cleaned_at, c.notes,
            d.description AS dump_description, u.full_name AS officer_name
     FROM cleanup_reports c
     JOIN illegal_dumpsites d ON d.dump_id = c.dump_id
     JOIN users u ON u.user_id = c.officer_id
     ${req.user.role === 'OFFICER' ? 'WHERE c.officer_id = ?' : ''}
     ORDER BY c.cleaned_at DESC`,
    req.user.role === 'OFFICER' ? [req.user.user_id] : []
  );
  res.json(reports);
}));

router.post('/cleanup-reports', requireUser('OFFICER'), asyncHandler(async (req, res) => {
  const dumpId = validateId(req.body.dump_id, 'ID laporan');
  const notes = requiredText(req.body.notes, 'Catatan pembersihan', 2000);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [dumps] = await connection.execute(
      'SELECT status FROM illegal_dumpsites WHERE dump_id = ? FOR UPDATE',
      [dumpId]
    );
    if (!dumps.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Laporan tidak ditemukan.' });
    }
    if (dumps[0].status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(409).json({ message: 'Laporan harus berstatus IN_PROGRESS sebelum diselesaikan.' });
    }
    const [result] = await connection.execute(
      'INSERT INTO cleanup_reports (dump_id, officer_id, notes) VALUES (?, ?, ?)',
      [dumpId, req.user.user_id, notes]
    );
    await connection.execute(
      `UPDATE illegal_dumpsites SET status = 'CLEANED' WHERE dump_id = ?`,
      [dumpId]
    );
    await recordActivity(
      pool,
      req.user,
      'CLEANUP_COMPLETED',
      `Laporan TPS liar #${dumpId} selesai dibersihkan. ${notes}`,
      connection
    );
    await connection.commit();
    res.status(201).json({ report_id: result.insertId, dump_id: dumpId, status: 'CLEANED', notes });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/routes', requireUser(), asyncHandler(async (req, res) => {
  const query = `SELECT r.route_id, r.officer_id, r.route_name, r.schedule, r.created_at,
                        ST_AsGeoJSON(r.boundary) AS boundary_geojson,
                        u.full_name AS officer_name
                 FROM collection_routes r JOIN users u ON u.user_id = r.officer_id
                 ${req.user.role === 'OFFICER' ? 'WHERE r.officer_id = ?' : ''}
                 ORDER BY r.route_id`;
  const [routes] = req.user.role === 'OFFICER'
    ? await pool.execute(query, [req.user.user_id])
    : await pool.execute(query);
  res.json(routes.map(parseRoute));
}));

router.post('/routes', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const name = requiredText(req.body.route_name, 'Nama rute', 100);
  const schedule = requiredText(req.body.schedule, 'Jadwal', 50);
  const officerId = validateId(req.body.officer_id, 'ID petugas');
  const boundary = makePolygonWkt(req.body.coordinates);
  const [officers] = await pool.execute(
    'SELECT user_id FROM users WHERE user_id = ? AND role = ?',
    [officerId, 'OFFICER']
  );
  if (!officers.length) return res.status(400).json({ message: 'Petugas rute tidak ditemukan.' });
  const [result] = await pool.execute(
    `INSERT INTO collection_routes (officer_id, route_name, schedule, boundary)
     VALUES (?, ?, ?, ST_GeomFromText(?))`,
    [officerId, name, schedule, boundary]
  );
  await recordActivity(pool, req.user, 'ROUTE_CREATED', `Rute ${name} ditambahkan.`);
  res.status(201).json({ route_id: result.insertId, officer_id: officerId, route_name: name, schedule });
}));

router.put('/routes/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID rute');
  const name = requiredText(req.body.route_name, 'Nama rute', 100);
  const schedule = requiredText(req.body.schedule, 'Jadwal', 50);
  const officerId = validateId(req.body.officer_id, 'ID petugas');
  const boundary = makePolygonWkt(req.body.coordinates);
  const [officers] = await pool.execute(
    'SELECT user_id FROM users WHERE user_id = ? AND role = ?',
    [officerId, 'OFFICER']
  );
  if (!officers.length) return res.status(400).json({ message: 'Petugas rute tidak ditemukan.' });
  const [result] = await pool.execute(
    `UPDATE collection_routes SET officer_id = ?, route_name = ?, schedule = ?,
       boundary = ST_GeomFromText(?) WHERE route_id = ?`,
    [officerId, name, schedule, boundary, id]
  );
  if (!result.affectedRows && !(await recordExists('collection_routes', 'route_id', id))) {
    return res.status(404).json({ message: 'Rute tidak ditemukan.' });
  }
  await recordActivity(pool, req.user, 'ROUTE_UPDATED', `Data rute ${name} (ID ${id}) diperbarui.`);
  res.json({ route_id: id, officer_id: officerId, route_name: name, schedule });
}));

router.delete('/routes/:id', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const id = validateId(req.params.id, 'ID rute');
  const [[route]] = await pool.execute('SELECT route_name FROM collection_routes WHERE route_id = ?', [id]);
  if (!route) return res.status(404).json({ message: 'Rute tidak ditemukan.' });
  const [result] = await pool.execute('DELETE FROM collection_routes WHERE route_id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Rute tidak ditemukan.' });
  await recordActivity(pool, req.user, 'ROUTE_DELETED', `Rute ${route.route_name} dihapus.`);
  res.status(204).end();
}));
function formatBillingMonthDate(monthInput) {
  if (typeof monthInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(monthInput.trim())) {
    return monthInput.trim();
  }
  if (typeof monthInput === 'string' && /^\d{4}-\d{2}$/.test(monthInput.trim())) {
    return `${monthInput.trim()}-01`;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

router.get('/bills/mine', requireUser('RESIDENT'), asyncHandler(async (req, res) => {
  const [bills] = await pool.execute(
    `SELECT b.bill_id, b.resident_id, b.billing_month, b.amount, b.due_date, b.status, b.bill_description,
            p.payment_id, p.payment_method, p.payment_status, p.proof_url, p.payment_reference, p.notes, p.paid_at, p.verified_at
     FROM monthly_bills b
     LEFT JOIN payments p ON p.payment_id = (
       SELECT p2.payment_id FROM payments p2 WHERE p2.bill_id = b.bill_id ORDER BY p2.payment_id DESC LIMIT 1
     )
     WHERE b.resident_id = ?
     ORDER BY b.billing_month DESC, b.bill_id DESC`,
    [req.user.user_id]
  );
  res.json(bills.map((bill) => ({
    ...bill,
    proof_url: getImageUrl(bill.proof_url)
  })));
}));

router.post('/bills/:billId/pay', requireUser('RESIDENT'), upload.single('proof'), asyncHandler(async (req, res) => {
  const billId = validateId(req.params.billId, 'ID tagihan');
  const channel = String(req.body.channel || '').toUpperCase();
  if (!['QRIS', 'TRANSFER', 'CASH'].includes(channel)) {
    return res.status(400).json({ message: 'Metode pembayaran tidak valid.' });
  }
  const dbMethod = channel === 'CASH' ? 'CASH' : 'TRANSFER_QRIS';
  const reference = typeof req.body.payment_reference === 'string' ? req.body.payment_reference.trim() : '';
  const extraNote = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  if (dbMethod === 'TRANSFER_QRIS' && !req.file) {
    return res.status(400).json({ message: 'Bukti pembayaran wajib diunggah untuk QRIS atau Transfer.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [bills] = await connection.execute(
      'SELECT bill_id, resident_id, amount, status FROM monthly_bills WHERE bill_id = ? AND resident_id = ? FOR UPDATE',
      [billId, req.user.user_id]
    );
    if (!bills.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tagihan tidak ditemukan.' });
    }
    const bill = bills[0];
    if (bill.status === 'PAID') {
      await connection.rollback();
      return res.status(409).json({ message: 'Tagihan ini sudah lunas.' });
    }
    if (bill.status === 'PENDING') {
      await connection.rollback();
      return res.status(409).json({ message: 'Pembayaran sebelumnya sedang menunggu ACC Admin.' });
    }

    const combinedNotes = [
      `Metode: ${channel}`,
      extraNote || null
    ].filter(Boolean).join(' | ') || null;

    const [payResult] = await connection.execute(
      `INSERT INTO payments
         (bill_id, payment_method, amount, payment_status, proof_url, payment_reference, notes, paid_at)
       VALUES (?, ?, ?, 'PENDING', ?, ?, ?, NOW())`,
      [
        bill.bill_id,
        dbMethod,
        bill.amount,
        req.file ? req.file.filename : null,
        reference || null,
        combinedNotes
      ]
    );

    await connection.execute(
      "UPDATE monthly_bills SET status = 'PENDING' WHERE bill_id = ?",
      [bill.bill_id]
    );

    await recordActivity(
      pool,
      req.user,
      'PAYMENT_SUBMITTED',
      `Mengajukan pembayaran tagihan #${bill.bill_id} via ${channel} (menunggu ACC Admin).`,
      connection
    );

    await connection.commit();
    res.status(201).json({
      payment_id: payResult.insertId,
      bill_id: bill.bill_id,
      status: 'PENDING',
      payment_method: dbMethod,
      proof_url: req.file ? getImageUrl(req.file.filename) : null
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/admin/payments', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.payment_id, p.bill_id, p.payment_method, p.amount, p.payment_status,
            p.proof_url, p.payment_reference, p.notes, p.paid_at, p.verified_at, p.created_at,
            b.billing_month, b.bill_description, b.status AS bill_status,
            u.user_id AS resident_id, u.full_name AS resident_name, u.phone_number
     FROM payments p
     JOIN monthly_bills b ON b.bill_id = p.bill_id
     JOIN users u ON u.user_id = b.resident_id
     ORDER BY FIELD(p.payment_status, 'PENDING', 'VERIFIED', 'REJECTED'), p.created_at DESC`
  );
  res.json(rows.map((row) => ({
    ...row,
    proof_url: getImageUrl(row.proof_url)
  })));
}));

router.post('/admin/bills/generate', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const billingMonth = formatBillingMonthDate(req.body.billing_month);
  const amount = Number(req.body.amount);
  const description = typeof req.body.bill_description === 'string' && req.body.bill_description.trim()
    ? req.body.bill_description.trim()
    : `Iuran kebersihan bulanan (${billingMonth.slice(0, 7)})`;
  const dueDate = typeof req.body.due_date === 'string' && req.body.due_date.trim() ? req.body.due_date.trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Nominal tagihan harus lebih dari 0.' });
  }

  const [residents] = await pool.execute("SELECT user_id FROM users WHERE role = 'RESIDENT'");
  let createdCount = 0;
  for (const resident of residents) {
    const [result] = await pool.execute(
      `INSERT IGNORE INTO monthly_bills
         (resident_id, billing_month, amount, due_date, status, bill_description, created_by)
       VALUES (?, ?, ?, ?, 'UNPAID', ?, ?)`,
      [resident.user_id, billingMonth, amount, dueDate, description, req.user.user_id]
    );
    if (result.affectedRows > 0) createdCount += 1;
  }

  await recordActivity(
    pool,
    req.user,
    'BILLS_GENERATED',
    `Membuat ${createdCount} tagihan bulanan (${billingMonth.slice(0, 7)}) sebesar Rp ${amount}.`
  );

  res.status(201).json({ created_count: createdCount, billing_month: billingMonth });
}));

router.patch('/admin/payments/:paymentId/verify', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const paymentId = validateId(req.params.paymentId, 'ID pembayaran');
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return res.status(400).json({ message: 'Keputusan verifikasi tidak valid.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      'SELECT payment_id, bill_id, payment_status FROM payments WHERE payment_id = ? FOR UPDATE',
      [paymentId]
    );
    if (!payments.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Data pembayaran tidak ditemukan.' });
    }
    const payment = payments[0];

    const nextPaymentStatus = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const nextBillStatus = decision === 'APPROVE' ? 'PAID' : 'UNPAID';

    await connection.execute(
      `UPDATE payments
       SET payment_status = ?, verified_by = ?, verified_at = NOW()
       WHERE payment_id = ?`,
      [nextPaymentStatus, req.user.user_id, paymentId]
    );

    await connection.execute(
      'UPDATE monthly_bills SET status = ? WHERE bill_id = ?',
      [nextBillStatus, payment.bill_id]
    );

    await recordActivity(
      pool,
      req.user,
      decision === 'APPROVE' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      `${decision === 'APPROVE' ? 'ACC (Verifikasi)' : 'Menolak'} pembayaran #${paymentId} untuk tagihan #${payment.bill_id}.`,
      connection
    );

    await connection.commit();
    res.json({ payment_id: paymentId, payment_status: nextPaymentStatus, bill_status: nextBillStatus });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
function formatBillingMonthDate(monthInput) {
  if (typeof monthInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(monthInput.trim())) {
    return monthInput.trim();
  }
  if (typeof monthInput === 'string' && /^\d{4}-\d{2}$/.test(monthInput.trim())) {
    return `${monthInput.trim()}-01`;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

router.get('/bills/mine', requireUser('RESIDENT'), asyncHandler(async (req, res) => {
  const [bills] = await pool.execute(
    `SELECT b.bill_id, b.resident_id, b.billing_month, b.amount, b.due_date, b.status, b.bill_description,
            p.payment_id, p.payment_method, p.payment_status, p.proof_url, p.payment_reference, p.notes, p.paid_at, p.verified_at
     FROM monthly_bills b
     LEFT JOIN payments p ON p.payment_id = (
       SELECT p2.payment_id FROM payments p2 WHERE p2.bill_id = b.bill_id ORDER BY p2.payment_id DESC LIMIT 1
     )
     WHERE b.resident_id = ?
     ORDER BY b.billing_month DESC, b.bill_id DESC`,
    [req.user.user_id]
  );
  res.json(bills.map((bill) => ({
    ...bill,
    proof_url: getImageUrl(bill.proof_url)
  })));
}));

router.post('/bills/:billId/pay', requireUser('RESIDENT'), upload.single('proof'), asyncHandler(async (req, res) => {
  const billId = validateId(req.params.billId, 'ID tagihan');
  const channel = String(req.body.channel || '').toUpperCase();
  if (!['QRIS', 'TRANSFER', 'CASH'].includes(channel)) {
    return res.status(400).json({ message: 'Metode pembayaran tidak valid.' });
  }
  const dbMethod = channel === 'CASH' ? 'CASH' : 'TRANSFER_QRIS';
  const reference = typeof req.body.payment_reference === 'string' ? req.body.payment_reference.trim() : '';
  const extraNote = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  if (dbMethod === 'TRANSFER_QRIS' && !req.file) {
    return res.status(400).json({ message: 'Bukti pembayaran wajib diunggah untuk QRIS atau Transfer.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [bills] = await connection.execute(
      'SELECT bill_id, resident_id, amount, status FROM monthly_bills WHERE bill_id = ? AND resident_id = ? FOR UPDATE',
      [billId, req.user.user_id]
    );
    if (!bills.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Tagihan tidak ditemukan.' });
    }
    const bill = bills[0];
    if (bill.status === 'PAID') {
      await connection.rollback();
      return res.status(409).json({ message: 'Tagihan ini sudah lunas.' });
    }
    if (bill.status === 'PENDING') {
      await connection.rollback();
      return res.status(409).json({ message: 'Pembayaran sebelumnya sedang menunggu ACC Admin.' });
    }

    const combinedNotes = [
      `Metode: ${channel}`,
      extraNote || null
    ].filter(Boolean).join(' | ') || null;

    const [payResult] = await connection.execute(
      `INSERT INTO payments
         (bill_id, payment_method, amount, payment_status, proof_url, payment_reference, notes, paid_at)
       VALUES (?, ?, ?, 'PENDING', ?, ?, ?, NOW())`,
      [
        bill.bill_id,
        dbMethod,
        bill.amount,
        req.file ? req.file.filename : null,
        reference || null,
        combinedNotes
      ]
    );

    await connection.execute(
      "UPDATE monthly_bills SET status = 'PENDING' WHERE bill_id = ?",
      [bill.bill_id]
    );

    await recordActivity(
      pool,
      req.user,
      'PAYMENT_SUBMITTED',
      `Mengajukan pembayaran tagihan #${bill.bill_id} via ${channel} (menunggu ACC Admin).`,
      connection
    );

    await connection.commit();
    res.status(201).json({
      payment_id: payResult.insertId,
      bill_id: bill.bill_id,
      status: 'PENDING',
      payment_method: dbMethod,
      proof_url: req.file ? getImageUrl(req.file.filename) : null
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.get('/admin/payments', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.payment_id, p.bill_id, p.payment_method, p.amount, p.payment_status,
            p.proof_url, p.payment_reference, p.notes, p.paid_at, p.verified_at, p.created_at,
            b.billing_month, b.bill_description, b.status AS bill_status,
            u.user_id AS resident_id, u.full_name AS resident_name, u.phone_number
     FROM payments p
     JOIN monthly_bills b ON b.bill_id = p.bill_id
     JOIN users u ON u.user_id = b.resident_id
     ORDER BY FIELD(p.payment_status, 'PENDING', 'VERIFIED', 'REJECTED'), p.created_at DESC`
  );
  res.json(rows.map((row) => ({
    ...row,
    proof_url: getImageUrl(row.proof_url)
  })));
}));

router.post('/admin/bills/generate', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const billingMonth = formatBillingMonthDate(req.body.billing_month);
  const amount = Number(req.body.amount);
  const description = typeof req.body.bill_description === 'string' && req.body.bill_description.trim()
    ? req.body.bill_description.trim()
    : `Iuran kebersihan bulanan (${billingMonth.slice(0, 7)})`;
  const dueDate = typeof req.body.due_date === 'string' && req.body.due_date.trim() ? req.body.due_date.trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Nominal tagihan harus lebih dari 0.' });
  }

  const [residents] = await pool.execute("SELECT user_id FROM users WHERE role = 'RESIDENT'");
  let createdCount = 0;
  for (const resident of residents) {
    const [result] = await pool.execute(
      `INSERT IGNORE INTO monthly_bills
         (resident_id, billing_month, amount, due_date, status, bill_description, created_by)
       VALUES (?, ?, ?, ?, 'UNPAID', ?, ?)`,
      [resident.user_id, billingMonth, amount, dueDate, description, req.user.user_id]
    );
    if (result.affectedRows > 0) createdCount += 1;
  }

  await recordActivity(
    pool,
    req.user,
    'BILLS_GENERATED',
    `Membuat ${createdCount} tagihan bulanan (${billingMonth.slice(0, 7)}) sebesar Rp ${amount}.`
  );

  res.status(201).json({ created_count: createdCount, billing_month: billingMonth });
}));

router.patch('/admin/payments/:paymentId/verify', requireUser('ADMIN'), asyncHandler(async (req, res) => {
  const paymentId = validateId(req.params.paymentId, 'ID pembayaran');
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return res.status(400).json({ message: 'Keputusan verifikasi tidak valid.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      'SELECT payment_id, bill_id, payment_status FROM payments WHERE payment_id = ? FOR UPDATE',
      [paymentId]
    );
    if (!payments.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Data pembayaran tidak ditemukan.' });
    }
    const payment = payments[0];

    const nextPaymentStatus = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const nextBillStatus = decision === 'APPROVE' ? 'PAID' : 'UNPAID';

    await connection.execute(
      `UPDATE payments
       SET payment_status = ?, verified_by = ?, verified_at = NOW()
       WHERE payment_id = ?`,
      [nextPaymentStatus, req.user.user_id, paymentId]
    );

    await connection.execute(
      'UPDATE monthly_bills SET status = ? WHERE bill_id = ?',
      [nextBillStatus, payment.bill_id]
    );

    await recordActivity(
      pool,
      req.user,
      decision === 'APPROVE' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      `${decision === 'APPROVE' ? 'ACC (Verifikasi)' : 'Menolak'} pembayaran #${paymentId} untuk tagihan #${payment.bill_id}.`,
      connection
    );

    await connection.commit();
    res.json({ payment_id: paymentId, payment_status: nextPaymentStatus, bill_status: nextBillStatus });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;