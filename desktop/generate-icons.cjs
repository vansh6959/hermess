const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SVG = fs.readFileSync(path.join(ROOT, "public", "favicon.svg"), "utf8");
const OUT = path.join(ROOT, "desktop", "assets");
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${SVG}`,
    );
    await page.screenshot({
      path: path.join(OUT, `icon-${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }
  await browser.close();

  const entries = [16, 32, 48, 64, 128, 256];
  const pngs = entries.map((size) =>
    fs.readFileSync(path.join(OUT, `icon-${size}.png`)),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;
  entries.forEach((size, index) => {
    const at = index * 16;
    const dimension = size === 256 ? 0 : size;
    directory.writeUInt8(dimension, at);
    directory.writeUInt8(dimension, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(pngs[index].length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += pngs[index].length;
  });

  fs.writeFileSync(
    path.join(OUT, "icon.ico"),
    Buffer.concat([header, directory, ...pngs]),
  );
  fs.copyFileSync(
    path.join(OUT, "icon-512.png"),
    path.join(OUT, "icon.png"),
  );
  console.log("icons:", SIZES.join(", "), "+ icon.ico");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
