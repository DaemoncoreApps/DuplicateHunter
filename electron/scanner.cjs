const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  signature,
  hashFile,
  equalFiles,
  within,
  assertNoLinks,
} = require("./files.cjs");

const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
  ".avif",
]);
const videoExtensions = new Set([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".webm",
  ".wmv",
  ".m4v",
]);
class Cancelled extends Error {}
function distance(a, b) {
  let n = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
    count = 0;
  while (n) {
    n &= n - 1n;
    count++;
  }
  return count;
}
class HashTree {
  constructor() {
    this.root = null;
  }
  add(file, radius) {
    if (!this.root) {
      this.root = { file, children: new Map() };
      return [];
    }
    const matches = [],
      stack = [this.root];
    while (stack.length) {
      const node = stack.pop(),
        d = distance(file.image_hash, node.file.image_hash);
      if (d <= radius) matches.push({ file: node.file, distance: d });
      for (const [edge, child] of node.children)
        if (edge >= d - radius && edge <= d + radius) stack.push(child);
    }
    let node = this.root;
    while (true) {
      const d = distance(file.image_hash, node.file.image_hash);
      if (!node.children.has(d)) {
        node.children.set(d, { file, children: new Map() });
        break;
      }
      node = node.children.get(d);
    }
    return matches;
  }
}

async function scan(db, id, roots, options, controls, emit = () => {}) {
  let files = 0,
    bytes = 0,
    errors = 0,
    processed = 0,
    total = 0,
    phase = "Discovering",
    last = 0;
  const started = Date.now();
  let phaseStarted = started,
    currentPath = "";
  const checkpoint = async () => {
    if (controls.cancelled) throw new Cancelled();
    while (controls.paused) {
      if (controls.cancelled) throw new Cancelled();
      await new Promise((r) => setTimeout(r, 60));
    }
  };
  const report = (force = false) => {
    if (force || Date.now() - last > 150) {
      last = Date.now();
      emit({
        id,
        phase,
        files,
        bytes,
        errors,
        processed,
        total,
        elapsed: Date.now() - started,
        paused: controls.paused,
        phaseElapsed: Date.now() - phaseStarted,
        currentPath,
      });
    }
  };
  const error = (e, p) => {
    errors++;
    db.prepare("INSERT INTO scan_errors(scan_id,code,path) VALUES(?,?,?)").run(
      id,
      e.code || e.message.slice(0, 160),
      p,
    );
    report();
  };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO files(scan_id,path,size,mtime,ctime,dev,ino,nlink,ext,directory,mtime_ns,ctime_ns) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const batch = [];
  const flush = () => {
    if (!batch.length) return;
    db.exec("BEGIN");
    try {
      for (const f of batch)
        insert.run(
          id,
          f.path,
          f.size,
          f.mtime,
          f.ctime,
          f.dev,
          f.ino,
          f.nlink,
          f.ext,
          path.dirname(f.path),
          f.mtime_ns,
          f.ctime_ns,
        );
      db.exec("COMMIT");
      batch.length = 0;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const exclusions = [...options.exclusions];
  const extFilter = new Set(
    options.extensions
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((e) =>
        e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`,
      ),
  );
  try {
    // The directory queue and candidate index live on disk, rather than retaining the tree in memory.
    db.exec(
      "CREATE TEMP TABLE directories(id INTEGER PRIMARY KEY,path TEXT UNIQUE,done INTEGER DEFAULT 0); CREATE INDEX temp.directory_pending ON directories(done,id); CREATE TEMP TABLE physical(dev TEXT,ino TEXT,PRIMARY KEY(dev,ino));",
    );
    const addDir = db.prepare(
      "INSERT OR IGNORE INTO directories(path) VALUES(?)",
    );
    for (const root of roots) {
      await assertNoLinks(root);
      addDir.run(path.resolve(root));
    }
    let dir;
    while (
      (dir = db
        .prepare("SELECT * FROM directories WHERE done=0 ORDER BY id LIMIT 1")
        .get())
    ) {
      await checkpoint();
      db.prepare("UPDATE directories SET done=1 WHERE id=?").run(dir.id);
      if (exclusions.some((p) => within(dir.path, p))) continue;
      try {
        currentPath = dir.path;
        const stat = await fs.lstat(dir.path, { bigint: true });
        if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
        const iterator = await fs.opendir(dir.path);
        for await (const entry of iterator) {
          await checkpoint();
          if (
            entry.isSymbolicLink() ||
            entry.name === ".DaemonCore-Quarantine" ||
            (!options.includeHidden && entry.name.startsWith("."))
          )
            continue;
          const filename = path.join(dir.path, entry.name);
          if (exclusions.some((p) => within(filename, p))) continue;
          if (entry.isDirectory()) {
            addDir.run(filename);
            continue;
          }
          if (!entry.isFile()) continue;
          try {
            const stat = await fs.lstat(filename, { bigint: true }),
              ext = path.extname(filename).toLowerCase();
            if (
              !stat.isFile() ||
              stat.isSymbolicLink() ||
              stat.size < options.minSize ||
              (options.maxSize && stat.size > options.maxSize) ||
              (extFilter.size && !extFilter.has(ext))
            )
              continue;
            const f = { path: filename, ...signature(stat), ext };
            // Do not count linked directory entries as independent reclaimable copies.
            const inserted = db
              .prepare("INSERT OR IGNORE INTO physical VALUES(?,?)")
              .run(f.dev, f.ino);
            if (!inserted.changes) continue;
            batch.push(f);
            files++;
            bytes += f.size;
            if (batch.length >= 128) flush();
            report();
          } catch (e) {
            error(e, filename);
          }
        }
      } catch (e) {
        if (e instanceof Cancelled) throw e;
        error(e, dir.path);
      }
    }
    flush();
    const runCandidates = async (label, where, field, partial) => {
      phase = label;
      phaseStarted = Date.now();
      processed = 0;
      total = db
        .prepare(`SELECT COUNT(*) n FROM files WHERE scan_id=? AND ${where}`)
        .get(id).n;
      report(true);
      let cursor = 0;
      while (true) {
        await checkpoint();
        const page = db
          .prepare(
            `SELECT * FROM files WHERE scan_id=? AND id>? AND ${where} ORDER BY id LIMIT 64`,
          )
          .all(id, cursor);
        if (!page.length) break;
        cursor = page.at(-1).id;
        for (let i = 0; i < page.length; i += options.concurrency) {
          const outcomes = await Promise.allSettled(
            page.slice(i, i + options.concurrency).map(async (f) => {
              try {
                currentPath = f.path;
                const hash = await hashFile(f, partial, checkpoint);
                db.prepare(`UPDATE files SET ${field}=? WHERE id=?`).run(
                  hash,
                  f.id,
                );
              } catch (e) {
                if (e instanceof Cancelled) throw e;
                error(e, f.path);
                db.prepare("UPDATE files SET state='changed' WHERE id=?").run(
                  f.id,
                );
              }
              processed++;
              report();
            }),
          );
          const failed = outcomes.find((r) => r.status === "rejected");
          if (failed) throw failed.reason;
        }
      }
    };
    await runCandidates(
      "Fingerprinting",
      "state='present' AND nlink=1 AND size IN (SELECT size FROM files WHERE scan_id='" +
        id +
        "' AND nlink=1 GROUP BY size HAVING COUNT(*)>1)",
      "partial",
      true,
    );
    await runCandidates(
      "SHA-256 hashing",
      "state='present' AND partial IS NOT NULL AND (size,partial) IN (SELECT size,partial FROM files WHERE scan_id='" +
        id +
        "' AND partial IS NOT NULL GROUP BY size,partial HAVING COUNT(*)>1)",
      "hash",
      false,
    );
    phase = "Byte verification";
    phaseStarted = Date.now();
    processed = 0;
    total = db
      .prepare(
        "SELECT COUNT(*) n FROM (SELECT hash FROM files WHERE scan_id=? AND hash IS NOT NULL AND state='present' GROUP BY hash HAVING COUNT(*)>1)",
      )
      .get(id).n;
    report(true);
    let lastHash = "";
    while (true) {
      const candidate = db
        .prepare(
          "SELECT hash FROM files WHERE scan_id=? AND hash>? AND state='present' GROUP BY hash HAVING COUNT(*)>1 ORDER BY hash LIMIT 1",
        )
        .get(id, lastHash);
      if (!candidate) break;
      const { hash } = candidate;
      lastHash = hash;
      await checkpoint();
      const first = db
        .prepare(
          "SELECT * FROM files WHERE scan_id=? AND hash=? AND state='present' ORDER BY id LIMIT 1",
        )
        .get(id, hash);
      currentPath = first.path;
      try {
        // A digest is only a candidate: each retained group also passes a streamed byte comparison.
        await hashFile(first, false, checkpoint);
        const group = crypto.randomUUID();
        let cursor = first.id,
          matched = false;
        while (true) {
          const page = db
            .prepare(
              "SELECT * FROM files WHERE scan_id=? AND hash=? AND id>? AND state='present' ORDER BY id LIMIT 64",
            )
            .all(id, hash, cursor);
          if (!page.length) break;
          cursor = page.at(-1).id;
          for (const candidate of page) {
            try {
              if (await equalFiles(first, candidate, checkpoint)) {
                db.prepare("UPDATE files SET group_id=? WHERE id=?").run(
                  group,
                  candidate.id,
                );
                if (!matched) {
                  db.prepare("UPDATE files SET group_id=? WHERE id=?").run(
                    group,
                    first.id,
                  );
                  matched = true;
                }
              }
            } catch (e) {
              if (e instanceof Cancelled) throw e;
              error(e, candidate.path);
            }
          }
        }
      } catch (e) {
        if (e instanceof Cancelled) throw e;
        error(e, first.path);
      }
      processed++;
      report();
    }
    if (options.scanImages) {
      phase = "Image fingerprints";
      phaseStarted = Date.now();
      processed = 0;
      total = db
        .prepare(
          "SELECT COUNT(*) n FROM files WHERE scan_id=? AND ext IN ('.jpg','.jpeg','.png','.webp','.bmp','.gif','.tif','.tiff','.avif')",
        )
        .get(id).n;
      const sharp = require("sharp"),
        tree = new HashTree(),
        radius = Math.floor((64 * (100 - options.similarity)) / 100);
      let cursor = 0,
        indexed = 0,
        pairs = 0;
      while (true) {
        await checkpoint();
        const page = db
          .prepare(
            "SELECT * FROM files WHERE scan_id=? AND id>? AND state='present' ORDER BY id LIMIT 64",
          )
          .all(id, cursor);
        if (!page.length) break;
        cursor = page.at(-1).id;
        for (const f of page) {
          currentPath = f.path;
          if (!imageExtensions.has(f.ext)) continue;
          await checkpoint();
          if (indexed >= 20000 || pairs >= 100000) {
            error(
              new Error(
                "Image comparison safety limit reached (20,000 images / 100,000 pairs); narrow the scan.",
              ),
              f.path,
            );
            break;
          }
          try {
            const before = await fs.lstat(f.path, { bigint: true });
            const { unchanged } = require("./files.cjs");
            if (!unchanged(before, f))
              throw new Error("Image changed since discovery.");
            const image = sharp(f.path, {
              limitInputPixels: 80000000,
              pages: 1,
              failOn: "error",
            }).rotate();
            const meta = await image.metadata();
            const pixels = await image
              .resize(9, 8, { fit: "fill" })
              .greyscale()
              .removeAlpha()
              .raw()
              .toBuffer();
            let bits = 0n;
            for (let y = 0; y < 8; y++)
              for (let x = 0; x < 8; x++)
                bits =
                  (bits << 1n) |
                  (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1n : 0n);
            if (!unchanged(await fs.lstat(f.path, { bigint: true }), f))
              throw new Error("Image changed while decoding.");
            f.image_hash = bits.toString(16).padStart(16, "0");
            db.prepare(
              "UPDATE files SET image_hash=?,width=?,height=? WHERE id=?",
            ).run(f.image_hash, meta.width, meta.height, f.id);
            for (const match of tree.add(f, radius)) {
              if (f.group_id && f.group_id === match.file.group_id) continue;
              db.prepare(
                "INSERT OR IGNORE INTO image_pairs VALUES(?,?,?,?)",
              ).run(id, match.file.id, f.id, match.distance);
              pairs++;
              if (pairs >= 100000) break;
            }
            indexed++;
          } catch (e) {
            error(e, f.path);
          }
          processed++;
          report();
        }
        if (indexed >= 20000 || pairs >= 100000) break;
      }
    }
    const totals = db
      .prepare(
        "SELECT COUNT(*) groups_count, COALESCE(SUM(size*(copies-1)),0) savings FROM (SELECT size,COUNT(*) copies FROM files WHERE scan_id=? AND group_id IS NOT NULL GROUP BY group_id HAVING COUNT(*)>1)",
      )
      .get(id);
    db.prepare(
      "UPDATE scans SET status=?,finished=?,files=?,bytes=?,errors=?,elapsed=?,groups_count=?,savings=? WHERE id=?",
    ).run(
      "complete",
      new Date().toISOString(),
      files,
      bytes,
      errors,
      Date.now() - started,
      totals.groups_count,
      totals.savings,
      id,
    );
    phase = "Complete";
    report(true);
  } catch (e) {
    flush();
    db.prepare(
      "UPDATE scans SET status=?,finished=?,files=?,bytes=?,errors=?,elapsed=? WHERE id=?",
    ).run(
      e instanceof Cancelled ? "cancelled" : "failed",
      new Date().toISOString(),
      files,
      bytes,
      errors,
      Date.now() - started,
      id,
    );
    if (!(e instanceof Cancelled)) throw e;
    phase = "Cancelled";
    report(true);
  }
}
module.exports = {
  scan,
  Cancelled,
  distance,
  HashTree,
  imageExtensions,
  videoExtensions,
};
