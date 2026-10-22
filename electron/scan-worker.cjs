const { parentPort, workerData } = require("node:worker_threads");
const { openDatabase } = require("./database.cjs");
const { scan } = require("./scanner.cjs");
const controls = { paused: false, cancelled: false };
parentPort.on("message", (command) => {
  if (command === "pause") controls.paused = true;
  if (command === "resume") controls.paused = false;
  if (command === "cancel") {
    controls.cancelled = true;
    controls.paused = false;
  }
});
const db = openDatabase(workerData.database);
// Scan results can be rebuilt after power loss. Cleanup journals use the main
// connection's FULL durability; avoid forcing a disk flush for every fingerprint.
db.exec("PRAGMA synchronous=NORMAL");
scan(
  db,
  workerData.id,
  workerData.roots,
  workerData.options,
  controls,
  (progress) => parentPort.postMessage({ type: "progress", progress }),
)
  .then(() => parentPort.postMessage({ type: "done" }))
  .catch((e) => parentPort.postMessage({ type: "error", error: e.message }))
  .finally(() => {
    db.close();
    parentPort.close();
  });
