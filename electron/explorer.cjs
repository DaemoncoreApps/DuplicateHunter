const { recommendation } = require("./files.cjs");
const { querySchema } = require("./validation.cjs");
const { protectedPath } = require("./cleanup.cjs");

const categories = {
  images: [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".avif",
    ".heic",
  ],
  video: [
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".webm",
    ".wmv",
    ".m4v",
    ".mpg",
    ".mpeg",
  ],
  audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".opus"],
  documents: [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".rtf",
    ".csv",
    ".odt",
    ".md",
  ],
  archives: [".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz", ".iso"],
};

function queryGroups(db, input, settings, systemFolders = []) {
  const q = querySchema.parse(input),
    predicates = ["COUNT(*)>=?"],
    args = [q.scanId, q.minCopies];
  if (q.minSize) {
    predicates.push("MIN(size)>=?");
    args.push(q.minSize);
  }
  if (q.maxSize) {
    predicates.push("MIN(size)<=?");
    args.push(q.maxSize);
  }
  if (q.crossFolders) predicates.push("COUNT(DISTINCT directory)>1");
  if (q.search) {
    predicates.push(
      "SUM(CASE WHEN path LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)>0",
    );
    args.push("%" + q.search.replace(/[\\%_]/g, "\\$&") + "%");
  }
  if (q.directory) {
    predicates.push("SUM(CASE WHEN directory=? THEN 1 ELSE 0 END)>0");
    args.push(q.directory);
  }
  const category = q.kind === "video" ? "video" : q.category;
  if (category !== "all") {
    const extensions =
      category === "other"
        ? [...new Set(Object.values(categories).flat())]
        : categories[category];
    predicates.push(
      `SUM(CASE WHEN ext ${category === "other" ? "NOT IN" : "IN"} (${extensions.map(() => "?").join(",")}) THEN 1 ELSE 0 END)>0`,
    );
    args.push(...extensions);
  }
  const grouped = `SELECT group_id,MIN(hash) hash,MIN(size) size,MIN(path) first_path,COUNT(*) copies,COUNT(DISTINCT directory) folders,MIN(size)*(COUNT(*)-1) savings FROM files WHERE scan_id=? AND group_id IS NOT NULL AND state='present' GROUP BY group_id HAVING ${predicates.join(" AND ")}`;
  const order = {
    size: "savings DESC,group_id",
    copies: "copies DESC,savings DESC,group_id",
    path: "first_path ASC,group_id",
  }[q.sort];
  const totals = db
    .prepare(
      `SELECT COUNT(*) total,COALESCE(SUM(savings),0) savings,COALESCE(SUM(copies),0) copies FROM (${grouped})`,
    )
    .get(...args);
  const groups = db
    .prepare(`SELECT * FROM (${grouped}) ORDER BY ${order} LIMIT 30 OFFSET ?`)
    .all(...args, q.offset);
  return {
    ...totals,
    groups: groups.map((g) => {
      const files = db
        .prepare(
          "SELECT * FROM files WHERE scan_id=? AND group_id=? AND state='present' ORDER BY path LIMIT 1001",
        )
        .all(q.scanId, g.group_id);
      const protectedFiles = files.filter(
        (f) => protectedPath(f.path, settings, systemFolders) || f.nlink > 1,
      );
      const keep = recommendation(
        protectedFiles.length ? protectedFiles : files,
        settings,
      );
      if (protectedFiles.length)
        keep.reason =
          "Inside a protected folder. Keep this copy and review the others.";
      return {
        ...g,
        files: files.slice(0, 1000).map((f) => ({
          ...f,
          protected:
            protectedPath(f.path, settings, systemFolders) || f.nlink > 1,
        })),
        truncated: files.length > 1000,
        keep,
      };
    }),
  };
}
module.exports = { queryGroups, categories };
