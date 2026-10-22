const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const assert = require("node:assert/strict");
const { openDatabase, defaults, summary } = require("../electron/database.cjs");
async function main() {
  const count = Number(process.argv[2] || 10000);
  if (!Number.isInteger(count) || count < 2 || count > 100000 || count % 2)
    throw new Error("Choose an even fixture size between 2 and 100,000.");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-benchmark-")),
    data = path.join(root, "files"),
    database = path.join(root, "benchmark.sqlite");
  let db, timer;
  try {
    await fs.mkdir(data);
    for (let start = 0; start < count / 2; start += 32) {
      await Promise.all(
        Array.from(
          { length: Math.min(32, count / 2 - start) },
          async (_, j) => {
            const i = start + j,
              folder = path.join(data, String(Math.floor(i / 128)));
            await fs.mkdir(folder, { recursive: true });
            const contents = Buffer.alloc(4096, i % 256);
            contents.writeUInt32LE(i, 0);
            const original = path.join(folder, `${i}-original.bin`);
            await fs.writeFile(original, contents);
            await fs.copyFile(original, path.join(folder, `${i}-copy.bin`));
          },
        ),
      );
    }
    db = openDatabase(database);
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO scans(id,started,status,roots,options) VALUES(?,?,?,?,?)",
    ).run(
      id,
      new Date().toISOString(),
      "running",
      JSON.stringify([data]),
      JSON.stringify(defaults),
    );
    let peakRss = process.memoryUsage().rss;
    timer = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 100);
    const start = Date.now();
    await new Promise((resolve, reject) => {
      const worker = new Worker(
        path.join(__dirname, "../electron/scan-worker.cjs"),
        { workerData: { database, id, roots: [data], options: defaults } },
      );
      worker.on("error", reject);
      worker.on("message", (message) => {
        if (message.type === "error") reject(new Error(message.error));
      });
      worker.on("exit", (code) =>
        code ? reject(new Error(`Worker exited ${code}`)) : resolve(),
      );
    });
    const result = summary(db, id);
    assert.equal(result.status, "complete");
    assert.equal(result.files, count);
    assert.equal(result.groups_count, count / 2);
    assert.equal(result.savings, (count / 2) * 4096);
    console.log(
      JSON.stringify(
        {
          files: result.files,
          groups: result.groups_count,
          bytes: result.bytes,
          scanMilliseconds: Date.now() - start,
          peakProcessRssBytes: peakRss,
          errors: result.errors,
        },
        null,
        2,
      ),
    );
  } finally {
    if (timer) clearInterval(timer);
    db?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
