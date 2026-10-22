const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
  protocol,
  net,
  Notification,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { Worker } = require("node:worker_threads");
const { z } = require("zod");
const {
  openDatabase,
  readSettings,
  saveSettings,
  summary,
} = require("./database.cjs");
const { settingsSchema, idsSchema } = require("./validation.cjs");
const { queryGroups } = require("./explorer.cjs");
const { findBursts } = require("./bursts.cjs");
const {
  readProfiles,
  saveProfile,
  deleteProfile,
  profileSchema,
} = require("./profiles.cjs");
const { canonical, within, unchanged, assertNoLinks } = require("./files.cjs");
const {
  validateSelection,
  cleanup,
  restore,
  reconcile,
  protectedPath,
} = require("./cleanup.cjs");
const { imageExtensions, videoExtensions } = require("./scanner.cjs");
const { profilePath } = require("./paths.cjs");

const dev = process.argv.includes("--dev"),
  smoke = process.argv.includes("--smoke");
const userData = smoke
  ? require("node:fs").mkdtempSync(
      path.join(app.getPath("temp"), "DuplicateHunter-Smoke-"),
    )
  : profilePath(app.getPath("appData"));
app.setPath("userData", userData);
app.setPath("sessionData", userData);
app.setAppLogsPath(path.join(userData, "logs"));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "hunter",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
let win,
  db,
  worker,
  progress = null,
  busy = false,
  database;
const chosen = new Set(),
  tokens = new Map();
const systemFolders = [
  process.env.SystemRoot,
  process.env.ProgramFiles,
  process.env["ProgramFiles(x86)"],
  process.env.ProgramData,
];
const notify = (value) => {
  if (win && !win.isDestroyed()) win.webContents.send("hunter:update", value);
};
const trusted = (event) =>
  win &&
  event.sender === win.webContents &&
  event.senderFrame === win.webContents.mainFrame;
function history() {
  return db
    .prepare("SELECT * FROM scans ORDER BY started DESC LIMIT 100")
    .all()
    .map((s) => ({
      ...s,
      roots: JSON.parse(s.roots),
      options: JSON.parse(s.options),
    }));
}
function boot(id) {
  return {
    settings: readSettings(db),
    history: history(),
    summary: summary(db, id),
    operations: db
      .prepare("SELECT * FROM operations ORDER BY created DESC LIMIT 200")
      .all(),
    progress,
    busy,
    version: app.getVersion(),
    profiles: readProfiles(db),
  };
}
async function eligibleFile(id) {
  const file = db
    .prepare("SELECT * FROM files WHERE id=?")
    .get(z.number().int().positive().parse(id));
  if (!file || file.state !== "present")
    throw new Error("File is unavailable.");
  await assertNoLinks(file.path);
  if (!unchanged(await fs.lstat(file.path, { bigint: true }), file))
    throw new Error("File changed. Rescan to refresh it.");
  return file;
}
async function handle(method, payload) {
  if (method === "boot")
    return boot(payload ? z.string().uuid().parse(payload) : undefined);
  if (method === "chooseFolders") {
    const result = await dialog.showOpenDialog(win, {
      title: "Choose folders or drives to scan",
      properties: ["openDirectory", "multiSelections", "dontAddToRecent"],
    });
    const folders = result.canceled ? [] : result.filePaths;
    for (const p of folders) chosen.add(canonical(p));
    return folders;
  }
  if (method === "saveProfile") {
    const profile = profileSchema.parse(payload);
    const known = [
      ...history().flatMap((s) => s.roots),
      ...readProfiles(db).flatMap((p) => p.roots),
    ].map(canonical);
    for (const root of profile.roots)
      if (!chosen.has(canonical(root)) && !known.includes(canonical(root)))
        throw new Error(
          "Choose profile locations with the folder picker first.",
        );
    return saveProfile(db, profile);
  }
  if (method === "deleteProfile") return deleteProfile(db, payload);
  if (method === "inspectFile") {
    const file = db
      .prepare("SELECT * FROM files WHERE id=?")
      .get(z.number().int().positive().parse(payload));
    if (!file) throw new Error("File snapshot not found.");
    let availability = "present",
      live = null;
    try {
      await assertNoLinks(file.path);
      const stat = await fs.lstat(file.path, { bigint: true });
      live = {
        size: Number(stat.size),
        modified: Number(stat.mtimeMs),
        links: Number(stat.nlink),
      };
      if (!unchanged(stat, file)) availability = "changed";
    } catch (e) {
      availability = e.code === "ENOENT" ? "missing" : "unavailable";
    }
    const peers = file.group_id
      ? db
          .prepare(
            "SELECT id,path,size,mtime,state FROM files WHERE scan_id=? AND group_id=? ORDER BY path LIMIT 50",
          )
          .all(file.scan_id, file.group_id)
      : [];
    const settings = readSettings(db);
    return {
      file,
      live,
      availability,
      peers,
      protected:
        protectedPath(file.path, settings, systemFolders) || file.nlink > 1,
      scan: db
        .prepare("SELECT started,status FROM scans WHERE id=?")
        .get(file.scan_id),
    };
  }
  if (method === "saveSettings") {
    const settings = settingsSchema.parse(payload);
    saveSettings(db, settings);
    return settings;
  }
  if (method === "startScan") {
    if (worker || busy)
      throw new Error("Wait for the current scan or file operation.");
    const input = z
      .object({
        roots: z.array(z.string().min(1).max(32760)).min(1).max(50),
        options: settingsSchema,
      })
      .strict()
      .parse(payload);
    const known = [
      ...history().flatMap((s) => s.roots),
      ...readProfiles(db).flatMap((p) => p.roots),
    ].map(canonical);
    const roots = [
      ...new Map(
        input.roots.map((p) => [canonical(p), path.resolve(p)]),
      ).values(),
    ].filter(
      (p, i, all) => !all.some((other, j) => j !== i && within(p, other)),
    );
    for (const root of roots) {
      if (!chosen.has(canonical(root)) && !known.includes(canonical(root)))
        throw new Error("Choose scan locations using the folder picker first.");
      await assertNoLinks(root);
      if (!(await fs.stat(root)).isDirectory())
        throw new Error("Scan locations must be directories.");
    }
    const id = crypto.randomUUID(),
      options = {
        ...input.options,
        exclusions: [...input.options.exclusions, app.getPath("userData")],
      };
    db.prepare(
      "INSERT INTO scans(id,started,status,roots,options) VALUES(?,?,?,?,?)",
    ).run(
      id,
      new Date().toISOString(),
      "running",
      JSON.stringify(roots),
      JSON.stringify(options),
    );
    progress = {
      id,
      phase: "Starting",
      files: 0,
      bytes: 0,
      errors: 0,
      processed: 0,
      total: 0,
      elapsed: 0,
      paused: false,
    };
    worker = new Worker(path.join(__dirname, "scan-worker.cjs"), {
      workerData: { database, id, roots, options },
    });
    worker.on("message", (message) => {
      if (message.type === "progress") {
        progress = message.progress;
        notify({ type: "progress", progress });
      }
      if (message.type === "error")
        notify({ type: "error", error: message.error });
    });
    worker.on("error", (e) => {
      notify({ type: "error", error: e.message });
    });
    worker.on("exit", () => {
      db.prepare(
        "UPDATE scans SET status='interrupted',finished=? WHERE id=? AND status='running'",
      ).run(new Date().toISOString(), id);
      worker = null;
      progress = null;
      const state = boot(id);
      notify({ type: "refresh", state });
      if (state.settings.notifications && Notification.isSupported())
        new Notification({
          title: "DaemonCore: Duplicate Hunter",
          body: `Scan ${state.summary.status}. ${state.summary.groups_count} verified duplicate groups.`,
        }).show();
    });
    notify({ type: "progress", progress });
    return id;
  }
  if (method === "control") {
    const command = z.enum(["pause", "resume", "cancel"]).parse(payload);
    if (!worker) throw new Error("No scan is active.");
    worker.postMessage(command);
    if (progress) {
      progress = {
        ...progress,
        paused: command === "pause",
        phase: command === "cancel" ? "Cancelling" : progress.phase,
      };
      notify({ type: "progress", progress });
    }
    return true;
  }
  if (method === "groups")
    return queryGroups(db, payload, readSettings(db), systemFolders);
  if (method === "pairs") {
    const q = z
      .object({
        scanId: z.string().uuid(),
        offset: z.number().int().min(0),
        threshold: z.number().min(70).max(100),
      })
      .strict()
      .parse(payload);
    const radius = Math.floor((64 * (100 - q.threshold)) / 100);
    const pairs = db
      .prepare(
        `SELECT * FROM image_pairs WHERE scan_id=? AND distance<=? ORDER BY distance,a,b LIMIT 24 OFFSET ?`,
      )
      .all(q.scanId, radius, q.offset);
    return {
      total: db
        .prepare(
          "SELECT COUNT(*) n FROM image_pairs WHERE scan_id=? AND distance<=?",
        )
        .get(q.scanId, radius).n,
      pairs: pairs.map((p) => ({
        ...p,
        a: db.prepare("SELECT * FROM files WHERE id=?").get(p.a),
        b: db.prepare("SELECT * FROM files WHERE id=?").get(p.b),
        similarity: Math.round(100 * (1 - p.distance / 64)),
      })),
    };
  }
  if (method === "bursts") {
    return findBursts(db, z.string().uuid().parse(payload));
  }
  if (method === "analytics") {
    const id = z.string().uuid().parse(payload);
    return {
      directories: db
        .prepare(
          "SELECT directory label,COUNT(*) count,SUM(size) bytes FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present' AND group_id IN (SELECT group_id FROM files WHERE scan_id=? AND state='present' GROUP BY group_id HAVING COUNT(*)>1) GROUP BY directory ORDER BY bytes DESC LIMIT 12",
        )
        .all(id, id),
      drives: db
        .prepare(
          "SELECT substr(path,1,3) label,COUNT(*) count,SUM(size) bytes FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present' AND group_id IN (SELECT group_id FROM files WHERE scan_id=? AND state='present' GROUP BY group_id HAVING COUNT(*)>1) GROUP BY label ORDER BY bytes DESC",
        )
        .all(id, id),
      sizes: db
        .prepare(
          `SELECT CASE WHEN size<1048576 THEN 'Under 1 MB' WHEN size<104857600 THEN '1–100 MB' WHEN size<1073741824 THEN '100 MB–1 GB' ELSE 'Over 1 GB' END label,COUNT(*) count,SUM(size*(copies-1)) bytes FROM (SELECT size,COUNT(*) copies FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present' GROUP BY group_id HAVING COUNT(*)>1) GROUP BY label ORDER BY bytes DESC`,
        )
        .all(id),
    };
  }
  if (method === "fileAction") {
    const p = z
        .object({
          id: z.number().int().positive(),
          action: z.enum(["reveal", "copy", "open", "preview", "copyHash"]),
        })
        .strict()
        .parse(payload),
      file = await eligibleFile(p.id);
    if (p.action === "copy") {
      await clipboard.writeText(file.path);
      return true;
    }
    if (p.action === "copyHash") {
      if (!file.hash)
        throw new Error("This file has no recorded SHA-256 checksum.");
      await clipboard.writeText(file.hash);
      return true;
    }
    if (p.action === "reveal") {
      shell.showItemInFolder(file.path);
      return true;
    }
    if (p.action === "open") {
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        title: "Open file in Windows",
        message: "Open this file with its registered Windows application?",
        detail:
          file.path +
          "\nOnly open files you trust. Some file types can run code.",
        buttons: ["Cancel", "Open file"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) return false;
      const error = await shell.openPath(file.path);
      if (error) throw new Error(error);
      return true;
    }
    if (!imageExtensions.has(file.ext) && !videoExtensions.has(file.ext))
      throw new Error(
        "Inline preview supports images and browser-playable videos.",
      );
    const token = crypto.randomBytes(24).toString("hex");
    tokens.set(token, { id: file.id, expires: Date.now() + 30 * 60 * 1000 });
    if (tokens.size > 500) tokens.delete(tokens.keys().next().value);
    return `hunter://preview/${token}`;
  }
  if (method === "previewCleanup") {
    if (worker || busy)
      throw new Error("Finish the active scan or operation first.");
    const ids = idsSchema.parse(payload);
    busy = true;
    try {
      const plan = await validateSelection(
        db,
        ids,
        readSettings(db),
        systemFolders,
      );
      return {
        count: plan.files.length,
        bytes: plan.bytes,
        directories: plan.directories,
        protectedCopies: plan.survivors.size,
      };
    } finally {
      busy = false;
    }
  }
  if (method === "executeCleanup") {
    if (worker || busy)
      throw new Error("Finish the active scan or operation first.");
    const p = z
      .object({ ids: idsSchema, method: z.enum(["recycle", "quarantine"]) })
      .strict()
      .parse(payload);
    busy = true;
    try {
      const plan = await validateSelection(
        db,
        p.ids,
        readSettings(db),
        systemFolders,
      );
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        title: "Confirm duplicate cleanup",
        message:
          p.method === "quarantine"
            ? `Move ${plan.files.length} files into recoverable quarantine?`
            : `Send ${plan.files.length} files to the Windows Recycle Bin?`,
        detail:
          `${plan.bytes.toLocaleString()} bytes selected. ${plan.survivors.size} verified copies will be kept.\n\n` +
          (p.method === "quarantine"
            ? "Quarantine is stored beside each original and does not free disk space until you remove it manually."
            : "Recycle Bin recovery is managed by Windows; this app cannot restore those files. Recycle Bin contents still use disk space until emptied."),
        buttons: [
          "Cancel",
          p.method === "quarantine"
            ? "Move to quarantine"
            : "Send to Recycle Bin",
        ],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) return [];
      return await cleanup(
        db,
        p.ids,
        p.method,
        readSettings(db),
        systemFolders,
        (p) => shell.trashItem(p),
      );
    } finally {
      busy = false;
      notify({ type: "refresh", state: boot() });
    }
  }
  if (method === "restore") {
    if (worker || busy)
      throw new Error("Finish the active scan or operation first.");
    busy = true;
    try {
      return await restore(db, z.string().uuid().parse(payload));
    } finally {
      busy = false;
      notify({ type: "refresh", state: boot() });
    }
  }
  if (method === "errors")
    return db
      .prepare(
        "SELECT code,path FROM scan_errors WHERE scan_id=? ORDER BY id DESC LIMIT 200",
      )
      .all(z.string().uuid().parse(payload));
  if (method === "drives") {
    const results = [];
    const candidates =
      process.platform === "win32"
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => c + ":\\")
        : ["/"];
    for (const root of candidates)
      try {
        const s = await fs.statfs(root);
        results.push({
          root,
          total: s.blocks * s.bsize,
          free: s.bavail * s.bsize,
        });
      } catch {
        /* Missing and inaccessible drives are omitted. */
      }
    return results;
  }
  if (method === "clearHistory") {
    if (worker || busy)
      throw new Error("Finish the active scan or operation first.");
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      message: "Remove scan history with no cleanup operations?",
      detail:
        "Recovery journals and the scans they reference will be preserved. Your files are unaffected.",
      buttons: ["Cancel", "Remove history"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) {
      db.prepare(
        "DELETE FROM scans WHERE id NOT IN (SELECT DISTINCT f.scan_id FROM files f JOIN operations o ON o.file_id=f.id)",
      ).run();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    }
    return boot();
  }
  if (method === "exportReport") {
    const p = z
      .object({ scanId: z.string().uuid(), format: z.enum(["csv", "json"]) })
      .strict()
      .parse(payload);
    const result = await dialog.showSaveDialog(win, {
      title: "Export local scan report",
      defaultPath: `Duplicate-Hunter-report.${p.format}`,
      filters: [{ name: p.format.toUpperCase(), extensions: [p.format] }],
    });
    if (result.canceled) return false;
    const scan = summary(db, p.scanId);
    if (!scan) throw new Error("Scan not found.");
    const temp = result.filePath + "." + crypto.randomUUID() + ".tmp",
      handle = await fs.open(temp, "wx");
    try {
      if (p.format === "json")
        await handle.write('{"scan":' + JSON.stringify(scan) + ',"files":[\n');
      else await handle.write("\uFEFFPath,Size bytes,SHA-256,Group,State\r\n");
      const csv = (value) =>
        '"' +
        String(value ?? "")
          .replace(/^[=+@\-\t\r]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      let cursor = 0,
        first = true;
      while (true) {
        const rows = db
          .prepare(
            "SELECT * FROM files WHERE scan_id=? AND id>? ORDER BY id LIMIT 256",
          )
          .all(p.scanId, cursor);
        if (!rows.length) break;
        for (const f of rows) {
          await handle.write(
            p.format === "json"
              ? (first ? "" : ",\n") + JSON.stringify(f)
              : [f.path, f.size, f.hash, f.group_id, f.state]
                  .map(csv)
                  .join(",") + "\r\n",
          );
          first = false;
        }
        cursor = rows.at(-1).id;
      }
      if (p.format === "json") await handle.write("\n]}");
      await handle.sync();
      await handle.close();
      await fs.rename(temp, result.filePath);
      return true;
    } catch (e) {
      await handle.close().catch(() => {});
      await fs.unlink(temp).catch(() => {});
      throw e;
    }
  }
  throw new Error("Unknown operation.");
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1060,
    minHeight: 740,
    frame: false,
    backgroundColor: "#0b0c10",
    title: "DaemonCore: Duplicate Hunter",
    icon: path.join(__dirname, "../build/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (
      url !==
      (dev
        ? "http://127.0.0.1:5173/"
        : pathToFileURL(path.join(__dirname, "../dist/index.html")).href)
    )
      e.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on("close", (e) => {
    if (worker || busy) {
      e.preventDefault();
      notify({
        type: "error",
        error:
          "Cancel the scan and wait for file operations to finish before closing.",
      });
    }
  });
  win.on("maximize", () => notify({ type: "window", maximized: true }));
  win.on("unmaximize", () => notify({ type: "window", maximized: false }));
  win.once("ready-to-show", () => win.show());
  if (dev) await win.loadURL("http://127.0.0.1:5173/");
  else await win.loadFile(path.join(__dirname, "../dist/index.html"));
  if (process.argv.includes("--startup-check")) {
    const result = await win.webContents
      .executeJavaScript(`new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Normal startup did not render the dashboard.')),10000);
      const check=setInterval(async()=>{if(!document.querySelector('h1'))return;clearInterval(check);try{const state=await window.hunter.call('boot');clearTimeout(timeout);resolve({title:document.title,heading:document.querySelector('h1').textContent,version:state.version});}catch(error){clearTimeout(timeout);reject(error);}},50);
    })`);
    if (result.heading !== "Dashboard")
      throw new Error("Normal startup did not display Dashboard.");
    console.log(
      JSON.stringify({
        startupPassed: true,
        userData: app.getPath("userData"),
        sessionData: app.getPath("sessionData"),
        ...result,
      }),
    );
    app.quit();
  }
  if (smoke) {
    const artifactDirectory = process.env.HUNTER_SMOKE_OUTPUT
      ? path.resolve(process.env.HUNTER_SMOKE_OUTPUT)
      : app.isPackaged
        ? path.join(app.getPath("temp"), "DuplicateHunter-Packaged-Smoke")
        : path.join(__dirname, "../artifacts");
    const failures = [];
    win.webContents.on("render-process-gone", (_e, details) =>
      failures.push(details.reason),
    );
    await new Promise((r) => setTimeout(r, 1500));
    let integration;
    try {
      integration = await require("./smoke.cjs").smokeTest({
        win,
        handle,
        chosen,
        hasWorker: () => Boolean(worker),
        artifactDirectory,
      });
    } catch (e) {
      failures.push(e.stack);
    }
    const result = await win.webContents.executeJavaScript(
      '({title:document.title,bridge:typeof window.hunter,body:document.body.innerText,buttons:document.querySelectorAll("button").length})',
    );
    await fs.mkdir(artifactDirectory, { recursive: true });
    await fs.writeFile(
      path.join(artifactDirectory, "smoke.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await fs.writeFile(
      path.join(artifactDirectory, "smoke-result.json"),
      JSON.stringify({ ...result, integration, failures }, null, 2),
    );
    console.log(JSON.stringify({ integration, failures }, null, 2));
    app.exit(
      failures.length ||
        result.bridge !== "object" ||
        !result.body.includes("Scan Center")
        ? 1
        : 0,
    );
  }
}
const lock = app.requestSingleInstanceLock();
if (!lock) {
  if (process.argv.includes("--startup-check")) {
    console.error(
      "Close the running Duplicate Hunter instance before testing normal startup.",
    );
    app.exit(2);
  } else app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("DaemonCore.DaemonCoreDuplicateHunter");
      database = path.join(app.getPath("userData"), "hunter.sqlite");
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      db = openDatabase(database);
      db.prepare(
        "UPDATE scans SET status='interrupted',finished=? WHERE status='running'",
      ).run(new Date().toISOString());
      await reconcile(db);
      protocol.handle("hunter", async (request) => {
        try {
          const url = new URL(request.url),
            token = tokens.get(url.pathname.slice(1));
          if (
            url.hostname !== "preview" ||
            !token ||
            token.expires < Date.now()
          )
            return new Response("Expired preview", { status: 403 });
          const file = await eligibleFile(token.id);
          return net.fetch(pathToFileURL(file.path).href, {
            headers: request.headers,
          });
        } catch {
          return new Response("Preview unavailable; rescan the file.", {
            status: 404,
          });
        }
      });
      ipcMain.handle("hunter:call", async (event, method, payload) => {
        if (!trusted(event)) return { ok: false, error: "Untrusted request." };
        try {
          return { ok: true, value: await handle(method, payload) };
        } catch (e) {
          return {
            ok: false,
            error:
              e instanceof z.ZodError
                ? "Invalid input: " + e.issues.map((i) => i.message).join("; ")
                : e.message,
          };
        }
      });
      ipcMain.on("hunter:window", (event, command) => {
        if (!trusted(event)) return;
        if (command === "minimize") win.minimize();
        if (command === "maximize") {
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
        }
        if (command === "close") win.close();
      });
      await createWindow();
    })
    .catch(async (e) => {
      console.error(e);
      if (!smoke) dialog.showErrorBox("DaemonCore could not start", e.message);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => db?.close());
}
