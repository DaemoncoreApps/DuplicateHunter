const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function smokeTest({ win, handle, chosen, hasWorker }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-electron-"));
  const checks = [];
  const wait = async (predicate) => {
    const start = Date.now();
    while (!(await predicate())) {
      if (Date.now() - start > 20000)
        throw new Error("Timed out waiting for Electron smoke condition.");
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  const navigate = async (label) => {
    await evaluate(
      `Array.from(document.querySelectorAll('nav button')).find(b=>b.innerText.includes(${JSON.stringify(label)})).click()`,
    );
    await wait(() =>
      evaluate(
        `document.querySelector('h1')?.innerText===${JSON.stringify(label)}`,
      ),
    );
    assert.equal(
      await evaluate('Boolean(document.querySelector("main"))'),
      true,
    );
    checks.push(`Navigation: ${label}`);
  };
  try {
    await fs.writeFile(
      path.join(root, "original.txt"),
      "This is a real disposable duplicate fixture.",
    );
    await fs.writeFile(
      path.join(root, "duplicate.txt"),
      "This is a real disposable duplicate fixture.",
    );
    await fs.writeFile(path.join(root, "unique.txt"), "Unique file.");
    const sharp = require("sharp");
    await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#aa2233" },
    })
      .png()
      .toFile(path.join(root, "image.png"));
    await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#aa2233" },
    })
      .jpeg()
      .toFile(path.join(root, "similar.jpg"));
    const initial = await handle("boot");
    chosen.add(process.platform === "win32" ? root.toLowerCase() : root);
    const options = {
      ...initial.settings,
      scanImages: true,
      notifications: false,
    };
    await handle("saveSettings", options);
    const id = await evaluate(
      `window.hunter.call('startScan',${JSON.stringify({ roots: [root], options })})`,
    );
    await wait(() => !hasWorker());
    const state = await handle("boot", id);
    assert.equal(state.summary.status, "complete");
    assert.equal(state.summary.files, 5);
    assert.equal(state.summary.groups_count, 1);
    checks.push("Worker scan and SQLite persistence");
    const exact = await handle("groups", { scanId: id });
    assert.equal(exact.total, 1);
    const similar = await handle("pairs", {
      scanId: id,
      offset: 0,
      threshold: 90,
    });
    assert.equal(similar.total, 1);
    checks.push("Real image decoding and similarity index");
    const analytics = await handle("analytics", id);
    assert.equal(analytics.directories[0].count, 2);
    assert.equal(analytics.sizes[0].bytes, state.summary.savings);
    checks.push("Directory, drive, and size analytics");
    await assert.rejects(
      handle("startScan", { roots: [path.dirname(root)], options }),
      /picker/,
    );
    checks.push("Scan location capability validation");
    await assert.rejects(handle("groups", { scanId: "not-an-id" }));
    checks.push("IPC payload validation");
    for (const page of [
      "Dashboard",
      "Scan Center",
      "Duplicate Explorer",
      "Similar Images",
      "Video Intelligence",
      "Storage Analytics",
      "Cleanup Center",
      "Recovery Center",
      "Scan History",
      "Settings",
    ])
      await navigate(page);
    await navigate("Duplicate Explorer");
    await wait(() =>
      evaluate('document.querySelectorAll(".group-heading").length===1'),
    );
    await evaluate('document.querySelector(".group-heading").click()');
    await wait(() =>
      evaluate('document.querySelectorAll(".file-row").length===2'),
    );
    await evaluate(
      'document.querySelector(".file-row").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:500,clientY:400}))',
    );
    await wait(() =>
      evaluate('Boolean(document.querySelector("[role=menu]"))'),
    );
    await evaluate('document.querySelector("main h1").click()');
    checks.push("File context menu");
    await evaluate(
      'Array.from(document.querySelectorAll(".group-body button")).find(b=>b.innerText.includes("Select other copies")).click()',
    );
    await navigate("Cleanup Center");
    await wait(() =>
      evaluate('document.querySelectorAll(".cleanup-file").length===1'),
    );
    await evaluate(
      'Array.from(document.querySelectorAll("main button")).find(b=>b.innerText.includes("Validate dry run")).click()',
    );
    await wait(() =>
      evaluate('Boolean(document.querySelector(".validation-pass"))'),
    );
    checks.push("Renderer selection and IPC dry-run validation");
    await assert.rejects(
      handle(
        "previewCleanup",
        exact.groups[0].files.map((f) => f.id),
      ),
      /retain/,
    );
    checks.push("Keep-one-copy cleanup guard");
    const image = similar.pairs[0].a;
    const url = await handle("fileAction", { id: image.id, action: "preview" });
    const loaded = await evaluate(
      `new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=${JSON.stringify(url)};})`,
    );
    assert.equal(loaded, true);
    checks.push("Scoped local preview protocol");
    assert.equal(await evaluate("typeof window.require"), "undefined");
    assert.equal(await evaluate("typeof window.process"), "undefined");
    checks.push("Sandboxed renderer without Node globals");
    await navigate("Dashboard");
    return { passed: true, checks };
  } finally {
    if (hasWorker()) await handle("control", "cancel");
    await wait(() => !hasWorker());
    await fs.rm(root, { recursive: true, force: true });
  }
}
module.exports = { smokeTest };
