const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const { version } = require(path.join(ROOT, "package.json"));
const RELEASE = process.env.HERMES_RELEASE_DIR
  ? path.resolve(process.env.HERMES_RELEASE_DIR)
  : path.join(ROOT, "release");
const OUTPUT = path.join(ROOT, "release");
const STAGE = path.join(RELEASE, "Hermes-win32-x64");
const ZIP = path.join(OUTPUT, `Hermes-${version}-win32-x64.zip`);
const HOST = path.join(STAGE, "Hermes.exe");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function findPython() {  const candidates = [
    process.env.HERMES_PYTHON,
    "python",
    "py",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Python",
      "bin",
      "python.exe",
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next interpreter; the Windows Store alias fails this check.
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(HOST)) {
    fail('No assembled app. Run "npm run release:win" first.');
  }
  const python = findPython();
  if (!python) {
    fail(
      "Python with castlabs-evs was not found. Install it and try again:\n" +
        "  pip install castlabs-evs",
    );
  }

  const electronPath = path.join(STAGE, "electron.exe");
  const electronSig = path.join(STAGE, "electron.exe.sig");
  const hostSig = path.join(STAGE, "Hermes.exe.sig");

  if (fs.existsSync(electronPath)) {
    console.log(`Signing with ${python} ...`);
    try {
      execFileSync(
        python,
        ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", STAGE],
        { cwd: ROOT, stdio: "inherit" },
      );
    } catch {
      fail(
        "EVS signing failed. Confirm the account with:\n" +
          "  python -m castlabs_evs.account confirm-signup",
      );
    }
    if (!fs.existsSync(electronSig)) {
      fail("EVS produced no electron.exe.sig.");
    }
    fs.copyFileSync(electronSig, hostSig);
  } else if (fs.existsSync(HOST) && fs.existsSync(hostSig)) {
    console.log("Using the already signed Hermes.exe (no Electron host copy).");
  } else {
    fail("No signable Electron host or Hermes.exe signature was found.");
  }

  console.log("Verifying Hermes.exe signature ...");
  execFileSync(python, ["-m", "castlabs_evs.vmp", "verify", HOST], {
    cwd: ROOT,
    stdio: "inherit",
  });

  // These are local test artifacts; never ship them inside the signed package.
  fs.rmSync(path.join(STAGE, "Hermes.exe.dev.sig"), { force: true });
  fs.rmSync(
    path.join(STAGE, "resources", "app", "server", ".next", "server", "route-cache"),
    { recursive: true, force: true },
  );
  // The signed Hermes.exe.sig is the host signature; the duplicate castLabs
  // electron.exe is only needed while signing and would double the download.
  fs.rmSync(path.join(STAGE, "electron.exe"), { force: true });
  fs.rmSync(path.join(STAGE, "electron.exe.sig"), { force: true });

  console.log("Writing signed zip ...");
  const envFile = path.join(STAGE, "hermes.env");
  const held = path.join(path.dirname(STAGE), ".hermes.env.hold");
  const hasEnv = fs.existsSync(envFile);
  const tempDir = path.join(os.tmpdir(), "hermes-release");
  const tempZip = path.join(tempDir, path.basename(ZIP));
  fs.mkdirSync(tempDir, { recursive: true });
  if (hasEnv) fs.renameSync(envFile, held);
  try {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${STAGE}' -DestinationPath '${tempZip}' -CompressionLevel Optimal -Force`,
    ]);
  } finally {
    if (hasEnv) fs.renameSync(held, envFile);
  }

  // OneDrive can briefly lock a large destination while syncing; build the zip
  // off-sync and copy it into place with a few retries.
  let copied = false;
  for (let attempt = 0; attempt < 6 && !copied; attempt += 1) {
    try {
      fs.copyFileSync(tempZip, ZIP);
      copied = true;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
    }
  }
  console.log(
    copied
      ? `\nSigned zip: ${ZIP}`
      : `\nSigned zip could not be copied into ${ZIP}.\nIt is available at: ${tempZip}`,
  );
}

main();
