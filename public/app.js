const fileListBody = document.getElementById("fileList");
const dropzone = document.getElementById("dropzone");
const selectButton = document.getElementById("selectButton");
const fileInput = document.getElementById("fileInput");
const status = document.getElementById("status");
const breadcrumbs = document.getElementById("breadcrumbs");
const parentButton = document.getElementById("parentButton");
const createFolderButton = document.getElementById("createFolderButton");
const pasteButton = document.getElementById("pasteButton");
const searchInput = document.getElementById("searchInput");
const themeToggle = document.getElementById("themeToggle");
const refreshButton = document.getElementById("refreshButton");
const copyCurrentLink = document.getElementById("copyCurrentLink");
const shareUrl = document.getElementById("shareUrl");
const qrCodeImage = document.getElementById("qrCodeImage");
const contextMenu = document.getElementById("contextMenu");
const previewModal = document.getElementById("previewModal");
const previewContent = document.getElementById("previewContent");
const previewFooter = document.getElementById("previewFooter");
const previewClose = document.getElementById("previewClose");
const qrModal = document.getElementById("qrModal");
const qrModalImage = document.getElementById("qrModalImage");
const qrModalLink = document.getElementById("qrModalLink");
const qrClose = document.getElementById("qrClose");
const qrCopyLink = document.getElementById("qrCopyLink");
const qrDownload = document.getElementById("qrDownload");
const qrPrint = document.getElementById("qrPrint");
let activeQrUrl = "";

const api = {
  files: "/api/files",
  upload: "/api/upload",
  preview: "/api/preview",
  download: "/api/download",
  delete: "/api/delete",
  rename: "/api/rename",
  folder: "/api/folder",
  folderProtect: "/api/folder-protect",
  move: "/api/move",
  copy: "/api/copy",
};

const allowedExtensions = new Set([
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
]);

let currentPath = "";
let currentEntries = [];
let clipboard = { action: null, name: null, path: null, type: null };
const folderCodes = {};
let inSearchMode = false;

function getFileExtension(filename) {
  return String(filename).split(".").pop().toLowerCase();
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleString("fr-FR", { hour12: false });
}

function getBadgeLabel(file) {
  if (file.type === "folder") {
    return file.protected ? "Dossier protégé" : "Dossier";
  }

  const mapping = {
    pdf: "PDF",
    doc: "Word",
    docx: "Word",
    xls: "Excel",
    xlsx: "Excel",
    ppt: "PowerPoint",
    pptx: "PowerPoint",
    txt: "Texte",
    csv: "CSV",
  };

  return mapping[file.extension] || "Fichier";
}

function getIconSvg(extension) {
  const svgMap = {
    folder: `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M10 18a4 4 0 0 1 4-4h16l6 6h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V18Z" fill="#f59e0b"/>
        <path d="M30 20 24 14H14a4 4 0 0 0-4 4v4h20Z" fill="#d97706"/>
      </svg>
    `,
    pdf: `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M44 10H20a4 4 0 0 0-4 4v36a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V18l-8-8Z" fill="#f44336"/>
        <path d="M44 18H36a4 4 0 0 1-4-4V10" fill="#d32f2f"/>
        <path d="M22 24h20v4H22zm0 10h20v4H22zm0 10h20v4H22z" fill="#fff"/>
      </svg>
    `,
    doc: `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M44 10H20a4 4 0 0 0-4 4v36a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V18l-8-8Z" fill="#1976d2"/>
        <path d="M44 18H36a4 4 0 0 1-4-4V10" fill="#1565c0"/>
        <path d="M24 24h16v4H24zm0 10h16v4H24zm0 10h16v4H24z" fill="#fff"/>
      </svg>
    `,
    default: `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M44 10H20a4 4 0 0 0-4 4v36a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4V18l-8-8Z" fill="#90a4ae"/>
        <path d="M44 18H36a4 4 0 0 1-4-4V10" fill="#78909c"/>
        <path d="M26 26h16v4H26zm0 10h16v4H26zm0 10h16v4H26z" fill="#fff"/>
      </svg>
    `,
  };

  return svgMap[extension] || svgMap.default;
}

function getPreviewCellHtml(file) {
  const label =
    file.type === "folder" ? "Ouvrir le dossier" : `Prévisualiser ${file.name}`;
  const icon =
    file.type === "folder" ? getIconSvg("folder") : getIconSvg(file.extension);

  return `
    <button
      type="button"
      class="preview-button"
      data-name="${file.name}"
      data-type="${file.type}"
      aria-label="${label}"
    >
      <div class="preview-thumb">${icon}</div>
    </button>
  `;
}

function getQueryString(params) {
  return new URLSearchParams(params).toString();
}

function getApiPath(endpoint, params = {}) {
  const query = getQueryString(params);
  return query ? `${endpoint}?${query}` : endpoint;
}

function buildPathPrefixes(relativePath) {
  const normalized = normalizePath(relativePath);
  const segments = normalized ? normalized.split("/") : [];
  const prefixes = [""];
  let current = "";

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    prefixes.push(current);
  }

  return prefixes;
}

function getCodesForPath(path) {
  const prefixes = buildPathPrefixes(path);
  return prefixes.reduce((all, prefix) => {
    if (folderCodes[prefix]) {
      all[prefix] = folderCodes[prefix];
    }
    return all;
  }, {});
}

function getRequestParams(params = {}) {
  const codes = getCodesForPath(currentPath);
  if (Object.keys(codes).length > 0) {
    return { ...params, codes: JSON.stringify(codes) };
  }
  return params;
}

function setStatus(message, type = "info") {
  status.textContent = message;
  status.classList.toggle("success", type === "success");
  status.classList.toggle("error", type === "error");
  if (type === "success") showToast(message, "success");
  if (type === "error") showToast(message, "error");
}

// Toast notifications
function showToast(message, type = "info", ms = 3500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = "toast-item";
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
  }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

function setLoading(loading) {
  document
    .querySelector(".browser-panel")
    ?.setAttribute("aria-busy", loading ? "true" : "false");
  refreshButton?.classList.toggle("is-loading", loading);
}

function updateSharePanel() {
  const origin = window.location.origin;
  const encodedPath = encodeURIComponent(currentPath);
  const url = encodedPath
    ? `${origin}/app?path=${encodedPath}`
    : `${origin}/app`;
  shareUrl.textContent = url;
  qrCodeImage.src = `/api/qrcode?${getQueryString({ text: url })}`;
}

function normalizePath(path) {
  return String(path || "").replace(/^\/+|\/+$/g, "");
}

function joinPath(base, segment) {
  const normalizedBase = normalizePath(base);
  const normalizedSegment = normalizePath(segment);
  return normalizedBase
    ? `${normalizedBase}/${normalizedSegment}`
    : normalizedSegment;
}

function getParentPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function promptForFolderCode(path) {
  const existing = folderCodes[path] || "";
  const code = window.prompt(
    `Dossier protégé. Saisissez le code d'accès pour ${path || "le dossier racine"}:`,
    existing,
  );
  if (code === null) {
    throw new Error("Accès refusé. Code requis.");
  }
  folderCodes[path] = code;
  return code;
}

function buildBreadcrumbs(items) {
  breadcrumbs.innerHTML = items
    .map((item, index) => {
      if (index === items.length - 1) {
        return `<span>${item.name}</span>`;
      }
      return `<button type="button" data-path="${item.path}">${item.name}</button><span>›</span>`;
    })
    .join("");
}

function filterEntries(entries) {
  if (!inSearchMode) {
    return entries;
  }

  const query = searchInput.value.trim().toLowerCase();
  if (!query) return entries;

  return entries.filter((entry) => {
    return (
      entry.name.toLowerCase().includes(query) ||
      getBadgeLabel(entry).toLowerCase().includes(query)
    );
  });
}

function renderFiles(entries) {
  currentEntries = entries;
  fileListBody.innerHTML = "";
  const filteredEntries = filterEntries(entries);

  if (!filteredEntries.length) {
    fileListBody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="material-symbols-outlined">folder_open</span><p>Aucun élément à afficher dans ce dossier.</p></div></td></tr>`;
    setStatus("Aucun élément trouvé.", "info");
    return;
  }

  setStatus(`${filteredEntries.length} élément(s) disponible(s).`, "success");

  filteredEntries.forEach((entry) => {
    const row = document.createElement("tr");
    row.className = entry.type === "folder" ? "folder-row" : "file-row";
    row.dataset.name = entry.name;
    row.dataset.type = entry.type;
    row.dataset.protected = entry.protected ? "true" : "false";

    const previewHtml = getPreviewCellHtml(entry);
    const detailLabel =
      entry.type === "folder"
        ? getBadgeLabel(entry)
        : `${getBadgeLabel(entry)} • ${formatSize(entry.size)}`;
    const actions =
      entry.type === "folder"
        ? `
          <button class="icon-button" data-action="open" data-name="${entry.name}" title="Ouvrir"><span class="material-symbols-outlined">folder_open</span></button>
          <button class="icon-button" data-action="copyLink" data-name="${entry.name}" title="Copier le lien"><span class="material-symbols-outlined">link</span></button>
          <button class="icon-button" data-action="qrcode" data-name="${entry.name}" title="QR Code"><span class="material-symbols-outlined">qr_code_2</span></button>
          <button class="icon-button" data-action="rename" data-name="${entry.name}" title="Renommer"><span class="material-symbols-outlined">drive_file_rename_outline</span></button>
          <button class="icon-button" data-action="delete" data-name="${entry.name}" title="Supprimer"><span class="material-symbols-outlined">delete</span></button>
          <button class="icon-button" data-action="protect" data-name="${entry.name}" title="Protéger/déverrouiller"><span class="material-symbols-outlined">${entry.protected ? "lock_open" : "lock"}</span></button>
        `
        : `
          <a class="icon-button" aria-label="Télécharger" title="Télécharger" href="${getApiPath(api.download, getRequestParams({ path: currentPath, name: entry.name }))}"><span class="material-symbols-outlined">download</span></a>
          <button class="icon-button" data-action="preview" data-name="${entry.name}" title="Prévisualiser"><span class="material-symbols-outlined">visibility</span></button>
          <button class="icon-button" data-action="copyLink" data-name="${entry.name}" title="Copier le lien"><span class="material-symbols-outlined">link</span></button>
          <button class="icon-button" data-action="qrcode" data-name="${entry.name}" title="QR Code"><span class="material-symbols-outlined">qr_code_2</span></button>
          <button class="icon-button" data-action="delete" data-name="${entry.name}" title="Supprimer"><span class="material-symbols-outlined">delete</span></button>
        `;

    row.innerHTML = `
      <td class="preview-cell">${previewHtml}</td>
      <td>
        <div class="file-name">${entry.name}</div>
        <div class="file-meta">${detailLabel}</div>
      </td>
      <td>${getBadgeLabel(entry)}</td>
      <td>${entry.type === "folder" ? "—" : formatSize(entry.size)}</td>
      <td>${entry.modifiedAt ? formatDate(entry.modifiedAt) : "—"}</td>
      <td>
        <div class="actions">${actions}</div>
      </td>
    `;

    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openContextMenu(event, entry);
    });

    row.querySelectorAll("button[data-action], a[href]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const el = event.currentTarget;
        const action = el.dataset.action;
        if (!action) return;
        event.preventDefault();
        handleAction(action, entry);
      });
    });

    const previewButton = row.querySelector(".preview-button");
    if (previewButton) {
      previewButton.addEventListener("click", () => {
        if (entry.type === "folder") {
          navigateTo(joinPath(currentPath, entry.name));
        } else {
          openPreview(entry);
        }
      });
    }

    fileListBody.appendChild(row);
  });
}

async function fetchFileList(retry = true) {
  setLoading(true);
  try {
    const response = await fetch(
      getApiPath(api.files, getRequestParams({ path: currentPath })),
    );
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 403 && data.protected && retry) {
        promptForFolderCode(currentPath);
        return fetchFileList(false);
      }

      throw new Error(
        data.error || "Impossible de récupérer la liste des fichiers",
      );
    }

    currentPath = data.currentPath || currentPath;
    buildBreadcrumbs(data.breadcrumbs || [{ name: "shared", path: "" }]);
    renderFiles(data.entries || []);
    updateSharePanel();
    updateParentButton();
    updatePasteButton();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function getEntryShareUrl(entry) {
  const origin = window.location.origin;
  if (entry.type === "folder") {
    return `${origin}/app?path=${encodeURIComponent(joinPath(currentPath, entry.name))}`;
  }
  return `${origin}${getApiPath(api.download, getRequestParams({ path: currentPath, name: entry.name }))}`;
}

async function executeApi(endpoint, payload, retry = true) {
  const requestPayload = getRequestParams(payload);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 403 && data.protected && retry) {
      promptForFolderCode(data.protectedPath || currentPath);
      return executeApi(endpoint, payload, false);
    }
    throw new Error(data.error || "Erreur du serveur");
  }

  return data;
}

async function deleteEntry(entry) {
  if (!window.confirm(`Supprimer ${entry.name} ?`)) {
    return;
  }
  try {
    const payload = { path: currentPath, name: entry.name };
    const data = await executeApi(api.delete, payload);
    setStatus(data.message, "success");
    await fetchFileList();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function renameEntry(entry) {
  const newName = window.prompt(`Renommer ${entry.name} en :`, entry.name);
  if (!newName || newName.trim() === entry.name) return;

  try {
    const payload = {
      path: currentPath,
      name: entry.name,
      newName: newName.trim(),
    };
    const data = await executeApi(api.rename, payload);
    setStatus(data.message, "success");
    await fetchFileList();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function protectFolder(entry) {
  const code = window.prompt(
    entry.protected
      ? `Supprimer le code du dossier ${entry.name} ? Laisser vide pour déverrouiller.`
      : `Définir un code pour le dossier ${entry.name} :`,
    "",
  );

  if (code === null) return;

  try {
    const payload = {
      path: joinPath(currentPath, entry.name),
      code: code.trim() || null,
    };
    const data = await executeApi(api.folderProtect, payload);
    setStatus(data.message, "success");
    await fetchFileList();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function createFolder() {
  const name = window.prompt("Nom du nouveau dossier :");
  if (!name || !name.trim()) return;

  const code = window.prompt(
    "Code de protection (laisser vide pour aucun) :",
    "",
  );
  if (code === null) return;

  try {
    const payload = {
      path: currentPath,
      name: name.trim(),
      code: code.trim(),
    };
    const data = await executeApi(api.folder, payload);
    setStatus(data.message, "success");
    await fetchFileList();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function copyLink(entry) {
  await navigator.clipboard.writeText(getEntryShareUrl(entry));
  setStatus("Lien copié dans le presse-papiers.", "success");
}

function openQrCode(entry) {
  activeQrUrl = getEntryShareUrl(entry);
  qrModalLink.textContent = activeQrUrl;
  const source = `/api/qrcode?${getQueryString({ text: activeQrUrl })}`;
  qrModalImage.src = source;
  qrDownload.href = source;
  qrModal.classList.add("open");
  qrModal.setAttribute("aria-hidden", "false");
}

function closeQrCode() {
  qrModal.classList.remove("open");
  qrModal.setAttribute("aria-hidden", "true");
}

async function copyCurrentFolderLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.textContent);
    setStatus("Lien du dossier copié dans le presse-papiers.", "success");
  } catch {
    setStatus("Impossible de copier le lien.", "error");
  }
}

function openContextMenu(event, entry) {
  contextMenu.style.left = `${event.pageX}px`;
  contextMenu.style.top = `${event.pageY}px`;
  contextMenu.classList.add("visible");
  contextMenu.dataset.name = entry.name;
  contextMenu.dataset.type = entry.type;
  contextMenu.dataset.protected = entry.protected ? "true" : "false";
  contextMenu.querySelectorAll("[data-scope]").forEach((button) => {
    button.hidden = button.dataset.scope !== entry.type;
  });
}

function closeContextMenu() {
  contextMenu.classList.remove("visible");
  delete contextMenu.dataset.name;
  delete contextMenu.dataset.type;
  delete contextMenu.dataset.protected;
}

async function handleAction(action, entry) {
  if (action === "open")
    return entry.type === "folder"
      ? navigateTo(joinPath(currentPath, entry.name))
      : openPreview(entry);
  if (action === "download") {
    return window.open(
      getApiPath(
        api.download,
        getRequestParams({ path: currentPath, name: entry.name }),
      ),
      "_blank",
    );
  }
  if (action === "rename") {
    return renameEntry(entry);
  }
  if (action === "preview") return openPreview(entry);
  if (action === "newFolder") return createFolder();
  if (action === "copy") {
    clipboard = {
      action: "copy",
      name: entry.name,
      path: currentPath,
      type: entry.type,
    };
    updatePasteButton();
    setStatus(`${entry.name} copié.`, "success");
    return;
  }
  if (action === "cut") {
    clipboard = {
      action: "cut",
      name: entry.name,
      path: currentPath,
      type: entry.type,
    };
    updatePasteButton();
    setStatus(`${entry.name} prêt à être déplacé.`, "success");
    return;
  }
  if (action === "paste") {
    return pasteClipboard();
  }
  if (action === "delete") {
    return deleteEntry(entry);
  }
  if (action === "copyLink") {
    return copyLink(entry);
  }
  if (action === "qrcode") return openQrCode(entry);
  if (action === "protect") {
    return protectFolder(entry);
  }
}

async function pasteClipboard() {
  if (!clipboard.action || !clipboard.name) {
    setStatus("Aucun élément dans le presse-papiers.", "info");
    return;
  }

  const sourcePath = clipboard.path;
  const targetPath = currentPath;

  if (clipboard.action === "cut" && sourcePath === targetPath) {
    setStatus("L'élément est déjà dans ce dossier.", "info");
    return;
  }

  if (
    clipboard.action === "cut" &&
    targetPath.startsWith(joinPath(sourcePath, clipboard.name))
  ) {
    setStatus("Impossible de déplacer un dossier dans lui-même.", "error");
    return;
  }

  try {
    const payload = {
      path: clipboard.path,
      name: clipboard.name,
      destination: targetPath,
    };

    const endpoint = clipboard.action === "copy" ? api.copy : api.move;
    const data = await executeApi(endpoint, payload);
    setStatus(data.message, "success");
    if (clipboard.action === "cut") {
      clipboard = { action: null, name: null, path: null, type: null };
    }
    updatePasteButton();
    await fetchFileList();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function updatePasteButton() {
  pasteButton.disabled = !clipboard.action;
}

function updateParentButton() {
  parentButton.disabled = !currentPath;
}

function navigateTo(path, pushState = true) {
  const normalized = normalizePath(path);
  currentPath = normalized;
  if (pushState) {
    const url = normalized ? `?path=${encodeURIComponent(normalized)}` : "/";
    window.history.replaceState(null, "", url);
  }
  fetchFileList();
}

function openPreview(entry) {
  const fileName = entry.name;
  const previewUrl = getApiPath(
    api.preview,
    getRequestParams({ path: currentPath, name: fileName }),
  );
  const isImage = entry.type === "image";
  const isPdf = entry.extension === "pdf";

  previewContent.innerHTML = "";
  previewFooter.innerHTML = `
    <div class="modal-info">
      <strong>${fileName}</strong>
      <span>${getBadgeLabel(entry)} • ${formatSize(entry.size)}</span>
    </div>
  `;

  if (isImage) {
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = `Prévisualisation de ${fileName}`;
    previewContent.appendChild(img);
  } else if (isPdf) {
    const object = document.createElement("object");
    object.data = previewUrl;
    object.type = "application/pdf";
    object.width = "100%";
    object.height = "100%";
    object.innerHTML = `<div class="modal-empty">Aucun aperçu PDF disponible. <a href="${getApiPath(api.download, getRequestParams({ path: currentPath, name: fileName }))}">Télécharger le fichier</a></div>`;
    previewContent.appendChild(object);
  } else {
    const empty = document.createElement("div");
    empty.className = "modal-empty";
    empty.innerHTML = `
      <div class="preview-icon">${getIconSvg(entry.extension)}</div>
      <p>Aperçu non disponible pour ce type de fichier.</p>
    `;
    previewContent.appendChild(empty);
  }

  previewModal.classList.add("open");
  previewModal.setAttribute("aria-hidden", "false");
}

function closePreview() {
  previewModal.classList.remove("open");
  previewModal.setAttribute("aria-hidden", "true");
  previewContent.innerHTML = "";
}

function validateFiles(files) {
  const invalidFiles = Array.from(files).filter((file) => {
    const extension = getFileExtension(file.name);
    return !allowedExtensions.has(extension);
  });

  if (invalidFiles.length) {
    const names = invalidFiles.map((file) => file.name).join(", ");
    setStatus(
      `Extension non autorisée pour : ${names}. Formats acceptés: ${[...allowedExtensions].join(", ")}.`,
      "error",
    );
    return false;
  }

  return true;
}

function setupDragAndDrop() {
  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, preventDefaults);
  });

  dropzone.addEventListener("dragover", () => {
    dropzone.classList.add("dragover");
    setStatus("Relâchez pour déposer vos fichiers", "info");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
    setStatus("Glissez-déposez vos fichiers ici", "info");
  });

  dropzone.addEventListener("drop", (event) => {
    dropzone.classList.remove("dragover");
    uploadFiles(event.dataTransfer.files);
  });

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
}

function updateProgress(value) {
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  progressBar.classList.toggle("active", value !== null);
  progressFill.style.width = value !== null ? `${value}%` : "0%";
}

function getUploadUrl() {
  return api.upload;
}

async function uploadFiles(files) {
  if (!files.length) return;
  if (!validateFiles(files)) return;

  const payload = new FormData();
  Array.from(files).forEach((file) => payload.append("files", file));
  payload.append("path", currentPath);
  const codes = getCodesForPath(currentPath);
  if (Object.keys(codes).length > 0) {
    payload.append("codes", JSON.stringify(codes));
  }

  const xhr = new XMLHttpRequest();
  xhr.open("POST", getUploadUrl(), true);

  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const progress = Math.round((event.loaded / event.total) * 100);
      updateProgress(progress);
      setStatus(`Upload en cours: ${progress}%`, "info");
    }
  });

  xhr.addEventListener("load", async () => {
    updateProgress(null);
    try {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        setStatus(data.message || "Upload terminé.", "success");
        await fetchFileList();
      } else {
        throw new Error(data.error || "Erreur lors de l'upload");
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  xhr.addEventListener("error", () => {
    updateProgress(null);
    setStatus("Erreur réseau pendant l'upload.", "error");
  });

  xhr.send(payload);
}

function setupModal() {
  previewClose.addEventListener("click", closePreview);
  previewModal.addEventListener("click", (event) => {
    if (event.target.closest('[data-close="true"]')) {
      closePreview();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && previewModal.classList.contains("open")) {
      closePreview();
    }
  });
}

function setupFileSelector() {
  selectButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    uploadFiles(fileInput.files);
    fileInput.value = "";
  });
}

function setupQrModal() {
  qrClose.addEventListener("click", closeQrCode);
  qrModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-qr-close='true']")) closeQrCode();
  });
  qrCopyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(activeQrUrl);
      showToast("Lien copié dans le presse-papiers.", "success");
    } catch {
      showToast("Impossible de copier le lien.", "error");
    }
  });
  qrPrint.addEventListener("click", () => {
    const popup = window.open("", "_blank", "width=640,height=720");
    if (!popup)
      return showToast(
        "Autorisez les fenêtres contextuelles pour imprimer.",
        "error",
      );
    popup.document.write(
      `<title>QR Code</title><img src="${qrModalImage.src}" style="display:block;width:360px;margin:40px auto"><p style="word-break:break-all;font-family:sans-serif">${activeQrUrl}</p>`,
    );
    popup.document.close();
    popup.onload = () => popup.print();
  });
}

function setupContextMenu() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#contextMenu")) {
      closeContextMenu();
    }
  });

  contextMenu.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    const entry = {
      name: contextMenu.dataset.name,
      type: contextMenu.dataset.type,
      protected: contextMenu.dataset.protected === "true",
    };

    closeContextMenu();
    handleAction(action, entry);
  });
}

function setupFolderControls() {
  parentButton.addEventListener("click", () => {
    navigateTo(getParentPath(currentPath));
  });

  createFolderButton.addEventListener("click", createFolder);
  pasteButton.addEventListener("click", pasteClipboard);

  breadcrumbs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-path]");
    if (!button) return;
    navigateTo(button.dataset.path);
  });
}

function setupSearch() {
  searchInput.addEventListener("input", () => {
    inSearchMode = Boolean(searchInput.value.trim());
    renderFiles(currentEntries);
  });
}

function setupThemeToggle() {
  const saved = window.localStorage.getItem("theme") === "dark";
  if (saved) {
    document.body.classList.add("dark");
  }

  // icon-button toggling
  function updateThemeIcon(isDark) {
    const icon = themeToggle.querySelector("span.material-symbols-outlined");
    if (icon) icon.textContent = isDark ? "light_mode" : "dark_mode";
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Activer le mode clair" : "Activer le mode sombre",
    );
    themeToggle.dataset.tooltip = isDark ? "Mode clair" : "Mode sombre";
  }

  // initialize icon appearance
  if (!themeToggle.querySelector("span")) {
    themeToggle.innerHTML =
      '<span class="material-symbols-outlined">' +
      (saved ? "light_mode" : "dark_mode") +
      "</span>";
  }
  updateThemeIcon(saved);

  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
    updateThemeIcon(isDark);
    showToast(isDark ? "Thème sombre activé" : "Thème clair activé", "info");
  });
}

function setupWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "refresh") {
        fetchFileList();
      }
    } catch (error) {
      console.error("Erreur WebSocket :", error);
    }
  });

  ws.addEventListener("close", () => {
    setStatus(
      "Connexion en temps réel perdue. Rechargez la page pour vous reconnecter.",
      "error",
    );
  });
}

function init() {
  const params = new URLSearchParams(window.location.search);
  currentPath = params.get("path") || "";

  fetchFileList();
  setupDragAndDrop();
  setupModal();
  setupQrModal();
  setupFileSelector();
  setupContextMenu();
  setupFolderControls();
  setupSearch();
  setupThemeToggle();
  setupWebSocket();

  refreshButton?.addEventListener("click", () => fetchFileList());
  copyCurrentLink?.addEventListener("click", copyCurrentFolderLink);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });
}

init();
