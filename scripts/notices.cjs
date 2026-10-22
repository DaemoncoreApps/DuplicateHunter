const fs = require("node:fs/promises");
const path = require("node:path");
async function main() {
  const root = path.join(__dirname, ".."),
    out = path.join(root, "build/notices");
  await fs.mkdir(out, { recursive: true });
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  const packages = [];
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location || entry.dev) continue;
    const folder = path.join(root, location);
    let pkg;
    try {
      pkg = JSON.parse(
        await fs.readFile(path.join(folder, "package.json"), "utf8"),
      );
    } catch {
      continue;
    }
    const name = pkg.name.replaceAll("/", "__").replaceAll("@", "");
    const destination = path.join(out, name);
    await fs.mkdir(destination, { recursive: true });
    for (const file of await fs.readdir(folder, { withFileTypes: true })) {
      if (
        file.isFile() &&
        /^(licen[cs]e|copying|notice|readme|versions\.json)/i.test(file.name)
      )
        await fs.copyFile(
          path.join(folder, file.name),
          path.join(destination, file.name),
        );
    }
    packages.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      repository: pkg.repository,
    });
  }
  await fs.writeFile(
    path.join(out, "packages.json"),
    JSON.stringify(packages, null, 2) + "\n",
  );
  for (const name of ["LICENSE", "LICENSES.chromium.html"])
    await fs.copyFile(
      path.join(root, "node_modules/electron/dist", name),
      path.join(out, name === "LICENSE" ? "LICENSE.electron.txt" : name),
    );
  await fs.copyFile(
    path.join(root, "THIRD-PARTY.md"),
    path.join(out, "THIRD-PARTY.md"),
  );
  console.log(
    `Collected notices for ${packages.length} installed runtime packages, Electron, and Chromium.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
