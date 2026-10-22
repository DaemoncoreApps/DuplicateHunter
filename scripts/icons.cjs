const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
async function main() {
  const root = path.join(__dirname, "..");
  await fs.mkdir(path.join(root, "build/appx"), { recursive: true });
  const source = path.join(root, "public/daemoncore-logo-transparent.png");
  const appMark = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="rim" x1=".14" y1=".1" x2=".86" y2=".94">
          <stop stop-color="#ff657b"/><stop offset=".5" stop-color="#ed263e"/><stop offset="1" stop-color="#a80d28"/>
        </linearGradient>
        <radialGradient id="field" cx=".38" cy=".28" r=".9">
          <stop stop-color="#25232c"/><stop offset="1" stop-color="#080a10"/>
        </radialGradient>
        <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ff465d"/><stop offset="1" stop-color="#bd102c"/>
        </linearGradient>
        <filter id="glow" x="-.5" y="-.5" width="2" height="2">
          <feGaussianBlur stdDeviation="10" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="12" y="12" width="488" height="488" rx="132" fill="url(#field)" stroke="#38313a" stroke-width="3"/>
      <path d="M333 333 431 431" fill="none" stroke="#05060a" stroke-width="75" stroke-linecap="round"/>
      <path d="M333 333 431 431" fill="none" stroke="url(#rim)" stroke-width="45" stroke-linecap="round"/>
      <circle cx="228" cy="222" r="147" fill="#0b0d13" stroke="#08090d" stroke-width="34"/>
      <circle cx="228" cy="222" r="147" fill="none" stroke="url(#rim)" stroke-width="23" filter="url(#glow)"/>
      <circle cx="228" cy="222" r="128" fill="none" stroke="#ff8995" stroke-opacity=".58" stroke-width="3"/>
      <path d="M189 139h71l48 48v121q0 13-13 13h-106q-13 0-13-13V152q0-13 13-13Z" fill="#15141a" stroke="#f9d6dc" stroke-width="12" stroke-linejoin="round"/>
      <path d="M260 140v43q0 6 7 6h40" fill="none" stroke="#f9d6dc" stroke-width="10" stroke-linejoin="round"/>
      <path d="M145 190h72l48 48v105q0 13-13 13h-107q-13 0-13-13V203q0-13 13-13Z" fill="#111117" stroke="url(#page)" stroke-width="13" stroke-linejoin="round"/>
      <path d="M217 191v43q0 6 7 6h40" fill="none" stroke="#ff6074" stroke-width="11" stroke-linejoin="round"/>
      <path d="M331 324 428 421" fill="none" stroke="#ff8795" stroke-opacity=".8" stroke-width="5" stroke-linecap="round"/>
    </svg>`);
  await sharp(appMark)
    .resize(512, 512, { fit: "contain", background: "#0b0c10" })
    .flatten({ background: "#0b0c10" })
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
    const useAppMark = [
      "StoreLogo",
      "Square44x44Logo",
      "Square150x150Logo",
      "SmallTile",
    ].includes(name);
    const icon = sharp(useAppMark ? appMark : source);
    await icon
      .resize(w, h, { fit: "contain", background: "#0b0c10" })
      .flatten({ background: "#0b0c10" })
      .png()
      .toFile(path.join(root, `build/appx/${name}.png`));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
