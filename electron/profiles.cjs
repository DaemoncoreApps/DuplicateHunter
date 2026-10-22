const { z } = require("zod");
const crypto = require("node:crypto");
const path = require("node:path");
const { settingsSchema } = require("./validation.cjs");
const profileSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(60),
    roots: z
      .array(
        z
          .string()
          .min(1)
          .max(32760)
          .refine(
            (root) => path.isAbsolute(root),
            "Profile locations must use absolute paths.",
          ),
      )
      .min(1)
      .max(50),
    options: settingsSchema,
  })
  .strict();
function readProfiles(db) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key='scanProfiles'")
    .get();
  return row ? JSON.parse(row.value) : [];
}
function saveProfile(db, input) {
  const value = profileSchema.parse(input),
    profiles = readProfiles(db),
    existing = value.id ? profiles.findIndex((p) => p.id === value.id) : -1;
  if (value.id && existing < 0) throw new Error("Scan profile not found.");
  if (existing < 0 && profiles.length >= 20)
    throw new Error("Keep up to 20 saved scan profiles.");
  if (
    profiles.some(
      (p) =>
        p.name.toLowerCase() === value.name.toLowerCase() && p.id !== value.id,
    )
  )
    throw new Error("A profile with that name already exists.");
  const profile = {
    ...value,
    id: value.id || crypto.randomUUID(),
    updated: new Date().toISOString(),
  };
  if (existing >= 0) profiles[existing] = profile;
  else profiles.unshift(profile);
  db.prepare("INSERT OR REPLACE INTO settings VALUES('scanProfiles',?)").run(
    JSON.stringify(profiles),
  );
  return profiles;
}
function deleteProfile(db, id) {
  const parsedId = z.string().uuid().parse(id);
  const profiles = readProfiles(db).filter((p) => p.id !== parsedId);
  db.prepare("INSERT OR REPLACE INTO settings VALUES('scanProfiles',?)").run(
    JSON.stringify(profiles),
  );
  return profiles;
}
module.exports = { readProfiles, saveProfile, deleteProfile, profileSchema };
