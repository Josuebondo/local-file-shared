const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const configModule = require("./config");

const config = configModule.loadConfig();
const SERVER_HOST = configModule.getLocalIpAddress();
const SERVER_PORT = Number(process.env.PORT || config.port || 3000);
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
let serverProcess = null;
let mainWindow = null;
let stoppingServer = false;
let serverStarting = false;
let showingStartupError = false;

function assetPath(...parts) {
  return path.join(app.getAppPath(), ...parts);
}
function logError(context, error) {
  const detail = error?.stack || error?.message || String(error);
  const line = `${new Date().toISOString()} [${context}] ${detail}\n`;
  console.error(line.trim());
  const base =
    process.env.LOCALAPPDATA || process.env.APPDATA || app.getPath("temp");
  const logDirectory = path.join(base, "LocalFileShared", "logs");
  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(path.join(logDirectory, "main.log"), line, "utf8");
  } catch (writeError) {
    console.error("Impossible d'écrire le journal :", writeError.message);
  }
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 960,
    minHeight: 700,
    show: false,
    icon: assetPath("icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.on("render-process-gone", (_, details) => {
    showStartupError(
      `Le processus d'affichage a cessé de répondre (${details.reason}).`,
    );
  });
  mainWindow.webContents.on("did-fail-load", (_, code, description) => {
    if (code !== -3)
      showStartupError(`Impossible de charger l'application : ${description}`);
  });
  mainWindow
    .loadFile(assetPath("public", "startup.html"))
    .catch((error) => logError("chargement écran de démarrage", error));
  return mainWindow;
}

async function showStartupError(message) {
  if (showingStartupError) return;
  showingStartupError = true;

  logError("serveur local", message);

  dialog.showErrorBox("Local File Shared", String(message));

  try {
    const window = createWindow();

    if (!window.isDestroyed()) {
      await window.loadFile(assetPath("public", "startup-error.html"), {
        query: {
          message: String(message),
        },
      });
    }
  } catch (error) {
    logError("chargement écran d'erreur", error);
  }
}

async function stopServer() {
  stoppingServer = true;

  if (!serverProcess || serverProcess.killed) {
    serverProcess = null;
    return;
  }

  await new Promise((resolve) => {
    serverProcess.once("close", () => {
      serverProcess = null;
      resolve();
    });

    serverProcess.kill();
  });
}

function startServer() {
  if (serverStarting) return;
  if (serverProcess && !serverProcess.killed) return;

  serverStarting = true;
  stoppingServer = false;

  const serverPath = path.join(__dirname, "server.js");

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: __dirname,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[serveur] ${data}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[serveur] ${data}`);
  });

  serverProcess.once("spawn", () => {
    serverStarting = false;
  });

  serverProcess.on("error", (error) => {
    serverStarting = false;
    showStartupError(`Le serveur local n'a pas pu démarrer : ${error.message}`);
  });

  serverProcess.on("close", (code, signal) => {
    serverStarting = false;
    serverProcess = null;

    if (!stoppingServer) {
      showStartupError(
        `Le serveur local s'est arrêté (${signal || `code ${code ?? "?"}`}).`,
      );
    }
  });
}

async function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${SERVER_URL}/api/info`);
      if (response.ok) return;
    } catch {
      // Le serveur est encore en cours d'initialisation.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Le serveur local ne répond pas sur le port ${SERVER_PORT}.`);
}

async function launchServerAndApp() {
  const window = createWindow();

  startServer();

  try {
    await waitForServer();

    if (!window.isDestroyed()) {
      await window.loadURL(`${SERVER_URL}/desktop`);
    }
  } catch (error) {
    await showStartupError(error.message || error);
  }
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled || !result.filePaths.length
    ? null
    : result.filePaths[0];
});

ipcMain.handle("open-folder", async (_, folderPath) => {
  if (!folderPath) return false;
  const error = await shell.openPath(folderPath);
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle("restart-server", async () => {
  await stopServer();
  await launchServerAndApp();
  return true;
});

ipcMain.handle("restart-app", () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.handle("stop-app", () => app.quit());

app.on("ready", async () => {
  app.setAppUserModelId("com.localfileshared.desktop");
  await launchServerAndApp();
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) launchServerAndApp();
});

process.on("uncaughtException", (error) => {
  logError("erreur principale non gérée", error);
  showStartupError(
    "Une erreur interne est survenue. L'application reste ouverte ; redémarrez le serveur pour réessayer.",
  );
});
process.on("unhandledRejection", (reason) => {
  logError("promesse principale rejetée", reason);
  showStartupError(
    "Une opération a échoué. L'application reste ouverte ; vous pouvez redémarrer le serveur.",
  );
});
