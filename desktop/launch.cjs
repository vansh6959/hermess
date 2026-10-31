const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const stockElectron = require("electron");

const castLabsExe = path.join(
  process.env.LOCALAPPDATA || "",
  "hermes-release",
  "castlabs",
  "dist",
  "electron.exe",
);
const electronBin = fs.existsSync(castLabsExe) ? castLabsExe : stockElectron;

const env = { ...process.env };
// Some Electron-based terminals export this; it would run our app as Node
// instead of opening the desktop windows.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  electronBin,
  [path.join(__dirname, "main.cjs"), ...process.argv.slice(2)],
  {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    windowsHide: false,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
