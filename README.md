# Local File Shared

A modern desktop application for fast, secure, and simple file sharing over local networks.

## Overview

Local File Shared is a cross-platform desktop application that allows users to share files and folders between devices connected to the same local network.

The application works without cloud services or internet access. It creates a local sharing environment with automatic device discovery, QR code access, and an intuitive interface designed for quick transfers.

Built with Electron and Node.js, Local File Shared combines a lightweight local server with a modern desktop experience.

## Features

- File and folder sharing over local networks
- Automatic device discovery
- QR code access for quick connections
- No internet connection required
- Desktop application for Windows
- Simple and modern interface
- Lightweight and fast performance
- Secure local data transfer

## Download for Users

No programming knowledge is required to use Local File Shared.

### Windows Installation

1. Open the Releases page:

   https://github.com/Josuebondo/local-file-shared/releases

2. Download the latest installer:

```
Local-File-Shared-Setup-x.x.x.exe
```

3. Open the installer and follow the installation steps.
4. Launch Local File Shared from your desktop or Start Menu.

## How to Use

1. Open Local File Shared.
2. Connect all devices to the same Wi-Fi or local network.
3. Select the files or folders you want to share.
4. Share the generated access link or QR code.
5. Other devices can open the link and download the files.

## Screenshots

Screenshots will be added soon.

## Technology Stack

| Technology        | Purpose                            |
| ----------------- | ---------------------------------- |
| Electron          | Desktop application framework      |
| Node.js           | Local server and application logic |
| JavaScript        | Core development language          |
| HTML/CSS          | User interface                     |
| Network Discovery | Local device detection             |

## Development Setup

For developers who want to modify or contribute to the project.

### Requirements

- Node.js 18+
- npm

### Clone Repository

```bash
git clone https://github.com/Josuebondo/local-file-shared.git
```

### Install Dependencies

```bash
cd local-file-shared
npm install
```

### Start Development

```bash
npm start
```

## Build Application

Create a desktop installer:

```bash
npm run build
```

The generated application package will be available in the release directory.

## Architecture

```
local-file-shared/
│
├── server.js              # Local sharing server
├── electron.js            # Electron main process
├── preload.js             # Secure communication bridge
├── networkDiscovery.js    # Local network discovery
├── public/                # Application interface
├── build/                 # Build configuration and assets
└── package.json           # Project configuration
```

## How It Works

1. Local File Shared starts a local server.
2. Network discovery detects available devices.
3. Users choose files or folders to share.
4. Connected devices access shared content through the local network.

## Roadmap

Future improvements:

- Mobile application support
- Better transfer management
- Transfer history
- Improved security features
- Multi-language support
- Advanced sharing options
- Optional cloud synchronization

## Contributing

Contributions are welcome.

To contribute:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Submit a Pull Request.

Example:

```bash
git checkout -b feature/new-feature
git commit -m "Add new feature"
git push origin feature/new-feature
```

## License

This project is licensed under the MIT License.

Copyright © 2026 Josue Bondo

## Author

Josue Bondo

GitHub:
https://github.com/Josuebondo
