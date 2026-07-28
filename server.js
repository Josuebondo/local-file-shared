const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const multer = require("multer");
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const { WebSocketServer } = require("ws");
const configModule = require("./config");
const app = express();
const NetworkDiscovery = require("./networkDiscovery");

let config = configModule.loadConfig();
let sharedFolder = path.resolve(config.sharedFolder);
let lockFile = path.join(sharedFolder, ".folder-locks.json");
const publicFolder = path.resolve(__dirname, "public");
const HOSTNAME = "localshare";
const PORT = Number(process.env.PORT || config.port || 3000);
const MAX_FILE_SIZE = Number(
  process.env.MAX_FILE_SIZE || config.maxFileSize || 50 * 1024 * 1024,
);
let allowedExtensions = new Set(
  config.allowedExtensions || [
    "pdf",
    "doc",
    "docx",
    "txt",
    "csv",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
  ],
);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"]);
let serverName = config.name || "Partage local";
let serverDescription =
  config.description || "Partage de fichiers sur le réseau local";
const serviceType = "http";

let discoveredServers = {};
const discovery = new NetworkDiscovery({
  port: PORT,

  onServerFound(server) {
    discoveredServers[server.id] = server;
  },

  onServerRemoved(server) {
    delete discoveredServers[server.id];
  },
});
function registerLocalServer() {
  const ip = getLocalIpAddress();

  discoveredServers["local"] = {
    id: "local",
    name: serverName,
    description: serverDescription,
    host: ip,
    port: PORT,
    url: `http://${ip}:${PORT}`,
    appUrl: `http://${ip}:${PORT}/app`,
    lastSeen: Date.now(),
    state: "online",
    local: true,
  };
}

function normalizeRelativePath(relative) {
  const safe = String(relative || "").replace(/\\/g, "/");
  const normalized = path.posix.normalize(safe);
  if (normalized.startsWith("..")) {
    throw new Error("Accès refusé : emplacement en dehors du dossier partagé.");
  }
  return normalized.replace(/^\/+/, "");
}

function normalizeSharedPath(relative) {
  const safeRelative = normalizeRelativePath(relative);
  const resolved = path.resolve(sharedFolder, safeRelative);
  const folderWithSep = sharedFolder.endsWith(path.sep)
    ? sharedFolder
    : sharedFolder + path.sep;

  if (resolved !== sharedFolder && !resolved.startsWith(folderWithSep)) {
    throw new Error("Accès refusé : emplacement en dehors du dossier partagé.");
  }

  return resolved;
}

function getSharedRelativePath(absolutePath) {
  const relative = path.relative(sharedFolder, absolutePath);
  const normalized = relative.split(path.sep).join("/");
  return normalized === "." ? "" : normalized;
}

async function ensureSharedFolder() {
  await fs.promises.mkdir(sharedFolder, { recursive: true });
  if (!(await pathExists(lockFile))) {
    await fs.promises.writeFile(lockFile, "{}", "utf8");
  }
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name]) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }

  return "127.0.0.1";
}

function getFileExtension(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

function isExtensionAllowed(filename) {
  return allowedExtensions.has(getFileExtension(filename));
}

function isImageExtension(extension) {
  return imageExtensions.has(extension.toLowerCase());
}

function getMimeType(extension) {
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveUniqueName(directory, filename) {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);
  let candidate = filename;
  let suffix = 0;

  while (await pathExists(path.join(directory, candidate))) {
    suffix += 1;
    candidate = `${base}(${suffix})${extension}`;
  }

  return candidate;
}

async function loadFolderLocks() {
  try {
    const raw = await fs.promises.readFile(lockFile, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function saveFolderLocks(locks) {
  await fs.promises.writeFile(lockFile, JSON.stringify(locks, null, 2), "utf8");
}

function hashAccessCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function getFolderLock(relativePath = "") {
  const locks = await loadFolderLocks();
  return locks[normalizeRelativePath(relativePath)] || null;
}

async function verifyFolderCode(relativePath = "", code) {
  const locks = await loadFolderLocks();
  const key = normalizeRelativePath(relativePath);
  return Boolean(locks[key] && locks[key] === hashAccessCode(code));
}

function buildPathPrefixes(relativePath = "") {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized ? normalized.split("/") : [];
  const prefixes = [""];
  let current = "";

  for (const segment of segments) {
    current = current ? path.posix.join(current, segment) : segment;
    prefixes.push(current);
  }

  return prefixes;
}

async function setFolderLock(relativePath = "", code) {
  const locks = await loadFolderLocks();
  const key = normalizeRelativePath(relativePath);

  if (code) {
    locks[key] = hashAccessCode(code);
  } else {
    delete locks[key];
  }

  await saveFolderLocks(locks);
}

async function deleteFolderLocksWithPrefix(prefix) {
  const locks = await loadFolderLocks();
  const normalizedPrefix = normalizeRelativePath(prefix);
  let changed = false;

  for (const key of Object.keys(locks)) {
    if (key === normalizedPrefix || key.startsWith(`${normalizedPrefix}/`)) {
      delete locks[key];
      changed = true;
    }
  }

  if (changed) {
    await saveFolderLocks(locks);
  }
}

async function moveFolderLocks(oldPrefix, newPrefix) {
  const locks = await loadFolderLocks();
  const sourcePrefix = normalizeRelativePath(oldPrefix);
  const targetPrefix = normalizeRelativePath(newPrefix);
  const updated = {};
  let changed = false;

  for (const key of Object.keys(locks)) {
    if (key === sourcePrefix || key.startsWith(`${sourcePrefix}/`)) {
      const suffix = key === sourcePrefix ? "" : key.slice(sourcePrefix.length);
      updated[`${targetPrefix}${suffix}`] = locks[key];
      delete locks[key];
      changed = true;
    }
  }

  if (changed) {
    await saveFolderLocks({ ...locks, ...updated });
  }
}

async function copyFolderLocks(sourcePrefix, targetPrefix) {
  const locks = await loadFolderLocks();
  const sourceKey = normalizeRelativePath(sourcePrefix);
  const targetKey = normalizeRelativePath(targetPrefix);
  const updates = {};
  let changed = false;

  for (const key of Object.keys(locks)) {
    if (key === sourceKey || key.startsWith(`${sourceKey}/`)) {
      const suffix = key === sourceKey ? "" : key.slice(sourceKey.length);
      updates[`${targetKey}${suffix}`] = locks[key];
      changed = true;
    }
  }

  if (changed) {
    await saveFolderLocks({ ...locks, ...updates });
  }
}

async function copyRecursive(source, destination) {
  const stats = await fs.promises.stat(source);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(destination, { recursive: true });
    const items = await fs.promises.readdir(source);
    for (const item of items) {
      await copyRecursive(
        path.join(source, item),
        path.join(destination, item),
      );
    }
  } else {
    await fs.promises.copyFile(source, destination);
  }
}

async function removeRecursive(target) {
  const stats = await fs.promises.stat(target);
  if (stats.isDirectory()) {
    const entries = await fs.promises.readdir(target);
    for (const entry of entries) {
      await removeRecursive(path.join(target, entry));
    }
    await fs.promises.rmdir(target);
  } else {
    await fs.promises.unlink(target);
  }
}

function buildBreadcrumbs(relativePath) {
  const segments = relativePath ? relativePath.split("/") : [];
  const breadcrumbs = [{ name: "shared", path: "" }];
  let current = "";

  for (const segment of segments) {
    current = current ? path.posix.join(current, segment) : segment;
    breadcrumbs.push({ name: segment, path: current });
  }

  return breadcrumbs;
}

function parseCodes(input, fallbackKey = "") {
  if (!input) return {};
  if (typeof input === "object") return input;

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      if (fallbackKey) {
        return { [fallbackKey]: input };
      }
    }
  }

  return {};
}

function getCodesFromQuery(req, fallbackPath = "") {
  const codes = parseCodes(req.query.codes, fallbackPath);
  if (req.query.code) {
    codes[fallbackPath] = String(req.query.code);
  }
  return codes;
}

function getCodesFromBody(req, fallbackPath = "") {
  const codes = parseCodes(req.body.codes, fallbackPath);
  if (req.body.code) {
    codes[fallbackPath] = String(req.body.code);
  }
  return codes;
}

async function verifyPathAccess(relativePath = "", codes = {}) {
  const prefixes = buildPathPrefixes(relativePath);

  for (const prefix of prefixes) {
    const lock = await getFolderLock(prefix);
    if (!lock) continue;

    const code = String(codes[prefix] || "");
    if (!(await verifyFolderCode(prefix, code))) {
      const error = new Error("Dossier protégé. Code requis ou invalide.");
      error.status = 403;
      error.protected = true;
      error.protectedPath = prefix;
      throw error;
    }
  }
}

async function listSharedEntries(relativePath = "", codes = {}) {
  await verifyPathAccess(relativePath, codes);

  const folderPath = normalizeSharedPath(relativePath);
  const stats = await fs.promises.stat(folderPath);

  if (!stats.isDirectory()) {
    const error = new Error("Chemin introuvable.");
    error.status = 404;
    throw error;
  }

  const entries = [];
  const items = await fs.promises.readdir(folderPath, { withFileTypes: true });

  for (const item of items) {
    const itemRelative = normalizeRelativePath(
      path.posix.join(relativePath, item.name),
    );
    const itemPath = normalizeSharedPath(itemRelative);
    const itemStats = await fs.promises.stat(itemPath);

    if (item.isDirectory()) {
      entries.push({
        name: item.name,
        type: "folder",
        protected: Boolean(await getFolderLock(itemRelative)),
        modifiedAt: itemStats.mtime.toISOString(),
      });
    } else if (item.isFile()) {
      const extension = getFileExtension(item.name);
      const entryType = isImageExtension(extension)
        ? "image"
        : extension === "pdf"
          ? "pdf"
          : "document";

      entries.push({
        name: item.name,
        extension,
        type: entryType,
        size: itemStats.size,
        modifiedAt: itemStats.mtime.toISOString(),
      });
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  return {
    currentPath: normalizeRelativePath(relativePath),
    breadcrumbs: buildBreadcrumbs(relativePath),
    entries,
  };
}

const storage = multer.diskStorage({
  destination: sharedFolder,
  filename: (req, file, cb) => {
    const originalName = path.basename(file.originalname);
    resolveUniqueName(sharedFolder, originalName)
      .then((finalName) => cb(null, finalName))
      .catch((error) => cb(error));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!isExtensionAllowed(file.originalname)) {
      return cb(new Error("Extension de fichier non autorisée."));
    }
    cb(null, true);
  },
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

async function announceRefresh() {
  broadcast({ type: "refresh" });
}

function announceEvent(action, details = {}) {
  broadcast({ type: "event", action, payload: details });
}

wss.on("connection", (socket) => {
  socket.on("error", (error) => console.error("WebSocket error:", error));
  socket.send(JSON.stringify({ type: "refresh" }));
});

function watchSharedFolder() {
  try {
    const watcher = fs.watch(
      sharedFolder,
      { recursive: true, persistent: true },
      () => {
        announceRefresh();
        announceEvent("filesystem-change");
      },
    );

    watcher.on("error", (error) =>
      console.error("Erreur du watcher de dossier partagé :", error),
    );
  } catch (error) {
    console.error(
      "Impossible de démarrer le watcher de dossier partagé :",
      error.message,
    );
  }
}

app.use(express.json());
app.use(express.static(publicFolder, { index: false }));
app.use("/app", express.static(publicFolder));

app.get("/desktop", (req, res) => {
  res.sendFile(path.join(publicFolder, "desktop.html"));
});

app.get("/app", (req, res) => {
  res.sendFile(path.join(publicFolder, "index.html"));
});

app.get("/", (req, res) => {
  if (!config.configured) {
    return res.sendFile(path.join(publicFolder, "desktop.html"));
  }
  res.sendFile(path.join(publicFolder, "discovery.html"));
});

app.get("/api/config", (req, res) => {
  res.json({
    configured: config.configured === true,
    name: serverName,
    description: serverDescription,
    port: PORT,
    sharedFolder,
  });
});

app.post("/api/config", async (req, res, next) => {
  try {
    const nextConfig = {
      ...config,
      configured: true,
      name: String(req.body.name || config.name || "Partage local"),
      description: String(req.body.description || config.description || ""),
      port: Number(req.body.port || config.port || 3000),
      sharedFolder: String(req.body.sharedFolder || config.sharedFolder),
    };

    if (req.body.createFolder || !nextConfig.sharedFolder) {
      nextConfig.sharedFolder = configModule.getDefaultSharedFolder();
    }

    await fs.promises.mkdir(nextConfig.sharedFolder, { recursive: true });
    await configModule.saveConfig(nextConfig);

    config = nextConfig;
    sharedFolder = path.resolve(config.sharedFolder);
    serverName = config.name;
    serverDescription = config.description;
    allowedExtensions = new Set(
      config.allowedExtensions || Array.from(allowedExtensions),
    );

    res.json({
      message: "Configuration enregistrée.",
      config: nextConfig,
      restartRequired: config.port !== PORT,
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/discovery", (req, res) => {
  res.json({
    servers: discovery.getServers(),
  });
});

app.get("/api/files", async (req, res, next) => {
  try {
    const currentPath = req.query.path || "";
    const codes = getCodesFromQuery(req, currentPath);
    const result = await listSharedEntries(currentPath, codes);
    res.json(result);
  } catch (error) {
    if (error.status === 403 && error.protected) {
      return res.status(403).json({
        error: error.message,
        protected: true,
        protectedPath: error.protectedPath || "",
      });
    }
    next(error);
  }
});

app.get("/api/verify-folder", async (req, res, next) => {
  try {
    const currentPath = req.query.path || "";
    const code = req.query.code || "";
    const allowed = await verifyFolderCode(currentPath, code);
    if (!allowed) {
      return res.status(403).json({ allowed: false, error: "Code invalide." });
    }
    res.json({ allowed: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/folder", async (req, res, next) => {
  try {
    const currentPath = req.body.path || "";
    const folderName = String(req.body.name || "").trim();
    const code = String(req.body.code || "").trim();
    const codes = getCodesFromBody(req, currentPath);

    if (!folderName) {
      return res.status(400).json({ error: "Nom du dossier requis." });
    }

    await verifyPathAccess(currentPath, codes);

    const folderRelative = normalizeRelativePath(
      path.posix.join(currentPath, folderName),
    );
    const folderPath = normalizeSharedPath(folderRelative);
    await fs.promises.mkdir(folderPath, { recursive: true });

    if (code) {
      await setFolderLock(folderRelative, code);
    }

    announceEvent("folder-created", { path: folderRelative });
    res.json({
      message: "Dossier créé.",
      folder: { name: folderName, path: folderRelative },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/folder-protect", async (req, res, next) => {
  try {
    const folderPath = String(req.body.path || "");
    const code =
      req.body.code === null ? "" : String(req.body.code || "").trim();
    const codes = getCodesFromBody(req, folderPath);

    await verifyPathAccess(folderPath, codes);
    await setFolderLock(folderPath, code || null);
    announceEvent("folder-protected", {
      path: folderPath,
      protected: Boolean(code),
    });
    res.json({
      message: code ? "Dossier protégé." : "Dossier passé en public.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rename", async (req, res, next) => {
  try {
    const currentPath = req.body.path || "";
    const name = String(req.body.name || "").trim();
    const newName = String(req.body.newName || "").trim();
    const codes = getCodesFromBody(req, currentPath);

    if (!name || !newName) {
      return res
        .status(400)
        .json({ error: "Nom actuel et nouveau nom requis." });
    }

    await verifyPathAccess(currentPath, codes);

    const sourceRelative = normalizeRelativePath(
      path.posix.join(currentPath, name),
    );
    const destinationRelative = normalizeRelativePath(
      path.posix.join(currentPath, path.basename(newName)),
    );
    const sourcePath = normalizeSharedPath(sourceRelative);
    let destinationPath = normalizeSharedPath(destinationRelative);

    if (await pathExists(destinationPath)) {
      const uniqueName = await resolveUniqueName(
        path.dirname(destinationPath),
        path.basename(destinationPath),
      );
      destinationPath = normalizeSharedPath(
        path.posix.join(currentPath, uniqueName),
      );
    }

    await fs.promises.rename(sourcePath, destinationPath);
    const stats = await fs.promises.stat(destinationPath);

    if (stats.isDirectory()) {
      await moveFolderLocks(
        sourceRelative,
        getSharedRelativePath(destinationPath),
      );
    }

    announceEvent("item-renamed", {
      from: sourceRelative,
      to: getSharedRelativePath(destinationPath),
    });
    res.json({
      message: "Renommé avec succès.",
      path: getSharedRelativePath(destinationPath),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/delete", async (req, res, next) => {
  try {
    const currentPath = req.body.path || "";
    const name = String(req.body.name || "").trim();
    const codes = getCodesFromBody(req, currentPath);

    if (!name) {
      return res
        .status(400)
        .json({ error: "Nom du fichier ou dossier requis." });
    }

    const targetRelative = normalizeRelativePath(
      path.posix.join(currentPath, name),
    );
    await verifyPathAccess(targetRelative, codes);

    const targetPath = normalizeSharedPath(targetRelative);
    const stats = await fs.promises.stat(targetPath);
    const isDirectory = stats.isDirectory();

    await removeRecursive(targetPath);
    if (isDirectory) {
      await deleteFolderLocksWithPrefix(targetRelative);
    }

    announceEvent(isDirectory ? "folder-deleted" : "file-deleted", {
      path: targetRelative,
    });
    res.json({
      message: isDirectory ? "Dossier supprimé." : "Fichier supprimé.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/move", async (req, res, next) => {
  try {
    const currentPath = req.body.path || "";
    const name = String(req.body.name || "").trim();
    const destination = String(req.body.destination || "").trim();
    const codes = getCodesFromBody(req, currentPath);

    if (!name) {
      return res
        .status(400)
        .json({ error: "Nom du fichier ou dossier requis." });
    }

    const sourceRelative = normalizeRelativePath(
      path.posix.join(currentPath, name),
    );
    const targetFolderRelative = normalizeRelativePath(destination);
    await verifyPathAccess(sourceRelative, codes);
    await verifyPathAccess(targetFolderRelative, codes);

    const sourcePath = normalizeSharedPath(sourceRelative);
    const targetFolderPath = normalizeSharedPath(targetFolderRelative);
    const filename = path.basename(sourceRelative);
    let destinationPath = normalizeSharedPath(
      path.posix.join(targetFolderRelative, filename),
    );

    if (await pathExists(destinationPath)) {
      const uniqueName = await resolveUniqueName(
        targetFolderPath,
        path.basename(destinationPath),
      );
      destinationPath = normalizeSharedPath(
        path.posix.join(targetFolderRelative, uniqueName),
      );
    }

    await fs.promises.rename(sourcePath, destinationPath);
    const stats = await fs.promises.stat(destinationPath);

    if (stats.isDirectory()) {
      await moveFolderLocks(
        sourceRelative,
        getSharedRelativePath(destinationPath),
      );
    }

    announceEvent("item-moved", {
      from: sourceRelative,
      to: getSharedRelativePath(destinationPath),
    });
    res.json({
      message: "Déplacé avec succès.",
      path: getSharedRelativePath(destinationPath),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/copy", async (req, res, next) => {
  try {
    const currentPath = req.body.path || "";
    const name = String(req.body.name || "").trim();
    const destination = String(req.body.destination || "").trim();
    const codes = getCodesFromBody(req, currentPath);

    if (!name) {
      return res
        .status(400)
        .json({ error: "Nom du fichier ou dossier requis." });
    }

    const sourceRelative = normalizeRelativePath(
      path.posix.join(currentPath, name),
    );
    const targetFolderRelative = normalizeRelativePath(destination);
    await verifyPathAccess(sourceRelative, codes);
    await verifyPathAccess(targetFolderRelative, codes);

    const sourcePath = normalizeSharedPath(sourceRelative);
    const targetFolderPath = normalizeSharedPath(targetFolderRelative);
    const destinationPath = normalizeSharedPath(
      path.posix.join(targetFolderRelative, name),
    );
    const finalName = await resolveUniqueName(
      targetFolderPath,
      path.basename(destinationPath),
    );
    const finalPath = normalizeSharedPath(
      path.posix.join(targetFolderRelative, finalName),
    );

    await copyRecursive(sourcePath, finalPath);
    const stats = await fs.promises.stat(sourcePath);

    if (stats.isDirectory()) {
      await copyFolderLocks(sourceRelative, getSharedRelativePath(finalPath));
    }

    announceEvent("item-copied", {
      from: sourceRelative,
      to: getSharedRelativePath(finalPath),
    });
    res.json({
      message: "Copié avec succès.",
      path: getSharedRelativePath(finalPath),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/upload", (req, res, next) => {
  upload.array("files")(req, res, async (error) => {
    const currentPath = req.body.path || "";
    const codes = getCodesFromBody(req, currentPath);
    const destinationFolder = normalizeSharedPath(currentPath);

    if (error) {
      return next(error);
    }

    try {
      await verifyPathAccess(currentPath, codes);
    } catch (verifyError) {
      return next(verifyError);
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Aucun fichier reçu." });
    }

    try {
      await fs.promises.mkdir(destinationFolder, { recursive: true });

      const movedFiles = [];
      for (const file of req.files) {
        const originalName = path.basename(file.originalname);
        let targetName = originalName;
        let targetPath = path.join(destinationFolder, targetName);

        if (await pathExists(targetPath)) {
          targetName = await resolveUniqueName(destinationFolder, originalName);
          targetPath = path.join(destinationFolder, targetName);
        }

        await fs.promises.rename(file.path, targetPath);
        movedFiles.push({
          originalName,
          filename: targetName,
          size: file.size,
        });
      }

      announceEvent("file-added", { path: currentPath, files: movedFiles });
      res.json({
        message: "Fichier(s) uploadé(s) avec succès.",
        files: movedFiles,
      });
    } catch (moveError) {
      next(moveError);
    }
  });
});

app.get("/api/preview", async (req, res, next) => {
  try {
    const currentPath = req.query.path || "";
    const filename = String(req.query.name || "").trim();
    const codes = getCodesFromQuery(req, currentPath);
    const extension = getFileExtension(filename);

    await verifyPathAccess(path.posix.join(currentPath, filename), codes);

    if (!isImageExtension(extension) && extension !== "pdf") {
      return res
        .status(400)
        .json({ error: "Aperçu non autorisé pour ce type de fichier." });
    }

    const filePath = normalizeSharedPath(
      path.posix.join(currentPath, filename),
    );
    const stats = await fs.promises.stat(filePath);

    if (extension === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
    } else {
      res.setHeader("Content-Type", getMimeType(extension));
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/preview/:filename", async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const extension = getFileExtension(filename);

    if (!isImageExtension(extension) && extension !== "pdf") {
      return res
        .status(400)
        .json({ error: "Aperçu non autorisé pour ce type de fichier." });
    }

    const filePath = normalizeSharedPath(filename);
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }

    if (extension === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
    } else {
      res.setHeader("Content-Type", getMimeType(extension));
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/download", async (req, res, next) => {
  try {
    const currentPath = req.query.path || "";
    const filename = String(req.query.name || "").trim();
    const codes = getCodesFromQuery(req, currentPath);
    const filePathRelative = path.posix.join(currentPath, filename);

    await verifyPathAccess(filePathRelative, codes);

    const filePath = normalizeSharedPath(filePathRelative);
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }

    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(filePath)}"`,
    );

    const stream = fs.createReadStream(filePath);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/download/:filename", async (req, res, next) => {
  try {
    const filename = req.params.filename;
    const filePath = normalizeSharedPath(filename);
    await verifyPathAccess(getSharedRelativePath(filePath), {});
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }

    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(filePath)}"`,
    );

    const stream = fs.createReadStream(filePath);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/qrcode", async (req, res, next) => {
  try {
    const text = String(req.query.text || "");
    const dataUrl = await qrcode.toDataURL(text, { type: "image/png" });
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/info", (req, res) => {
  res.json({
    ready: true,
    name: serverName,
    description: serverDescription,
    host: getLocalIpAddress(),
    hostname: "localshare.local",
    port: PORT,
    url: `http://${getLocalIpAddress()}:${PORT}`,
    app: "LocalFileShared",
  });
});

app.use((error, req, res, next) => {
  console.error("Erreur serveur :", error.message);
  if (res.headersSent) {
    return next(error);
  }

  const status =
    error.status === 403
      ? 403
      : error.message && error.message.includes("non autorisée")
        ? 400
        : 500;

  res
    .status(status)
    .json({ error: error.message || "Erreur interne du serveur." });
});

async function startServer() {
  await ensureSharedFolder();
  watchSharedFolder();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Le port ${PORT} est déjà utilisé. Choisissez un autre port via PORT=xxxx npm start.`,
      );
    } else {
      console.error("Erreur serveur :", error.message);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    const localIp = getLocalIpAddress();
    const url = `http://${localIp}:${PORT}`;

    console.clear();
    console.log("===== Serveur de partage local démarré =====");
    console.log(`Adresse IP locale : ${localIp}`);
    console.log(`Port : ${PORT}`);
    console.log(`URL : ${url}`);
    console.log("===========================================");

    qrcodeTerminal.generate(url, { small: true }, (code) => {
      console.log(code);
    });

    registerLocalServer();

    discovery.start(); // <<< AJOUTER ICI
  });
}

process.on("uncaughtException", (error) => {
  console.error("Erreur serveur non gérée :", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Promesse serveur rejetée :", reason);
});

startServer().catch((error) => {
  console.error("Échec du démarrage du serveur :", error);
  discovery.stop();
  process.exitCode = 1;
});
process.on("SIGINT", () => {
  discovery.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  discovery.stop();
  process.exit(0);
});
