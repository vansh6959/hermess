const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, powerSaveBlocker } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

app.setName("Hermes");
// Spotify's Widevine license edge rejects the Electron token in the UA with a
// bare 500; present the same Chromium build as a normal Chrome browser.
app.userAgentFallback =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

// Prevent background suspension or throttling of audio playback and Web SDK timers.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const ROOT = path.resolve(__dirname, "..");
const PRELOAD = path.join(__dirname, "preload.cjs");
const ICON = path.join(__dirname, "assets", "icon.ico");
const FLOATING_SIZE = { width: 372, height: 140 };
const PACKAGED_URL = "http://127.0.0.1:47100";
const NO_SPAWN = process.argv.includes("--no-spawn");
const IS_PACKAGED = app.isPackaged;

function argValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const APP_URL =
  argValue("--url") ||
  process.env.HERMES_DESKTOP_URL ||
  (IS_PACKAGED ? PACKAGED_URL : "http://127.0.0.1:3000");

let mainWindow = null;
let floatingWindow = null;
let floatingDrag = null;
let serverProcess = null;
let quitting = false;

function probe(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on("error", () => resolve(false));
    // A first dev-server request may compile several routes before replying.
    request.setTimeout(2_500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

function readEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const values = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const equals = line.indexOf("=");
      if (equals <= 0) continue;
      const key = line.slice(0, equals).trim();
      let value = line.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

function migrateLocalEnv() {
  try {
    const local = path.join(path.dirname(process.execPath), "hermes.env");
    const user = path.join(app.getPath("userData"), "hermes.env");
    if (fs.existsSync(local) && !fs.existsSync(user)) {
      fs.mkdirSync(path.dirname(user), { recursive: true });
      fs.copyFileSync(local, user);
    }
  } catch {
    // Config migration is best-effort; the local file is still read.
  }
}

function packagedEnv() {
  migrateLocalEnv();
  const candidates = [path.join(path.dirname(process.execPath), "hermes.env")];
  try {
    candidates.push(path.join(app.getPath("userData"), "hermes.env"));
  } catch {
    // userData is unavailable before the app is ready on some platforms.
  }
  const values = candidates.reduce(
    (acc, file) => ({ ...acc, ...readEnvFile(file) }),
    {},
  );
  const port = new URL(APP_URL).port || "47100";
  values.HERMES_STATS_STORE =
    values.HERMES_STATS_STORE ||
    path.join(app.getPath("userData"), "data", "spotify-stats.json");
  values.SPOTIFY_REDIRECT_URI =
    values.SPOTIFY_REDIRECT_URI ||
    `http://127.0.0.1:${port}/api/auth/spotify/callback`;
  return values;
}

function isHermesServer(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/spotify/status`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(
          response.statusCode === 200 && body.includes('"provider":"spotify"'),
        );
      });
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await probe(APP_URL)) {
    if (!IS_PACKAGED || (await isHermesServer(APP_URL))) {
      // A server left behind by a hard-killed instance can be reused.
      return;
    }
    throw new Error(
      `Another application is already using ${APP_URL}. Close it and reopen Hermes.`,
    );
  }

  if (IS_PACKAGED) {
    const port = Number(new URL(APP_URL).port || "47100");
    if (!(await portFree(port, "127.0.0.1"))) {
      throw new Error(
        `Port ${port} is already in use. Close the application using it and reopen Hermes.`,
      );
    }
    const serverDir = path.join(__dirname, "server");
    const serverEntry = path.join(serverDir, "server.js");
    if (!fs.existsSync(serverEntry)) {
      throw new Error("The bundled Hermes server is missing. Reinstall the app.");
    }
    const env = packagedEnv();
    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: serverDir,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
      },
    });
    serverProcess.on("exit", () => {
      serverProcess = null;
    });
    if (!(await waitForServer(APP_URL, 90_000))) {
      throw new Error(`Hermes could not start its local server at ${APP_URL}.`);
    }
    return;
  }

  // desktop:dev is connect-only: never spawn a production server under a dev
  // server, and wait long enough for the first dev compile.
  if (await waitForServer(APP_URL, NO_SPAWN ? 30_000 : 4_000)) return;

  if (NO_SPAWN) {
    throw new Error(
      `No Hermes dev server found at ${APP_URL}. Start "npm run dev" first, then run "npm run desktop:dev".`,
    );
  }

  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    throw new Error(
      'No production build found. Run "npm run desktop" (build + launch) or "npm run build" first.',
    );
  }

  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    throw new Error('Next.js is not installed. Run "npm install" first.');
  }

  const port = new URL(APP_URL).port || "3000";
  const nodeBin = process.env.npm_node_execpath || "node";
  serverProcess = spawn(
    nodeBin,
    [nextBin, "start", "-H", "127.0.0.1", "-p", port],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
      env: process.env,
    },
  );
  serverProcess.on("exit", () => {
    serverProcess = null;
  });

  if (!(await waitForServer(APP_URL, 120_000))) {
    throw new Error(`Hermes server did not start at ${APP_URL}.`);
  }
}

// castLabs downloads the Widevine CDM through the component updater on first
// launch. Waiting here makes the very first playback attempt DRM-ready instead
// of racing the install.
async function ensureWidevine() {
  if (!IS_PACKAGED) return;
  const { components } = require("electron");
  if (!components?.whenReady) return;
  try {
    await Promise.race([
      components.whenReady(),
      new Promise((resolve) => setTimeout(resolve, 45_000)),
    ]);
  } catch (error) {
    console.warn("Widevine component unavailable:", error);
  }
}

function createMainWindow() {  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#050706",
    title: "Hermes",
    icon: ICON,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  // Keep Hermes' own pages in-app and send Spotify/external links to the
  // system browser instead of spawning another Electron window. Top-level
  // navigation is left alone so the Spotify OAuth redirect can complete here.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (floatingWindow) floatingWindow.close();
  });
}

function openFloating() {
  if (floatingWindow) {
    floatingWindow.show();
    floatingWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay().workArea;
  const x = display.x + display.width - FLOATING_SIZE.width - 24;
  const y = display.y + display.height - FLOATING_SIZE.height - 24;

  floatingWindow = new BrowserWindow({
    ...FLOATING_SIZE,
    x,
    y,
    frame: false,
    // Only the opaque card should be visible: a transparent window removes the
    // Windows DWM border/bezeling entirely. The card itself fills the window.
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: "#00000000",
    icon: ICON,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  floatingWindow.setAlwaysOnTop(true, "floating");
  floatingWindow.setFocusable(true);
  floatingWindow.setMenuBarVisibility(false);
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingWindow.loadURL(`${APP_URL}/desktop-floating`);
  floatingWindow.once("ready-to-show", () => {
    if (!floatingWindow) return;
    floatingWindow.show();
    floatingWindow.focus();
  });
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
}

function stopServer() {
  if (!serverProcess) return;
  const pid = serverProcess.pid;
  serverProcess = null;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    // The server may already have stopped.
  }
}

ipcMain.handle("floating:open", () => {
  openFloating();
});

ipcMain.handle("floating:close", () => {
  if (floatingWindow) floatingWindow.close();
});

ipcMain.handle("floating:focus-main", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.handle("floating:resize", (_event, height) => {
  if (!floatingWindow) return;
  const nextHeight = Math.max(90, Math.min(420, Math.round(Number(height) || 0)));
  if (!Number.isFinite(nextHeight)) return;
  const bounds = floatingWindow.getBounds();
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  floatingWindow.setBounds({
    x: right - FLOATING_SIZE.width,
    y: bottom - nextHeight,
    width: FLOATING_SIZE.width,
    height: nextHeight,
  });
});

// Renderer-driven dragging: the whole card (outside its controls) starts a
// drag, so there is no app-region that can swallow button clicks.
ipcMain.on("floating:drag-start", (_event, point) => {
  if (!floatingWindow || !point) return;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  floatingDrag = {
    startX: x,
    startY: y,
    bounds: floatingWindow.getBounds(),
  };
});

ipcMain.on("floating:drag-move", (_event, point) => {
  if (!floatingWindow || !floatingDrag || !point) return;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  floatingWindow.setPosition(
    Math.round(floatingDrag.bounds.x + x - floatingDrag.startX),
    Math.round(floatingDrag.bounds.y + y - floatingDrag.startY),
    false,
  );
});

ipcMain.on("floating:drag-end", () => {
  floatingDrag = null;
});

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId("com.hermes.music");

    try {
      powerSaveBlocker.start("prevent-app-suspension");
    } catch {
      // Power save blocker optional.
    }

    try {
      await ensureServer();
      await ensureWidevine();
    } catch (error) {
      dialog.showErrorBox(
        "Hermes could not start",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
      return;
    }

    createMainWindow();

    app.on("activate", () => {
      if (!quitting && BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}
