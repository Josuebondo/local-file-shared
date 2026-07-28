const serverList = document.getElementById("serverList");

function createServerCard(server) {
  const card = document.createElement("div");
  card.className = "server-card";
  card.innerHTML = `
    <div class="server-card-body">
      <strong>${server.name}</strong>
      <p>${server.description || "Aucun détail"}</p>
      <div class="server-meta">
        <span>${server.host}:${server.port}</span>
        <span>${server.state}</span>
      </div>
    </div>
  <div class="server-card-actions">
    ${
      server.local
        ? `
        <button
    class="icon-button primary"
    onclick="window.location.href='${server.appUrl}'"
    title="Ouvrir le serveur">
    <span class="material-symbols-outlined">open_in_new</span>
</button>
<button class="icon-button" onclick="openSettings()">
    <span class="material-symbols-outlined">settings</span>
</button>

<button class="icon-button" onclick="showServerQr('${server.appUrl}')">
    <span class="material-symbols-outlined">qr_code_2</span>
</button>
`
        : `
<button class="icon-button" onclick="showServerQr('${server.appUrl}')">
    <span class="material-symbols-outlined">qr_code_2</span>
</button>
<button
    class="icon-button primary"
    onclick="window.location.href='${server.appUrl}'"
    title="Ouvrir le serveur">
    <span class="material-symbols-outlined">open_in_new</span>
</button>
`
    }
</div>
  `;
  return card;
}
function openSettings() {
  window.location.href = "/desktop";
}
async function showServerQr(url) {
  try {
    const response = await fetch(`/api/qrcode?text=${encodeURIComponent(url)}`);

    if (!response.ok) {
      throw new Error("Impossible de générer le QR Code.");
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    const win = window.open("", "_blank", "width=450,height=550");

    win.document.write(`
      <html>
      <head>
        <title>QR Code</title>
        <style>
          body{
            font-family:Arial,sans-serif;
            text-align:center;
            padding:20px;
          }
          img{
            width:300px;
            height:300px;
          }
        </style>
      </head>
      <body>
        <h2>Scanner ce QR Code</h2>
        <img src="${imageUrl}">
        <p>${url}</p>
      </body>
      </html>
    `);
  } catch (error) {
    alert(error.message);
  }
}
async function loadServers() {
  try {
    const response = await fetch("/api/discovery");
    const data = await response.json();
    serverList.innerHTML = "";

    if (!data.servers.length) {
      serverList.innerHTML = `<div class="empty-state">Aucun serveur trouvé. Assurez-vous qu'un serveur local est démarré sur le même réseau.</div>`;
      return;
    }

    data.servers.forEach((server) => {
      serverList.appendChild(createServerCard(server));
    });
  } catch (error) {
    serverList.innerHTML = `<div class="empty-state">Impossible de charger les serveurs : ${error.message}</div>`;
  }
}

loadServers();
setInterval(loadServers, 8000);
