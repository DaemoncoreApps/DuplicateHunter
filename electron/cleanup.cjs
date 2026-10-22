const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  within,
  unchanged,
  assertNoLinks,
  hashFile,
  equalFiles,
  signature,
} = require("./files.cjs");

function protectedPath(filename, settings, systemFolders = []) {
  return (
    [...systemFolders, ...settings.protectedFolders].some(
      (p) => p && within(filename, p),
    ) ||
    filename
      .split(/[\\/]/)
      .some((p) =>
        [
          ".daemoncore-quarantine",
          "$recycle.bin",
          "system volume information",
        ].includes(p.toLowerCase()),
      )
  );
}
async function validateSelection(db, ids, settings, systemFolders = []) {
  if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length)
    throw new Error("Select between 1 and 1,000 distinct files.");
  const selected = ids.map((id) =>
    db.prepare("SELECT * FROM files WHERE id=?").get(id),
  );
  if (selected.some((f) => !f || !f.group_id || f.state !== "present"))
    throw new Error("Selection contains unavailable or unverified files.");
  if (new Set(selected.map((f) => f.scan_id)).size !== 1)
    throw new Error("Cleanup must use a single scan snapshot.");
  const selectedIds = new Set(ids),
    survivors = new Map();
  for (const file of selected) {
    if (file.nlink !== 1 || protectedPath(file.path, settings, systemFolders))
      throw new Error("Selection contains protected or hard-linked files.");
    await assertNoLinks(file.path);
    if (!unchanged(await fs.lstat(file.path, { bigint: true }), file))
      throw new Error("A selected file changed. Rescan before cleanup.");
    const groupKey = `${file.scan_id}:${file.group_id}`;
    if (!survivors.has(groupKey)) {
      let survivor,
        cursor = 0;
      while (!survivor) {
        const candidates = db
          .prepare(
            "SELECT * FROM files WHERE scan_id=? AND group_id=? AND state='present' AND id>? ORDER BY id LIMIT 64",
          )
          .all(file.scan_id, file.group_id, cursor);
        if (!candidates.length) break;
        cursor = candidates.at(-1).id;
        for (const candidate of candidates) {
          if (selectedIds.has(candidate.id)) continue;
          try {
            await assertNoLinks(candidate.path);
            if (
              (await hashFile(candidate)) === file.hash &&
              (await equalFiles(candidate, file))
            ) {
              survivor = candidate;
              break;
            }
          } catch {
            /* A missing copy cannot protect a cleanup operation. */
          }
        }
      }
      if (!survivor)
        throw new Error(
          "Every group must retain at least one live, verified copy outside the selection.",
        );
      survivors.set(groupKey, survivor);
    }
    if ((await hashFile(file)) !== file.hash)
      throw new Error(
        "A selected file no longer matches its recorded checksum.",
      );
  }
  return {
    files: selected,
    survivors,
    bytes: selected.reduce((n, f) => n + f.size, 0),
    directories: [...new Set(selected.map((f) => path.dirname(f.path)))],
  };
}

async function cleanup(db, ids, method, settings, systemFolders, trashItem) {
  const plan = await validateSelection(db, ids, settings, systemFolders);
  const results = [];
  for (const file of plan.files) {
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const destination =
      method === "quarantine"
        ? path.join(
            path.dirname(file.path),
            ".DaemonCore-Quarantine",
            id,
            path.basename(file.path),
          )
        : null;
    db.prepare("INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      file.id,
      file.path,
      destination,
      file.hash,
      file.size,
      method,
      "prepared",
      now,
      now,
      null,
    );
    try {
      // Recheck the retained copy immediately before each mutation, not only during the preview.
      const survivor = plan.survivors.get(`${file.scan_id}:${file.group_id}`);
      await assertNoLinks(survivor.path);
      await assertNoLinks(file.path);
      if (
        (await hashFile(survivor)) !== file.hash ||
        (await hashFile(file)) !== file.hash ||
        !(await equalFiles(survivor, file))
      )
        throw new Error(
          "File or retained copy changed; cleanup stopped for this file.",
        );
      if (destination) {
        const quarantineRoot = path.dirname(path.dirname(destination));
        try {
          await fs.mkdir(quarantineRoot);
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
        }
        await assertNoLinks(quarantineRoot);
        await fs.mkdir(path.dirname(destination));
        await assertNoLinks(path.dirname(destination));
        // Quarantine stays on the source volume: rename is atomic and never needs copy-and-delete fallback.
        await fs.rename(file.path, destination);
        const moved = {
          path: destination,
          ...signature(await fs.lstat(destination, { bigint: true })),
        };
        if (moved.size !== file.size || (await hashFile(moved)) !== file.hash)
          throw new Error(
            "Moved file failed checksum verification. It remains in quarantine for review.",
          );
      } else await trashItem(file.path);
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE operations SET status=?,updated=? WHERE id=?").run(
          destination ? "quarantined" : "recycled",
          new Date().toISOString(),
          id,
        );
        db.prepare("UPDATE files SET state=? WHERE id=?").run(
          destination ? "quarantined" : "recycled",
          file.id,
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      results.push({
        id,
        status: destination ? "quarantined" : "recycled",
        path: file.path,
      });
    } catch (e) {
      // Leave ambiguous outcomes explicit; never report a successful deletion after an exception.
      db.prepare(
        "UPDATE operations SET status=?,message=?,updated=? WHERE id=?",
      ).run("review", e.message, new Date().toISOString(), id);
      results.push({
        id,
        status: "review",
        path: file.path,
        message: e.message,
      });
      break;
    }
  }
  return results;
}
async function restore(db, id) {
  const op = db.prepare("SELECT * FROM operations WHERE id=?").get(id);
  if (
    !op ||
    !op.destination ||
    !["quarantined", "review", "prepared"].includes(op.status)
  )
    throw new Error("This operation cannot be restored by the app.");
  await assertNoLinks(op.destination);
  await assertNoLinks(path.dirname(op.original));
  const stat = await fs.lstat(op.destination, { bigint: true });
  if (Number(stat.nlink) !== 1)
    throw new Error(
      "Quarantined file acquired another hard link. Review it manually.",
    );
  const file = { path: op.destination, ...signature(stat) };
  if ((await hashFile(file)) !== op.hash)
    throw new Error("Quarantined file checksum changed. Restore refused.");
  // link() fails if the original path exists; rename() could overwrite on some platforms.
  await fs.link(op.destination, op.original);
  try {
    await fs.unlink(op.destination);
  } catch (e) {
    db.prepare(
      "UPDATE operations SET status=?,message=?,updated=? WHERE id=?",
    ).run(
      "review",
      "Restored copy exists, but quarantine removal failed: " + e.message,
      new Date().toISOString(),
      id,
    );
    throw new Error("Copy restored. Quarantine cleanup needs manual review.");
  }
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE operations SET status=?,updated=?,message=NULL WHERE id=?",
    ).run("restored", new Date().toISOString(), id);
    // Restoring changes ctime. A fresh scan is required before it can enter another cleanup plan.
    db.prepare("UPDATE files SET state='restored' WHERE id=?").run(op.file_id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  await fs.rmdir(path.dirname(op.destination)).catch(() => {});
  return true;
}
async function reconcile(db) {
  for (const op of db
    .prepare("SELECT * FROM operations WHERE status='prepared'")
    .all()) {
    let status = "review",
      message =
        "Interrupted operation. Inspect the original location and Recycle Bin before acting.";
    if (op.destination) {
      try {
        await fs.lstat(op.original, { bigint: true });
        message =
          "Interrupted before confirmation. Original path exists; inspect it before retrying.";
      } catch (e) {
        if (e.code === "ENOENT") {
          try {
            const stat = await fs.lstat(op.destination, { bigint: true });
            await assertNoLinks(op.destination);
            if (
              (await hashFile({ path: op.destination, ...signature(stat) })) ===
              op.hash
            ) {
              status = "quarantined";
              message =
                "Recovered the journal after an interrupted quarantine.";
            }
          } catch {
            /* Keep the operation in review when its outcome is uncertain. */
          }
        }
      }
    }
    db.prepare(
      "UPDATE operations SET status=?,message=?,updated=? WHERE id=?",
    ).run(status, message, new Date().toISOString(), op.id);
    if (status === "quarantined")
      db.prepare("UPDATE files SET state='quarantined' WHERE id=?").run(
        op.file_id,
      );
  }
}
module.exports = {
  validateSelection,
  cleanup,
  restore,
  reconcile,
  protectedPath,
};
