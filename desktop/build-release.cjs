const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CACHE =
  process.env.HERMES_RELEASE_CACHE ||
  path.join(process.env.LOCALAPPDATA || ROOT, "hermes-release");
const DIST = path.join(CACHE, "castlabs", "dist");
const RCEDIT = path.join(CACHE, "rcedit-x64.exe");
const { version } = require(path.join(ROOT, "package.json"));
const RELEASE = process.env.HERMES_RELEASE_DIR
  ? path.resolve(process.env.HERMES_RELEASE_DIR)
  : path.join(ROOT, "release");
const OUTPUT = path.join(ROOT, "release");
const STAGE = path.join(RELEASE, "Hermes-win32-x64");
const ZIP = path.join(OUTPUT, `Hermes-${version}-win32-x64.zip`);

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function zipStage() {
  // Never ship per-user credentials; the example file stays in the zip.
  const envFile = path.join(STAGE, "hermes.env");
  const held = path.join(path.dirname(STAGE), ".hermes.env.hold");
  const hasEnv = fs.existsSync(envFile);
  if (hasEnv) fs.renameSync(envFile, held);
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${STAGE}' -DestinationPath '${ZIP}' -CompressionLevel Optimal -Force`,
      ],
      { stdio: "inherit" },
    );
  } finally {
    if (hasEnv) fs.renameSync(held, envFile);
  }
}

function main() {
  if (!fs.existsSync(path.join(DIST, "electron.exe"))) {
    fail(
      `castLabs Electron is missing at ${DIST}.\n` +
        "Download electron-v44.9.3+wvcus-win32-x64.zip from\n" +
        "https://github.com/castlabs/electron-releases/releases and extract it there.",
    );
  }
  if (!fs.existsSync(RCEDIT)) {
    fail(`rcedit is missing at ${RCEDIT}.`);
  }
  const standalone = path.join(ROOT, ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) {
    fail('No standalone build. Run "npm run build" first.');
  }

  const envFile = path.join(STAGE, "hermes.env");
  const savedEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile) : null;

  // Only clear our own staging folder. The release directory may also hold a
  // user's extracted build; never delete anything outside the stage.
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
  console.log("Copying the Widevine Electron runtime...");
  copy(DIST, STAGE);
  fs.renameSync(path.join(STAGE, "electron.exe"), path.join(STAGE, "Hermes.exe"));
  const signature = path.join(STAGE, "electron.exe.sig");
  if (fs.existsSync(signature)) {
    fs.renameSync(signature, path.join(STAGE, "Hermes.exe.sig"));
  }
  fs.rmSync(path.join(STAGE, "resources", "default_app.asar"), { force: true });

  console.log("Assembling resources/app...");
  const appDir = path.join(STAGE, "resources", "app");
  fs.mkdirSync(appDir, { recursive: true });
  copy(path.join(__dirname, "main.cjs"), path.join(appDir, "main.cjs"));
  copy(path.join(__dirname, "preload.cjs"), path.join(appDir, "preload.cjs"));
  copy(path.join(__dirname, "assets"), path.join(appDir, "assets"));
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "hermes",
        productName: "Hermes",
        version,
        main: "main.cjs",
        description: "Hermes — music in glass",
      },
      null,
      2,
    ),
  );

  console.log("Bundling the Next.js standalone server...");
  const serverDir = path.join(appDir, "server");
  copy(standalone, serverDir);
  copy(path.join(ROOT, ".next", "static"), path.join(serverDir, ".next", "static"));
  copy(path.join(ROOT, "public"), path.join(serverDir, "public"));

  // The EVS package signature is attached to electron.exe. Brand that host,
  // then copy it to Hermes.exe so the shipped exe carries both the icon and
  // the refreshed production signature (release:sign copies the new .sig).
  copy(path.join(DIST, "electron.exe"), path.join(STAGE, "electron.exe"));
  const distSig = path.join(DIST, "electron.exe.sig");
  if (fs.existsSync(distSig)) {
    copy(distSig, path.join(STAGE, "electron.exe.sig"));
  }

  if (process.env.HERMES_BRAND_RCEDIT) {
    console.log("Branding the Electron host (HERMES_BRAND_RCEDIT enabled)...");
    const numeric = version.split(".").concat(["0", "0"]).slice(0, 4).join(".");
    execFileSync(
      RCEDIT,
      [
        path.join(STAGE, "electron.exe"),
        "--set-icon",
        path.join(appDir, "assets", "icon.ico"),
        "--set-version-string",
        "ProductName",
        "Hermes",
        "--set-version-string",
        "FileDescription",
        "Hermes - music in glass",
        "--set-version-string",
        "CompanyName",
        "Hermes",
        "--set-file-version",
        numeric,
        "--set-product-version",
        numeric,
      ],
      { stdio: "inherit" },
    );
  } else {
    console.log(
      "Leaving the castLabs host unbranded (set HERMES_BRAND_RCEDIT=1 to brand before signing).",
    );
  }

  copy(path.join(STAGE, "electron.exe"), path.join(STAGE, "Hermes.exe"));
  fs.rmSync(path.join(STAGE, "Hermes.exe.sig"), { force: true });

  if (savedEnv) {
    fs.writeFileSync(envFile, savedEnv);
    console.log("Preserved the existing hermes.env.");
  }

  fs.writeFileSync(
    path.join(STAGE, "hermes.env.example"),
    [
      "# Spotify app credentials — create your own app at",
      "# https://developer.spotify.com/dashboard",
      "# Keep these server-only. Rename this file to hermes.env next to Hermes.exe.",
      "SPOTIFY_CLIENT_ID=",
      "SPOTIFY_CLIENT_SECRET=",
      "SPOTIFY_MARKET=",
      "SPOTIFY_REDIRECT_URI=http://127.0.0.1:47100/api/auth/spotify/callback",
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(STAGE, "README.txt"),
    [
      "Hermes — music in glass",
      "",
      "1. Open https://developer.spotify.com/dashboard and create an app.",
      "2. Add this Redirect URI exactly:",
      "   http://127.0.0.1:47100/api/auth/spotify/callback",
      "3. Copy hermes.env.example to %APPDATA%\\Hermes\\hermes.env (the app also",
      "   migrates a hermes.env placed next to Hermes.exe) and fill in",
      "   SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from that app.",
      "4. Start Hermes.exe, connect Spotify, play a song.",
      "",
      "The always-on-top float opens from the full player's Float/Minimize control",
      "or the floating card's pop-out button.",
      "",
      "Spotify audio needs Widevine. This build uses the castLabs Widevine Electron",
      "runtime, which installs the CDM on first launch. Spotify's license server",
      "returns intermittent 500s for unsigned Electron packages, which can pause or",
      "skip playback for the first seconds. Hermes retries automatically, but for a",
      "stable release sign this folder with castLabs EVS first:",
      "  pip install castlabs-evs",
      "  python -m castlabs_evs.account signup   (one-time email verification)",
      "  python -m castlabs_evs.vmp sign-pkg <this folder>",
      "",
    ].join("\n"),
  );

  console.log("Writing zip...");
  zipStage();

  const mb = (file) => `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
  console.log(`\nApp:  ${STAGE}`);
  console.log(`Zip:  ${ZIP} (${mb(ZIP)})`);
}

main();
