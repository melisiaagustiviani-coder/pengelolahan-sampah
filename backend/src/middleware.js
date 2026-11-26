const pool = require('./db');

function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireUser(...roles) {
  return asyncHandler(async (req, res, next) => {
    const userId = Number(req.get('x-user-id'));
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(401).json({ message: 'Silakan login terlebih dahulu.' });
    }

    const [users] = await pool.execute(
      'SELECT user_id, full_name, phone_number, role FROM users WHERE user_id = ?',
      [userId]
    );
    if (!users.length) {
      return res.status(401).json({ message: 'Sesi pengguna tidak valid.' });
    }
    if (roles.length && !roles.includes(users[0].role)) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses untuk tindakan ini.' });
    }

    req.user = users[0];
    next();
  });
}

function validateId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error(`${label} tidak valid.`);
    error.status = 400;
    throw error;
  }
  return id;
}

function validateCoordinates(lng, lat) {
  const longitude = Number(lng);
  const latitude = Number(lat);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    const error = new Error('Koordinat longitude/latitude tidak valid.');
    error.status = 400;
    throw error;
  }
  return { lng: longitude, lat: latitude };
}

module.exports = { asyncHandler, requireUser, validateCoordinates, validateId };
