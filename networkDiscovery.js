const os = require("os");

class NetworkDiscovery {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.interval = options.interval || 10000;
    this.timeout = options.timeout || 800;
    this.maxConcurrent = options.maxConcurrent || 40;

    this.timer = null;
    this.running = false;

    this.servers = {};
    this.onServerFound = options.onServerFound || (() => {});
    this.onServerRemoved = options.onServerRemoved || (() => {});
  }

  getLocalIp() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (
          net.family === "IPv4" &&
          !net.internal &&
          !net.address.startsWith("169.254.")
        ) {
          return net.address;
        }
      }
    }

    return "127.0.0.1";
  }

  getSubnet() {
    const ip = this.getLocalIp();
    const parts = ip.split(".");
    parts.pop();
    return parts.join(".");
  }

  async start() {
    if (this.running) return;

    this.running = true;

    await this.scan();

    this.timer = setInterval(async () => {
      await this.scan();
      this.cleanup();
    }, this.interval);
  }

  stop() {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async scan() {
    const subnet = this.getSubnet();

    const addresses = [];

    for (let i = 1; i <= 254; i++) {
      addresses.push(`${subnet}.${i}`);
    }

    let index = 0;

    const workers = [];

    for (let i = 0; i < this.maxConcurrent; i++) {
      workers.push(
        (async () => {
          while (index < addresses.length) {
            const ip = addresses[index++];
            await this.checkServer(ip);
          }
        })(),
      );
    }

    await Promise.all(workers);
  }
  async checkServer(ip) {
    try {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeout);

      const response = await fetch(`http://${ip}:${this.port}/api/info`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) return;

      const data = await response.json();

      if (data.app !== "LocalFileShared") return;

      const id = `${ip}:${this.port}`;

      this.servers[id] = {
        id,
        host: ip,
        port: this.port,
        url: `http://${ip}:${this.port}`,
        appUrl: `http://${ip}:${this.port}/app`,
        name: data.name || "Local File Shared",
        description: data.description || "",
        state: "online",
        local: ip === this.getLocalIp(),
        lastSeen: Date.now(),
      };

      this.onServerFound(this.servers[id]);
    } catch (err) {
      // serveur absent
    }
  }

  cleanup() {
    const now = Date.now();

    Object.keys(this.servers).forEach((id) => {
      if (now - this.servers[id].lastSeen > this.interval * 2) {
        this.onServerRemoved(this.servers[id]);
        delete this.servers[id];
      }
    });
  }

  getServers() {
    return Object.values(this.servers).sort((a, b) => {
      if (a.local) return -1;
      if (b.local) return 1;

      return a.name.localeCompare(b.name);
    });
  }
}

module.exports = NetworkDiscovery;
