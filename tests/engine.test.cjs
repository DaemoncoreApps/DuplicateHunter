const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  openDatabase,
  defaults,
  summary,
  saveSettings,
  readSettings,
} = require("../electron/database.cjs");
const { scan, HashTree, distance } = require("../electron/scanner.cjs");
const {
  signature,
  hashFile,
  equalFiles,
  within,
  recommendation,
  canonical,
} = require("../electron/files.cjs");
const {
  validateSelection,
  cleanup,
  restore,
  reconcile,
} = require("../electron/cleanup.cjs");
const { settingsSchema } = require("../electron/validation.cjs");
const { profilePath } = require("../electron/paths.cjs");
const { queryGroups } = require("../electron/explorer.cjs");
const {
  saveProfile,
  readProfiles,
  deleteProfile,
} = require("../electron/profiles.cjs");

test("normal Windows profile paths do not inherit the colon in the display name", () => {
  const folder = profilePath(path.resolve("AppData", "Roaming"));
  assert.equal(path.basename(folder), "daemoncore-duplicate-hunter");
  assert.ok(!/[<>:"|?*]/.test(path.basename(folder)));
  assert.equal(profilePath(path.resolve("AppData", "Roaming")), folder);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-test-"));
  const data = path.join(root, "files");
  await fs.mkdir(data);
  const db = openDatabase(path.join(root, "test.sqlite"));
  t.after(async () => {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const add = async (name, content) => {
    const filename = path.join(data, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, content);
    return filename;
  };
  const run = async (
    options = {},
    controls = { paused: false, cancelled: false },
    emit = () => {},
  ) => {
    const id = crypto.randomUUID(),
      opts = { ...defaults, ...options };
    db.prepare(
      "INSERT INTO scans(id,started,status,roots,options) VALUES(?,?,?,?,?)",
    ).run(
      id,
      new Date().toISOString(),
      "running",
      JSON.stringify([data]),
      JSON.stringify(opts),
    );
    await scan(db, id, [data], opts, controls, emit);
    return id;
  };
  return { root, data, db, add, run };
}
test("exact duplicates require size, fingerprints, full hashes and bytes; Unicode paths survive", async (t) => {
  const f = await fixture(t);
  await f.add("alpha.txt", "same payload");
  await f.add("日本語/副本.txt", "same payload");
  await f.add("different.txt", "other content");
  await f.add("same-size.txt", "same payloae");
  const events = [],
    id = await f.run({}, undefined, (e) => events.push(e)),
    s = summary(f.db, id);
  assert.equal(s.files, 4);
  assert.equal(s.groups_count, 1);
  assert.equal(s.savings, 12);
  const copies = f.db
    .prepare("SELECT * FROM files WHERE group_id IS NOT NULL")
    .all();
  assert.equal(copies.length, 2);
  assert.equal(
    copies[0].hash,
    crypto.createHash("sha256").update("same payload").digest("hex"),
  );
  assert.ok(events.some((e) => e.phase === "SHA-256 hashing"));
  assert.equal(events.at(-1).phase, "Complete");
});
test("changed, truncated and replaced files are rejected", async (t) => {
  const f = await fixture(t),
    a = await f.add("a", "payload"),
    b = await f.add("b", "payload");
  const record = { path: a, ...signature(await fs.lstat(a, { bigint: true })) },
    other = { path: b, ...signature(await fs.lstat(b, { bigint: true })) };
  assert.equal(await equalFiles(record, other), true);
  await fs.writeFile(a, "changed");
  await assert.rejects(hashFile(record), /changed/);
  await assert.rejects(equalFiles(record, other), /changed/);
});
test("large streaming files and empty files hash accurately", async (t) => {
  const f = await fixture(t);
  const blob = crypto.randomBytes(5 * 1024 * 1024 + 17),
    a = await f.add("large.bin", blob);
  await f.add("copy.bin", blob);
  await f.add("empty-a", "");
  await f.add("empty-b", "");
  assert.equal(
    await hashFile({
      path: a,
      ...signature(await fs.lstat(a, { bigint: true })),
    }),
    crypto.createHash("sha256").update(blob).digest("hex"),
  );
  const id = await f.run({ minSize: 0 });
  assert.equal(summary(f.db, id).groups_count, 2);
  assert.equal(summary(f.db, id).savings, blob.length);
});
test("hard links are de-duplicated as physical entries and never count toward savings", async (t) => {
  const f = await fixture(t),
    a = await f.add("original", "data");
  await fs.link(a, path.join(f.data, "hardlink"));
  await f.add("independent", "data");
  const id = await f.run(),
    s = summary(f.db, id);
  assert.equal(s.files, 2);
  assert.equal(s.hardlinks, 1);
  assert.equal(s.savings, 0);
});
test("junction loops, excluded folders, dot files and quarantine are skipped", async (t) => {
  const f = await fixture(t);
  await f.add("normal", "abc");
  await f.add(".hidden", "abc");
  await f.add("excluded/copy", "abc");
  await f.add(".DaemonCore-Quarantine/copy", "abc");
  await fs.symlink(
    f.data,
    path.join(f.data, "loop"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const id = await f.run({ exclusions: [path.join(f.data, "excluded")] });
  assert.equal(summary(f.db, id).files, 1);
});
test("pause waits and cancellation persists the interrupted scan outcome", async (t) => {
  const f = await fixture(t);
  await f.add("a", "abc");
  const controls = { paused: true, cancelled: false };
  const task = f.run({}, controls);
  setTimeout(() => {
    controls.cancelled = true;
  }, 40);
  const id = await task;
  assert.equal(summary(f.db, id).status, "cancelled");
  assert.equal(summary(f.db, id).groups_count, 0);
});
test("extension and size filters only index eligible files", async (t) => {
  const f = await fixture(t);
  await f.add("a.txt", "1234");
  await f.add("b.bin", "1234");
  await f.add("c.txt", "1");
  const id = await f.run({ extensions: "TXT", minSize: 2, maxSize: 10 });
  assert.equal(summary(f.db, id).files, 1);
});
test("cleanup refuses all copies, protected paths, missing survivors and changed selected files", async (t) => {
  const f = await fixture(t),
    a = await f.add("a", "abc"),
    b = await f.add("b", "abc");
  await f.run();
  const files = f.db
    .prepare("SELECT * FROM files WHERE group_id IS NOT NULL ORDER BY id")
    .all();
  await assert.rejects(
    validateSelection(
      f.db,
      files.map((f) => f.id),
      defaults,
    ),
    /retain/,
  );
  await assert.rejects(
    validateSelection(f.db, [files[0].id], {
      ...defaults,
      protectedFolders: [f.data],
    }),
    /protected/,
  );
  await fs.unlink(b);
  await assert.rejects(
    validateSelection(
      f.db,
      [files.find((f) => canonical(f.path) === canonical(a)).id],
      defaults,
    ),
    /retain|changed/,
  );
});
test("quarantine and restore preserve bytes, journal results and refuse overwrite", async (t) => {
  const f = await fixture(t);
  await f.add("a", "safe payload");
  await f.add("b", "safe payload");
  await f.run();
  const file = f.db
    .prepare(
      "SELECT * FROM files WHERE group_id IS NOT NULL ORDER BY id LIMIT 1",
    )
    .get();
  const plan = await validateSelection(f.db, [file.id], defaults);
  assert.equal(plan.bytes, 12);
  assert.equal(plan.survivors.size, 1);
  const results = await cleanup(
    f.db,
    [file.id],
    "quarantine",
    defaults,
    [],
    () => {
      throw new Error("Recycle should not be called.");
    },
  );
  assert.equal(results[0].status, "quarantined");
  await assert.rejects(fs.stat(file.path), { code: "ENOENT" });
  await fs.writeFile(file.path, "new data");
  await assert.rejects(restore(f.db, results[0].id), { code: "EEXIST" });
  assert.equal(await fs.readFile(file.path, "utf8"), "new data");
  await fs.unlink(file.path);
  await restore(f.db, results[0].id);
  assert.equal(await fs.readFile(file.path, "utf8"), "safe payload");
  assert.equal(
    f.db.prepare("SELECT status FROM operations").get().status,
    "restored",
  );
  assert.equal(
    f.db.prepare("SELECT state FROM files WHERE id=?").get(file.id).state,
    "restored",
  );
});
test("Recycle Bin failures stop cleanup with an honest, reviewable journal entry", async (t) => {
  const f = await fixture(t);
  await f.add("a", "abc");
  await f.add("b", "abc");
  await f.run();
  const file = f.db
    .prepare("SELECT * FROM files WHERE group_id IS NOT NULL LIMIT 1")
    .get();
  const result = await cleanup(
    f.db,
    [file.id],
    "recycle",
    defaults,
    [],
    async () => {
      throw new Error("Recycle unavailable");
    },
  );
  assert.equal(result[0].status, "review");
  assert.equal(await fs.readFile(file.path, "utf8"), "abc");
});
test("interrupted quarantine is reconciled after restart and verified before restore", async (t) => {
  const f = await fixture(t);
  await f.add("a", "abc");
  await f.add("b", "abc");
  await f.run();
  const file = f.db
    .prepare("SELECT * FROM files WHERE group_id IS NOT NULL LIMIT 1")
    .get();
  const result = await cleanup(
    f.db,
    [file.id],
    "quarantine",
    defaults,
    [],
    async () => {},
  );
  f.db.prepare("UPDATE operations SET status='prepared'").run();
  await reconcile(f.db);
  assert.equal(
    f.db.prepare("SELECT status FROM operations").get().status,
    "quarantined",
  );
  const op = f.db.prepare("SELECT * FROM operations").get();
  await fs.writeFile(op.destination, "modified");
  await assert.rejects(restore(f.db, result[0].id), /checksum/);
});
test("folder boundaries, input validation, and explainable keep choices", async () => {
  assert.equal(
    within(path.resolve("folder-two"), path.resolve("folder")),
    false,
  );
  assert.equal(
    within(path.resolve("folder", "sub"), path.resolve("folder")),
    true,
  );
  assert.throws(() => settingsSchema.parse({ ...defaults, concurrency: 999 }));
  assert.throws(() =>
    settingsSchema.parse({ ...defaults, minSize: 100, maxSize: 5 }),
  );
  const files = [
    { id: 1, path: path.resolve("other/a"), mtime: 1 },
    { id: 2, path: path.resolve("preferred/b"), mtime: 2 },
  ];
  const keep = recommendation(files, {
    ...defaults,
    preferredFolders: [path.resolve("preferred")],
  });
  assert.equal(keep.id, 2);
  assert.match(keep.reason, /preferred/);
});
test("settings persist in SQLite", async (t) => {
  const f = await fixture(t);
  saveSettings(f.db, { ...defaults, concurrency: 4 });
  assert.equal(readSettings(f.db).concurrency, 4);
});
test("perceptual hash index returns threshold matches", () => {
  assert.equal(distance("0000000000000000", "000000000000000f"), 4);
  const tree = new HashTree();
  assert.deepEqual(tree.add({ id: 1, image_hash: "0000000000000000" }, 1), []);
  assert.equal(
    tree.add({ id: 2, image_hash: "0000000000000001" }, 1)[0].file.id,
    1,
  );
  assert.equal(
    tree.add({ id: 3, image_hash: "ffffffffffffffff" }, 1).length,
    0,
  );
});
test("image fingerprints come from real decoding and produce separate approximate pairs", async (t) => {
  const f = await fixture(t),
    sharp = require("sharp");
  await sharp({
    create: { width: 30, height: 30, channels: 3, background: "#336699" },
  })
    .png()
    .toFile(path.join(f.data, "a.png"));
  await sharp({
    create: { width: 60, height: 60, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toFile(path.join(f.data, "b.jpg"));
  const id = await f.run({ scanImages: true });
  assert.equal(summary(f.db, id).groups_count, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM image_pairs").get().n, 1);
  assert.equal(
    f.db.prepare("SELECT width FROM files WHERE ext=?").get(".png").width,
    30,
  );
});
test("partial fingerprint collisions are separated by full hashing", async (t) => {
  const f = await fixture(t),
    data = Buffer.alloc(600000, 7),
    other = Buffer.from(data);
  other[150000] = 8;
  const a = await f.add("a.bin", data),
    b = await f.add("b.bin", other);
  const first = { path: a, ...signature(await fs.lstat(a, { bigint: true })) },
    second = { path: b, ...signature(await fs.lstat(b, { bigint: true })) };
  assert.equal(await hashFile(first, true), await hashFile(second, true));
  assert.notEqual(await hashFile(first), await hashFile(second));
  assert.equal(await equalFiles(first, second), false);
  const id = await f.run();
  assert.equal(summary(f.db, id).groups_count, 0);
});
test("an inaccessible directory is recorded without discarding accessible results", async (t) => {
  const f = await fixture(t);
  await f.add("accessible.txt", "data");
  await f.add("blocked/hidden.txt", "data");
  const original = fs.opendir;
  fs.opendir = async (filename) => {
    if (path.basename(filename) === "blocked") {
      const error = new Error("Access denied");
      error.code = "EACCES";
      throw error;
    }
    return original(filename);
  };
  try {
    const id = await f.run();
    assert.equal(summary(f.db, id).files, 1);
    assert.equal(summary(f.db, id).errors, 1);
    assert.equal(
      f.db.prepare("SELECT code FROM scan_errors").get().code,
      "EACCES",
    );
  } finally {
    fs.opendir = original;
  }
});
test(
  "Windows exclusively locked files are skipped and recorded",
  { skip: process.platform !== "win32", timeout: 20000 },
  async (t) => {
    const f = await fixture(t),
      filename = await f.add("locked.txt", "locked data");
    await f.add("copy.txt", "locked data");
    const { spawn } = require("node:child_process");
    const literal = filename.replaceAll("'", "''");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$stream=[System.IO.File]::Open('${literal}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None);[Console]::WriteLine('LOCKED');[Console]::Out.Flush();[Console]::ReadLine() | Out-Null;$stream.Dispose()`,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Exclusive lock process did not start.")),
          10000,
        );
        child.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
          if (output.includes("LOCKED")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const id = await f.run();
      assert.equal(summary(f.db, id).status, "complete");
      assert.ok(summary(f.db, id).errors >= 1);
      assert.equal(summary(f.db, id).groups_count, 0);
    } finally {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.stdin.end("\n");
        await exited;
      }
    }
  },
);
test("hard links added after discovery invalidate a file snapshot", async (t) => {
  const f = await fixture(t),
    filename = await f.add("original", "payload"),
    record = {
      path: filename,
      ...signature(await fs.lstat(filename, { bigint: true })),
    };
  await fs.link(filename, path.join(f.data, "new-link"));
  await assert.rejects(hashFile(record), /changed/);
});
test("cleanup updates the current duplicate totals while preserving historical totals", async (t) => {
  const f = await fixture(t);
  await f.add("a", "abc");
  await f.add("b", "abc");
  const id = await f.run();
  const file = f.db
    .prepare("SELECT id FROM files WHERE group_id IS NOT NULL LIMIT 1")
    .get();
  await cleanup(f.db, [file.id], "quarantine", defaults, [], async () => {});
  assert.equal(summary(f.db, id).groups_count, 0);
  assert.equal(summary(f.db, id).savings, 0);
  assert.equal(summary(f.db, id).distribution.length, 0);
  assert.equal(
    f.db.prepare("SELECT groups_count,savings FROM scans WHERE id=?").get(id)
      .groups_count,
    1,
  );
});
test("a quarantine junction cannot redirect directory creation or file moves", async (t) => {
  const f = await fixture(t);
  await f.add("a", "abc");
  await f.add("b", "abc");
  await f.run();
  const outside = path.join(f.root, "outside");
  await fs.mkdir(outside);
  await fs.symlink(
    outside,
    path.join(f.data, ".DaemonCore-Quarantine"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const file = f.db
    .prepare("SELECT * FROM files WHERE group_id IS NOT NULL LIMIT 1")
    .get();
  const result = await cleanup(
    f.db,
    [file.id],
    "quarantine",
    defaults,
    [],
    async () => {},
  );
  assert.equal(result[0].status, "review");
  assert.match(result[0].message, /links|junctions/);
  assert.deepEqual(await fs.readdir(outside), []);
  assert.equal(await fs.readFile(file.path, "utf8"), "abc");
});
test("64-bit Windows file identities and nanosecond timestamps never round through Number", () => {
  const fake = {
    size: 10n,
    mtimeMs: 100n,
    ctimeMs: 100n,
    mtimeNs: 100000001n,
    ctimeNs: 100000002n,
    dev: 1n,
    ino: 9007199254740992n,
    nlink: 1n,
  };
  const a = signature(fake),
    b = signature({ ...fake, ino: fake.ino + 1n });
  assert.notEqual(a.ino, b.ino);
  assert.equal(a.mtime_ns, "100000001");
  assert.equal(a.ctime_ns, "100000002");
  assert.throws(() => signature({ ...fake, ino: Number(fake.ino) }), /bigint/);
});
test("partial fingerprints and byte comparison retry short filesystem reads", async (t) => {
  const f = await fixture(t),
    a = await f.add("a", crypto.randomBytes(100000));
  await fs.copyFile(a, path.join(f.data, "b"));
  const first = { path: a, ...signature(await fs.lstat(a, { bigint: true })) },
    second = {
      path: path.join(f.data, "b"),
      ...signature(await fs.lstat(path.join(f.data, "b"), { bigint: true })),
    };
  const expectedPartial = await hashFile(first, true),
    expectedFull = await hashFile(first);
  const original = fs.open;
  fs.open = async (...args) => {
    const handle = await original(...args);
    return {
      stat: handle.stat.bind(handle),
      close: handle.close.bind(handle),
      read: (buffer, offset, length, position) =>
        handle.read(buffer, offset, Math.min(length, 1023), position),
    };
  };
  try {
    assert.equal(await hashFile(first, true), expectedPartial);
    assert.equal(await hashFile(first), expectedFull);
    assert.equal(await equalFiles(first, second), true);
  } finally {
    fs.open = original;
  }
});
test("explorer categories retain byte-identical copies with different extensions", async (t) => {
  const f = await fixture(t);
  await f.add("photos/a.jpg", "image payload");
  await f.add("backup/b.copy", "image payload");
  const id = await f.run();
  const result = queryGroups(
    f.db,
    { scanId: id, category: "images" },
    defaults,
  );
  assert.equal(result.total, 1);
  assert.equal(result.groups[0].files.length, 2);
  assert.equal(result.savings, 13);
  assert.equal(
    queryGroups(f.db, { scanId: id, category: "video" }, defaults).total,
    0,
  );
});
test("result size, copy-count, cross-folder and directory filters use complete groups", async (t) => {
  const f = await fixture(t);
  await f.add("one/a.txt", "abc");
  await f.add("two/b.txt", "abc");
  await f.add("same/c.txt", "longer content");
  await f.add("same/d.txt", "longer content");
  const id = await f.run();
  assert.equal(
    queryGroups(f.db, { scanId: id, crossFolders: true }, defaults).total,
    1,
  );
  assert.equal(
    queryGroups(f.db, { scanId: id, minCopies: 3 }, defaults).total,
    0,
  );
  assert.equal(
    queryGroups(f.db, { scanId: id, minSize: 4 }, defaults).total,
    1,
  );
  const filtered = queryGroups(
    f.db,
    { scanId: id, directory: path.join(f.data, "one") },
    defaults,
  );
  assert.equal(filtered.total, 1);
  assert.equal(filtered.groups[0].copies, 2);
  assert.throws(
    () => queryGroups(f.db, { scanId: id, minSize: 10, maxSize: 5 }, defaults),
    /Maximum result size/,
  );
});
test("explorer search escapes wildcard characters and SQL input remains data", async (t) => {
  const f = await fixture(t);
  await f.add("100%.txt", "abc");
  await f.add("copy.txt", "abc");
  const id = await f.run();
  assert.equal(
    queryGroups(f.db, { scanId: id, search: "100%" }, defaults).total,
    1,
  );
  assert.equal(
    queryGroups(f.db, { scanId: id, search: "_" }, defaults).total,
    0,
  );
  assert.equal(
    queryGroups(f.db, { scanId: id, search: "' OR 1=1 --" }, defaults).total,
    0,
  );
});
test("protected copies are marked in results and become the keep recommendation", async (t) => {
  const f = await fixture(t);
  await f.add("a.txt", "abc");
  await f.add("protected/b.txt", "abc");
  const id = await f.run();
  const group = queryGroups(
    f.db,
    { scanId: id },
    { ...defaults, protectedFolders: [path.join(f.data, "protected")] },
  ).groups[0];
  assert.equal(group.files.filter((f) => f.protected).length, 1);
  assert.equal(group.files.find((f) => f.id === group.keep.id).protected, true);
  assert.match(group.keep.reason, /protected/);
});
test("scan profiles persist, update, reject duplicate names and delete without touching scan history", async (t) => {
  const f = await fixture(t);
  const profiles = saveProfile(f.db, {
    name: "Photo archive",
    roots: [f.data],
    options: defaults,
  });
  assert.equal(profiles.length, 1);
  const id = profiles[0].id;
  assert.equal(readProfiles(f.db)[0].roots[0], f.data);
  assert.throws(
    () =>
      saveProfile(f.db, {
        name: "Photo archive",
        roots: [f.data],
        options: defaults,
      }),
    /already exists/,
  );
  const updated = saveProfile(f.db, {
    id,
    name: "Photo archive",
    roots: [f.data],
    options: { ...defaults, scanImages: true },
  });
  assert.equal(updated[0].options.scanImages, true);
  assert.equal(deleteProfile(f.db, id).length, 0);
  assert.throws(() => deleteProfile(f.db, "invalid-id"));
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM scans").get().n, 0);
});
test("profile count and field validation keep saved setups bounded", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 20; i++)
    saveProfile(f.db, {
      name: `Setup ${i}`,
      roots: [f.data],
      options: defaults,
    });
  assert.throws(
    () =>
      saveProfile(f.db, {
        name: "Overflow",
        roots: [f.data],
        options: defaults,
      }),
    /20 saved/,
  );
  assert.throws(() =>
    saveProfile(f.db, { name: "", roots: [], options: defaults }),
  );
  assert.throws(
    () =>
      saveProfile(f.db, {
        name: "Relative path",
        roots: ["../elsewhere"],
        options: defaults,
      }),
    /absolute/,
  );
});
test("the overlay logo has genuine transparent and opaque pixels", async () => {
  const sharp = require("sharp"),
    file = path.join(__dirname, "../public/daemoncore-logo-transparent.png"),
    metadata = await sharp(file).metadata(),
    stats = await sharp(file).stats();
  assert.equal(metadata.hasAlpha, true);
  assert.equal(stats.isOpaque, false);
  assert.equal(stats.channels[3].min, 0);
  assert.equal(stats.channels[3].max, 255);
});
