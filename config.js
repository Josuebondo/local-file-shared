const fs = require("fs");
const path = require("path");
const os = require("os");

function getDefaultConfigPath() {
  const appData = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (appData) {
    return path.join(appData, "LocalFileShared", "config.json");
  }
  return path.join(os.homedir(), ".local-file-shared", "config.json");
}

function getDefaultSharedFolder() {
  const appData = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (appData) {
    return path.join(appData, "LocalFileShared", "shared");
  }
  return path.join(os.homedir(), "LocalFileShared", "shared");
}

const configPath =
  process.env.LOCAL_FILE_SHARED_CONFIG || getDefaultConfigPath();
const defaultConfig = {
  configured: false,
  name: "Local File Shared",
  description: "Partage de fichiers sur le réseau local",
  port: 3000,
  sharedFolder: getDefaultSharedFolder(),
  maxFileSize: 50 * 1024 * 1024,
  allowedExtensions: [
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
};

function loadConfig() {
  try {
    const configDir = path.dirname(configPath);
    fs.mkdirSync(configDir, { recursive: true });

    if (!fs.existsSync(configPath)) {
      saveConfig(defaultConfig);
      return { ...defaultConfig };
    }

    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw || "{}");
    return { ...defaultConfig, ...config };
  } catch (error) {
    console.error("Impossible de charger la configuration :", error.message);
    return { ...defaultConfig };
  }
}

async function saveConfig(config) {
  const nextConfig = {
    ...defaultConfig,
    ...config,
    sharedFolder: String(config.sharedFolder || defaultConfig.sharedFolder),
    port: Number(config.port || defaultConfig.port),
    maxFileSize: Number(config.maxFileSize || defaultConfig.maxFileSize),
  };

  await fs.promises.writeFile(
    configPath,
    JSON.stringify(nextConfig, null, 2),
    "utf8",
  );

  return nextConfig;
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
module.exports = {
  loadConfig,
  saveConfig,
  configPath,
  getDefaultSharedFolder,
  getLocalIpAddress,
};
