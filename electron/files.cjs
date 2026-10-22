const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const canonical = (p) =>
  process.platform === "win32"
    ? path.resolve(p).toLowerCase()
    : path.resolve(p);
const within = (child, parent) => {
  const rel = path.relative(canonical(parent), canonical(child));
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
};
function signature(stat) {
  if (typeof stat.ino !== "bigint" || typeof stat.dev !== "bigint")
    throw new TypeError("File identities must be read with bigint stats.");
  if (!Number.isSafeInteger(Number(stat.size)))
    throw new Error(
      "File size exceeds the exact numeric range supported by this build.",
    );
  return {
    size: Number(stat.size),
    mtime: Number(stat.mtimeMs),
    ctime: Number(stat.ctimeMs),
    dev: String(stat.dev),
    ino: String(stat.ino),
    nlink: Number(stat.nlink),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
  };
}
function unchanged(stat, file) {
  const s = signature(stat);
  return (
    !stat.isSymbolicLink() &&
    stat.isFile() &&
    [
      "size",
      "mtime",
      "ctime",
      "dev",
      "ino",
      "nlink",
      "mtime_ns",
      "ctime_ns",
    ].every((k) => s[k] === file[k])
  );
}
async function assertNoLinks(filename) {
  let cursor = path.resolve(filename);
  while (true) {
    const stat = await fs.lstat(cursor, { bigint: true });
    if (stat.isSymbolicLink())
      throw new Error("Symbolic links and junctions cannot be modified.");
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
async function readExactly(handle, buffer, length, position, checkpoint) {
  let read = 0;
  while (read < length) {
    await checkpoint();
    const { bytesRead } = await handle.read(
      buffer,
      read,
      length - read,
      position + read,
    );
    if (!bytesRead) throw new Error("Unexpected end of file.");
    read += bytesRead;
  }
}
async function hashFile(file, partial = false, checkpoint = async () => {}) {
  const before = await fs.lstat(file.path, { bigint: true });
  if (!unchanged(before, file))
    throw new Error("File changed since discovery.");
  const handle = await fs.open(file.path, "r");
  try {
    if (!unchanged(await handle.stat({ bigint: true }), file))
      throw new Error("File changed while opening.");
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(256 * 1024);
    if (partial) {
      for (const offset of [
        ...new Set([
          0,
          Math.max(0, Math.floor(file.size / 2) - 32768),
          Math.max(0, file.size - 65536),
        ]),
      ]) {
        await checkpoint();
        const length = Math.min(65536, file.size - offset);
        await readExactly(handle, buffer, length, offset, checkpoint);
        hash.update(buffer.subarray(0, length));
      }
    } else {
      let offset = 0;
      while (offset < file.size) {
        await checkpoint();
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, file.size - offset),
          offset,
        );
        if (!bytesRead) throw new Error("Unexpected end of file.");
        hash.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
    }
    if (
      !unchanged(await handle.stat({ bigint: true }), file) ||
      !unchanged(await fs.lstat(file.path, { bigint: true }), file)
    )
      throw new Error("File changed during hashing.");
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}
async function equalFiles(a, b, checkpoint = async () => {}) {
  if (a.size !== b.size) return false;
  const handles = [];
  try {
    handles.push(await fs.open(a.path, "r"));
    handles.push(await fs.open(b.path, "r"));
    for (let i = 0; i < 2; i++)
      if (!unchanged(await handles[i].stat({ bigint: true }), [a, b][i]))
        throw new Error("File changed before comparison.");
    const buffers = [
      Buffer.allocUnsafe(256 * 1024),
      Buffer.allocUnsafe(256 * 1024),
    ];
    for (let offset = 0; offset < a.size; offset += buffers[0].length) {
      await checkpoint();
      const size = Math.min(buffers[0].length, a.size - offset);
      const reads = await Promise.allSettled(
        handles.map((h, i) =>
          readExactly(h, buffers[i], size, offset, checkpoint),
        ),
      );
      const failed = reads.find((r) => r.status === "rejected");
      if (failed) throw failed.reason;
      if (!buffers[0].subarray(0, size).equals(buffers[1].subarray(0, size)))
        return false;
    }
    for (let i = 0; i < 2; i++)
      if (
        !unchanged(await handles[i].stat({ bigint: true }), [a, b][i]) ||
        !unchanged(await fs.lstat([a, b][i].path, { bigint: true }), [a, b][i])
      )
        throw new Error("File changed during comparison.");
    return true;
  } finally {
    await Promise.all(handles.map((h) => h.close()));
  }
}
function recommendation(files, settings) {
  const ranked = [...files].sort((a, b) => {
    const preference = (f) => {
      const i = settings.preferredFolders.findIndex((p) => within(f.path, p));
      return i < 0 ? 10000 : i;
    };
    const preferred = preference(a) - preference(b);
    if (preferred) return preferred;
    if (settings.keepPolicy === "oldest" && a.mtime !== b.mtime)
      return a.mtime - b.mtime;
    if (settings.keepPolicy === "newest" && a.mtime !== b.mtime)
      return b.mtime - a.mtime;
    return a.path.length - b.path.length || a.path.localeCompare(b.path);
  });
  const chosen = ranked[0];
  return {
    id: chosen.id,
    reason: settings.preferredFolders.some((p) => within(chosen.path, p))
      ? "Inside a preferred folder you chose."
      : settings.keepPolicy === "oldest"
        ? "Oldest modified copy, following your preference."
        : settings.keepPolicy === "newest"
          ? "Newest modified copy, following your preference."
          : "Shortest path as a tie-breaker. Review before keeping; this does not identify the original.",
  };
}
module.exports = {
  canonical,
  within,
  signature,
  unchanged,
  assertNoLinks,
  hashFile,
  equalFiles,
  recommendation,
};
