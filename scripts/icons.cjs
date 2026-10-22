const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
async function main() {
  const root = path.join(__dirname, "..");
  await fs.mkdir(path.join(root, "build/appx"), { recursive: true });
  const source = path.join(root, "public/daemoncore-logo.png");
  await sharp(source)
    .resize(512, 512, { fit: "contain", background: "#0b0c10" })
    .png()
    .toFile(path.join(root, "build/icon.png"));
  const { default: pngToIco } = await import("png-to-ico");
  await fs.writeFile(
    path.join(root, "build/icon.ico"),
    await pngToIco(path.join(root, "build/icon.png")),
  );
  for (const [name, w, h] of [
    ["StoreLogo", 50, 50],
    ["Square44x44Logo", 44, 44],
    ["Square150x150Logo", 150, 150],
    ["Wide310x150Logo", 310, 150],
    ["LargeTile", 310, 310],
    ["SmallTile", 71, 71],
    ["SplashScreen", 620, 300],
  ]) {
    await sharp(source)
      .resize(w, h, { fit: "contain", background: "#0b0c10" })
      .png()
      .toFile(path.join(root, `build/appx/${name}.png`));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
