async function ensureActivityLogsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      actor_name VARCHAR(100),
      role VARCHAR(20),
      \`action\` VARCHAR(100),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [columnsResult] = await pool.query('SHOW COLUMNS FROM activity_logs');
  const columns = new Set(columnsResult.map((column) => column.Field));
  const [foreignKeys] = await pool.execute(
    `SELECT DISTINCT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'activity_logs'
       AND COLUMN_NAME = 'user_id'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
  );
  const alterations = foreignKeys.map(
    ({ CONSTRAINT_NAME }) => `DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``
  );

  if (!columns.has('actor_name')) alterations.push('ADD COLUMN actor_name VARCHAR(100) NULL');
  if (!columns.has('role')) alterations.push('ADD COLUMN role VARCHAR(20) NULL');
  if (!columns.has('action') && columns.has('activity_type')) {
    alterations.push('CHANGE COLUMN activity_type `action` VARCHAR(100) NULL');
  } else if (!columns.has('action')) {
    alterations.push('ADD COLUMN `action` VARCHAR(100) NULL');
  }
  if (!columns.has('description') && columns.has('activity_description')) {
    alterations.push('CHANGE COLUMN activity_description description TEXT NULL');
  } else if (!columns.has('description')) {
    alterations.push('ADD COLUMN description TEXT NULL');
  }
  if (columns.has('user_id') && columnsResult.find((column) => column.Field === 'user_id').Null !== 'YES') {
    alterations.push('MODIFY COLUMN user_id INT NULL');
  }
  if (columns.has('action') && columns.has('activity_type')) {
    alterations.push('DROP COLUMN activity_type');
  }
  if (columns.has('description') && columns.has('activity_description')) {
    alterations.push('DROP COLUMN activity_description');
  }

  if (alterations.length) {
    await pool.query(`ALTER TABLE activity_logs ${alterations.join(', ')}`);
  }

  if (columns.has('activity_type') || columns.has('activity_description')) {
    await pool.query(
      `UPDATE activity_logs logs
       JOIN users ON users.user_id = logs.user_id
       SET logs.actor_name = COALESCE(logs.actor_name, users.full_name),
           logs.role = COALESCE(logs.role, users.role)`
    );
  }
}

async function recordActivity(pool, actor, action, description, executor = pool) {
  await executor.execute(
    `INSERT INTO activity_logs (user_id, actor_name, role, \`action\`, description)
     VALUES (?, ?, ?, ?, ?)`,
    [actor.user_id, actor.full_name, actor.role, action, description]
  );
}

module.exports = { ensureActivityLogsTable, recordActivity };
