const { DatabaseSync } = require("node:sqlite");

function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA temp_store=FILE; PRAGMA cache_size=-8192;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY, started TEXT NOT NULL, finished TEXT, status TEXT NOT NULL,
      roots TEXT NOT NULL, options TEXT NOT NULL, files INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0, groups_count INTEGER DEFAULT 0, savings INTEGER DEFAULT 0, elapsed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      path TEXT NOT NULL, size INTEGER NOT NULL, mtime REAL NOT NULL, ctime REAL NOT NULL,
      dev TEXT NOT NULL, ino TEXT NOT NULL, nlink INTEGER NOT NULL, ext TEXT NOT NULL,
      partial TEXT, hash TEXT, group_id TEXT, image_hash TEXT, width INTEGER, height INTEGER,
      state TEXT NOT NULL DEFAULT 'present', UNIQUE(scan_id,path)
    );
    CREATE INDEX IF NOT EXISTS file_sizes ON files(scan_id,size);
    CREATE INDEX IF NOT EXISTS file_partials ON files(scan_id,size,partial);
    CREATE INDEX IF NOT EXISTS file_hashes ON files(scan_id,hash);
    CREATE INDEX IF NOT EXISTS file_groups ON files(scan_id,group_id);
    CREATE TABLE IF NOT EXISTS image_pairs (
      scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      a INTEGER NOT NULL REFERENCES files(id), b INTEGER NOT NULL REFERENCES files(id), distance INTEGER NOT NULL,
      PRIMARY KEY(scan_id,a,b)
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id), original TEXT NOT NULL,
      destination TEXT, hash TEXT NOT NULL, size INTEGER NOT NULL, method TEXT NOT NULL,
      status TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, message TEXT
    );
    CREATE TABLE IF NOT EXISTS scan_errors (
      id INTEGER PRIMARY KEY, scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      code TEXT NOT NULL, path TEXT NOT NULL
    );`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS scan_errors_by_scan ON scan_errors(scan_id,id)",
  );
  if (
    !db
      .prepare("PRAGMA table_info(files)")
      .all()
      .some((c) => c.name === "directory")
  )
    db.exec("ALTER TABLE files ADD COLUMN directory TEXT NOT NULL DEFAULT ''");
  const columns = db.prepare("PRAGMA table_info(files)").all();
  for (const name of ["mtime_ns", "ctime_ns"])
    if (!columns.some((c) => c.name === name))
      db.exec(`ALTER TABLE files ADD COLUMN ${name} TEXT`);
  return db;
}

const defaults = {
  minSize: 1,
  maxSize: 0,
  extensions: "",
  exclusions: [],
  protectedFolders: [],
  preferredFolders: [],
  includeHidden: false,
  concurrency: 2,
  similarity: 90,
  scanImages: false,
  cleanupMethod: "recycle",
  keepPolicy: "preferred",
  notifications: true,
  reducedMotion: false,
};
function readSettings(db) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key=?")
    .get("preferences");
  return { ...defaults, ...(row ? JSON.parse(row.value) : {}) };
}
function saveSettings(db, value) {
  db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
    "preferences",
    JSON.stringify(value),
  );
}
function summary(db, id) {
  const scan = id
    ? db.prepare("SELECT * FROM scans WHERE id=?").get(id)
    : db.prepare("SELECT * FROM scans ORDER BY started DESC LIMIT 1").get();
  if (!scan) return null;
  const totals = db
    .prepare(
      `SELECT COUNT(*) groups_count,COALESCE(SUM(size*(copies-1)),0) savings,
    COALESCE(SUM(copies),0) duplicate_files FROM (SELECT size,COUNT(*) copies
    FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present'
    GROUP BY group_id HAVING COUNT(*)>1)`,
    )
    .get(scan.id);
  const types = db
    .prepare(
      `SELECT ext,COUNT(*) count, SUM(size) bytes FROM files WHERE scan_id=? GROUP BY ext ORDER BY bytes DESC LIMIT 12`,
    )
    .all(scan.id);
  const distribution = db
    .prepare(
      `SELECT ext, SUM(size*(copies-1)) bytes, SUM(copies-1) count FROM
    (SELECT ext, size, COUNT(*) copies FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present' GROUP BY group_id HAVING COUNT(*)>1)
    GROUP BY ext ORDER BY bytes DESC LIMIT 12`,
    )
    .all(scan.id);
  const physical = db
    .prepare("SELECT COUNT(*) count FROM files WHERE scan_id=? AND nlink>1")
    .get(scan.id);
  return {
    ...scan,
    roots: JSON.parse(scan.roots),
    options: JSON.parse(scan.options),
    ...totals,
    types,
    distribution,
    hardlinks: physical.count,
    protectedCopies: totals.groups_count,
  };
}
module.exports = {
  openDatabase,
  readSettings,
  saveSettings,
  summary,
  defaults,
};
