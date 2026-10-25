# Storage Hub — Arch Linux Disk & Cache Manager

A modern, lightweight web dashboard for managing disk space, clearing safe development caches, inspecting virtual machines and containers, and cleaning large files on Arch Linux.

---

## Quick Start

Simply run the launcher script:

```bash
cd ~/Documents/system-storage-manager
./start.sh
```

Or start with npm:

```bash
npm start
```

The dashboard will open automatically in your browser at `http://localhost:3801`.

---

## Features

- **Real-Time Storage Ring**: Displays total, used, and available NVMe root space with health status badges.
- **Categorized Targets**:
  - **Safe Caches (One-Click Clean All)**: NPM (`~/.npm`), Paru (`~/.cache/paru`), Yay (`~/.cache/yay`), JetBrains Toolbox downloads & backups, Pip, PNPM, and Trash (`~/.local/share/Trash`).
  - **VMs & Containers**: Docker Desktop virtual disk, VirtualBox VMs, Vagrant base boxes, Minikube cache, Android AVD emulators with caution dialogs.
  - **System & Root**: Pacman cache trimming (`paccache -rk1`), Systemd journal vacuuming (`journalctl --vacuum-size=200M`), and orphan packages (`pacman -Qtdq`) with copyable sudo commands.
  - **Large Files Explorer**: Discovers and lists files larger than 100MB across your home directory with individual delete buttons and confirmation modals.
- **Live Console Drawer**: Streams cleanup shell output in real-time with status indicators.
- **Dark Mode UI**: Sleek Arch Linux dark theme with Tailwind CSS, Lucide icons, and responsive layout.

---

## Development Mode

To run with hot-reloading:

```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend (Vite)
npm run dev
```
