const path = require("node:path");

function profilePath(appData) {
  // The display name contains a colon, which cannot appear in a Windows folder.
  // Keep this stable across branding changes and application upgrades.
  return path.join(appData, "daemoncore-duplicate-hunter");
}

module.exports = { profilePath };
