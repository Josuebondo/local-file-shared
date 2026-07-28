const serverNameInput = document.getElementById("serverName");
const serverDescriptionInput = document.getElementById("serverDescription");
const serverPortInput = document.getElementById("serverPort");
const sharedFolderInput = document.getElementById("sharedFolder");
const chooseFolderButton = document.getElementById("chooseFolder");
const createFolderCheckbox = document.getElementById("createFolder");
const setupForm = document.getElementById("setupForm");
const serverPanel = document.getElementById("serverPanel");
const configPanel = document.getElementById("configPanel");
const infoName = document.getElementById("infoName");
const infoDescription = document.getElementById("infoDescription");
const infoStatus = document.getElementById("infoStatus");
const infoAddress = document.getElementById("infoAddress");
const infoPort = document.getElementById("infoPort");
const infoUrl = document.getElementById("infoUrl");
const qrCodeImage = document.getElementById("qrCodeImage");
const openAppButton = document.getElementById("openAppButton");
const openFolderButton = document.getElementById("openFolderButton");
const restartButton = document.getElementById("restartButton");
const stopButton = document.getElementById("stopButton");
const editConfigButton = document.getElementById("editConfigButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const desktopThemeToggle = document.getElementById("desktopThemeToggle");

function setVisible(element, visible) {
  element.classList.toggle("hidden", !visible);
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Impossible de charger la configuration.");
    }

    serverNameInput.value = data.name || "Local File Shared";
    serverDescriptionInput.value = data.description || "";
    serverPortInput.value = data.port || 3000;
    sharedFolderInput.value = data.sharedFolder || "";

    infoName.textContent = data.name || "–";
    infoDescription.textContent = data.description || "–";
    infoStatus.textContent = data.configured ? "En ligne" : "En attente";
    infoAddress.textContent = window.location.hostname;
    infoPort.textContent = data.port || "–";
    infoUrl.textContent = window.location.href;
    infoUrl.href = window.location.href;

    try {
      const qrcodeResponse = await fetch(
        `/api/qrcode?text=${encodeURIComponent(window.location.href)}`,
      );
      if (qrcodeResponse.ok) {
        const blob = await qrcodeResponse.blob();
        qrCodeImage.src = URL.createObjectURL(blob);
      }
    } catch (error) {
      console.warn("Impossible de charger le QR Code :", error.message);
    }

    setVisible(serverPanel, true);
    setVisible(configPanel, false);
  } catch (error) {
    console.error(error);
    setVisible(serverPanel, false);
    setVisible(configPanel, true);
  }
}

chooseFolderButton.addEventListener("click", async () => {
  if (window.electronApi?.selectFolder) {
    const folder = await window.electronApi.selectFolder();
    if (folder) {
      sharedFolderInput.value = folder;
    }
    return;
  }

  const selected = window.prompt(
    "Entrez le chemin du dossier partagé :",
    sharedFolderInput.value || "",
  );
  if (selected) {
    sharedFolderInput.value = selected;
  }
});

// Small UI helpers: toast notifications and tooltips
function showToast(message, type = "info", ms = 3500) {
  const containerId = "toastContainer";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.className = "toast";
    document.body.appendChild(container);
  }

  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";
  }, ms - 300);
  setTimeout(() => item.remove(), ms);
}

// Replace textual labels with icon hints for action buttons
function iconifyButtons() {
  const map = {
    openAppButton: "open_in_new",
    openFolderButton: "folder_open",
    restartButton: "restart_alt",
    stopButton: "power_settings_new",
    editConfigButton: "settings",
  };

  Object.keys(map).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<span class="material-symbols-outlined">${map[id]}</span>`;
  });

  chooseFolderButton.innerHTML =
    '<span class="material-symbols-outlined">folder_open</span>';
  chooseFolderButton.classList.add("icon-button");
  chooseFolderButton.setAttribute("aria-label", "Sélectionner le dossier");
  chooseFolderButton.dataset.tooltip = "Sélectionner";

  const submitButton = setupForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.className = "button primary";
    submitButton.innerHTML =
      '<span class="material-symbols-outlined">save</span><span>Enregistrer</span>';
  }
  cancelEditButton.className = "button secondary";
  cancelEditButton.innerHTML =
    '<span class="material-symbols-outlined">close</span><span>Annuler</span>';
}

document.addEventListener("DOMContentLoaded", () => {
  iconifyButtons();
  const isDark = window.localStorage.getItem("theme") === "dark";
  document.body.classList.toggle("dark", isDark);
  desktopThemeToggle.querySelector("span").textContent = isDark
    ? "light_mode"
    : "dark_mode";
  desktopThemeToggle.dataset.tooltip = isDark ? "Mode clair" : "Mode sombre";
  desktopThemeToggle.addEventListener("click", () => {
    const dark = document.body.classList.toggle("dark");
    window.localStorage.setItem("theme", dark ? "dark" : "light");
    desktopThemeToggle.querySelector("span").textContent = dark
      ? "light_mode"
      : "dark_mode";
    desktopThemeToggle.dataset.tooltip = dark ? "Mode clair" : "Mode sombre";
  });
});

openAppButton.addEventListener("click", () => {
  window.open("/app", "_blank");
});

openFolderButton.addEventListener("click", async () => {
  if (window.electronApi?.openFolder) {
    await window.electronApi.openFolder(sharedFolderInput.value);
  }
});

restartButton.addEventListener("click", async () => {
  if (window.electronApi?.restartApp) {
    await window.electronApi.restartApp();
  }
});

stopButton.addEventListener("click", async () => {
  if (window.electronApi?.stopApp) {
    await window.electronApi.stopApp();
  }
});

editConfigButton.addEventListener("click", () => {
  setVisible(serverPanel, false);
  setVisible(configPanel, true);
});

cancelEditButton.addEventListener("click", () => {
  setVisible(serverPanel, true);
  setVisible(configPanel, false);
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!serverNameInput.value.trim()) {
    alert("Le nom du serveur est requis.");
    return;
  }

  const payload = {
    name: serverNameInput.value.trim(),
    description: serverDescriptionInput.value.trim(),
    port: Number(serverPortInput.value) || 3000,
    sharedFolder: sharedFolderInput.value.trim(),
    createFolder: createFolderCheckbox.checked,
  };

  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "Impossible d'enregistrer la configuration.");
    return;
  }
  if (!info.isOwner) {
    document.getElementById("settings-link").style.display = "none";
  }
  window.location.reload();
});

loadConfig();
