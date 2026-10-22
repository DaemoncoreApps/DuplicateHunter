const { z } = require("zod");
const folder = z.string().min(1).max(32760);
const settingsSchema = z
  .object({
    minSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    maxSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    extensions: z.string().max(2000),
    exclusions: z.array(folder).max(100),
    protectedFolders: z.array(folder).max(100),
    preferredFolders: z.array(folder).max(100),
    includeHidden: z.boolean(),
    concurrency: z.number().int().min(1).max(8),
    similarity: z.number().int().min(70).max(100),
    scanImages: z.boolean(),
    cleanupMethod: z.enum(["recycle", "quarantine"]),
    keepPolicy: z.enum(["preferred", "oldest", "newest"]),
    notifications: z.boolean(),
    reducedMotion: z.boolean(),
  })
  .strict()
  .refine((s) => !s.maxSize || s.maxSize >= s.minSize, {
    message:
      "Maximum size must be zero (unlimited) or at least the minimum size.",
  });
const idsSchema = z.array(z.number().int().positive()).min(1).max(1000);
const querySchema = z
  .object({
    scanId: z.string().uuid(),
    offset: z.number().int().min(0).max(10000000).default(0),
    search: z.string().max(500).default(""),
    kind: z.enum(["all", "video"]).default("all"),
    sort: z.enum(["size", "copies", "path"]).default("size"),
    category: z
      .enum([
        "all",
        "images",
        "video",
        "audio",
        "documents",
        "archives",
        "other",
      ])
      .default("all"),
    minSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    maxSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    minCopies: z.number().int().min(2).max(1000000).default(2),
    crossFolders: z.boolean().default(false),
    directory: z.string().max(32760).default(""),
  })
  .strict()
  .refine((q) => !q.maxSize || q.maxSize >= q.minSize, {
    message: "Maximum result size must be at least the minimum size.",
  });
module.exports = { settingsSchema, idsSchema, querySchema };
