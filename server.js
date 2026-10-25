import express from 'express';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3801;

app.use(cors());
app.use(express.json());

const HOME = os.homedir();

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getDirSize(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return 0;
    const { stdout } = await execAsync(`du -sb "${targetPath}" 2>/dev/null`);
    const size = parseInt(stdout.split('\t')[0], 10);
    return isNaN(size) ? 0 : size;
  } catch (e) {
    return 0;
  }
}

// 1. System Overview
app.get('/api/system-overview', async (req, res) => {
  try {
    const { stdout: dfOut } = await execAsync('df -B1 /');
    const lines = dfOut.trim().split('\n');
    let total = 0, used = 0, available = 0, percent = 0;
    if (lines.length > 1) {
      const parts = lines[1].replace(/\s+/g, ' ').split(' ');
      total = parseInt(parts[1], 10);
      used = parseInt(parts[2], 10);
      available = parseInt(parts[3], 10);
      percent = parseInt(parts[4].replace('%', ''), 10);
    }

    const { stdout: osRelease } = await execAsync('cat /etc/os-release 2>/dev/null || uname -s');
    let osName = 'Linux';
    const match = osRelease.match(/PRETTY_NAME="([^"]+)"/);
    if (match) osName = match[1];

    res.json({
      total,
      used,
      available,
      percent,
      totalFormatted: formatBytes(total),
      usedFormatted: formatBytes(used),
      availableFormatted: formatBytes(available),
      osName,
      hostname: os.hostname(),
      uptime: os.uptime(),
      mountPoint: '/',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Targets list and sizes
app.get('/api/targets', async (req, res) => {
  try {
    const targetConfigs = [
      // Safe Caches
      {
        id: 'aur-paru',
        name: 'Paru AUR Build Cache',
        category: 'Development Caches',
        paths: [`${HOME}/.cache/paru/clone`],
        risk: 'safe',
        description: 'Temporary Git repositories and compiled packages cloned during AUR installations via Paru.',
        cleanCmd: `rm -rf "${HOME}/.cache/paru/clone"/*`,
      },
      {
        id: 'aur-yay',
        name: 'Yay AUR Build Cache',
        category: 'Development Caches',
        paths: [`${HOME}/.cache/yay`],
        risk: 'safe',
        description: 'Cached build archives, PKGBUILD sources and intermediate packages downloaded by Yay.',
        cleanCmd: `rm -rf "${HOME}/.cache/yay"/*`,
      },
      {
        id: 'npm-cache',
        name: 'NPM Package Cache',
        category: 'Development Caches',
        paths: [`${HOME}/.npm/_cacache`],
        risk: 'safe',
        description: 'Cached tarballs and metadata for Node packages downloaded via npm.',
        cleanCmd: `rm -rf "${HOME}/.npm/_cacache"/*`,
      },
      {
        id: 'pnpm-cache',
        name: 'PNPM Cache Store',
        category: 'Development Caches',
        paths: [`${HOME}/.cache/pnpm`],
        risk: 'safe',
        description: 'Shared content-addressable cache for pnpm package downloads.',
        cleanCmd: `rm -rf "${HOME}/.cache/pnpm"/*`,
      },
      {
        id: 'pip-cache',
        name: 'Python Pip Cache',
        category: 'Development Caches',
        paths: [`${HOME}/.cache/pip`],
        risk: 'safe',
        description: 'Downloaded Python wheels and source distributions cached by pip.',
        cleanCmd: `rm -rf "${HOME}/.cache/pip"/*`,
      },
      {
        id: 'jetbrains-cache',
        name: 'JetBrains Toolbox Backups & Downloads',
        category: 'Development Caches',
        paths: [
          `${HOME}/.cache/JetBrains/Toolbox/backup`,
          `${HOME}/.cache/JetBrains/Toolbox/download`,
        ],
        risk: 'safe',
        description: 'Old IDE rollbacks and downloaded installer tarballs created during JetBrains IDE updates.',
        cleanCmd: `rm -rf "${HOME}/.cache/JetBrains/Toolbox/backup"/* "${HOME}/.cache/JetBrains/Toolbox/download"/*`,
      },
      {
        id: 'user-trash',
        name: 'Desktop Trash Bin',
        category: 'Temporary & Trash',
        paths: [`${HOME}/.local/share/Trash`],
        risk: 'safe',
        description: 'Deleted files moved to your personal desktop recycling bin.',
        cleanCmd: `rm -rf "${HOME}/.local/share/Trash"/*`,
      },

      // Containers & VMs (Needs Review)
      {
        id: 'docker-desktop-vm',
        name: 'Docker Desktop Virtual Disk',
        category: 'Containers & VMs',
        paths: [`${HOME}/.docker/desktop/vms`],
        risk: 'review',
        description: 'Virtual machine disk image used exclusively by Docker Desktop GUI.',
        cleanCmd: `rm -rf "${HOME}/.docker/desktop/vms"/*`,
      },
      {
        id: 'virtualbox-vms',
        name: 'VirtualBox VMs',
        category: 'Containers & VMs',
        paths: [`${HOME}/VirtualBox VMs`],
        risk: 'review',
        description: 'Virtual disk files (.vdi, .vmdk) and snapshots for VirtualBox guest machines.',
        cleanCmd: `rm -rf "${HOME}/VirtualBox VMs"/*`,
      },
      {
        id: 'vagrant-boxes',
        name: 'Vagrant Base Boxes',
        category: 'Containers & VMs',
        paths: [`${HOME}/.vagrant.d/boxes`],
        risk: 'review',
        description: 'Downloaded base images for Vagrant environments (Ubuntu, Debian, etc.).',
        cleanCmd: `rm -rf "${HOME}/.vagrant.d/boxes"/*`,
      },
      {
        id: 'minikube-cache',
        name: 'Minikube VM & ISO Cache',
        category: 'Containers & VMs',
        paths: [`${HOME}/.minikube/cache`, `${HOME}/.minikube/machines`],
        risk: 'review',
        description: 'Cached boot ISOs, preloaded images, and local cluster virtual machine files.',
        cleanCmd: `rm -rf "${HOME}/.minikube/cache"/* "${HOME}/.minikube/machines"/*`,
      },
      {
        id: 'android-avd',
        name: 'Android Emulator Devices (AVD)',
        category: 'Containers & VMs',
        paths: [`${HOME}/.config/.android/avd`],
        risk: 'review',
        description: 'Android virtual device emulator disk images and snapshots.',
        cleanCmd: `rm -rf "${HOME}/.config/.android/avd"/*`,
      },

      // Root & System Items
      {
        id: 'pacman-cache',
        name: 'Pacman System Package Cache',
        category: 'System & Root',
        paths: ['/var/cache/pacman/pkg'],
        risk: 'root',
        description: 'Arch Linux package archives (.pkg.tar.zst) downloaded during system updates.',
        sudoCmd: 'sudo paccache -rk1',
        pkexecCmd: 'pkexec paccache -rk1',
      },
      {
        id: 'systemd-journal',
        name: 'Systemd Journal Logs',
        category: 'System & Root',
        paths: ['/var/log/journal'],
        risk: 'root',
        description: 'Archived and active system boot logs recorded by systemd-journald.',
        sudoCmd: 'sudo journalctl --vacuum-size=200M',
        pkexecCmd: 'pkexec journalctl --vacuum-size=200M',
      },
    ];

    // Compute sizes in parallel
    const targets = await Promise.all(
      targetConfigs.map(async (item) => {
        let totalSize = 0;
        let exists = false;
        for (const p of item.paths) {
          if (fs.existsSync(p)) {
            exists = true;
            totalSize += await getDirSize(p);
          }
        }
        return {
          ...item,
          sizeBytes: totalSize,
          formattedSize: formatBytes(totalSize),
          exists,
        };
      })
    );

    // Also get orphan count
    let orphanCount = 0;
    try {
      const { stdout: orphanOut } = await execAsync('pacman -Qtdq 2>/dev/null | wc -l');
      orphanCount = parseInt(orphanOut.trim(), 10) || 0;
    } catch (e) {}

    const orphanItem = {
      id: 'pacman-orphans',
      name: 'Pacman Orphan Packages',
      category: 'System & Root',
      paths: ['/var/lib/pacman'],
      risk: 'root',
      description: `${orphanCount} unneeded packages that were installed as dependencies but no longer required.`,
      sizeBytes: orphanCount > 0 ? orphanCount * 15 * 1024 * 1024 : 0, // estimate ~15MB each
      formattedSize: `${orphanCount} packages`,
      orphanCount,
      sudoCmd: 'sudo pacman -Rns $(pacman -Qtdq)',
      pkexecCmd: 'pkexec pacman -Rns $(pacman -Qtdq)',
      exists: orphanCount > 0,
    };
    targets.push(orphanItem);

    // Compute reclaimable safe total
    const safeTotalBytes = targets
      .filter((t) => t.risk === 'safe')
      .reduce((acc, cur) => acc + cur.sizeBytes, 0);

    res.json({
      targets,
      safeTotalBytes,
      safeTotalFormatted: formatBytes(safeTotalBytes),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Scan Large Files (> 100 MB)
app.get('/api/large-files', async (req, res) => {
  try {
    const searchDirs = [
      `${HOME}/Downloads`,
      `${HOME}/Documents`,
      `${HOME}`,
    ];

    // Quick targeted find for files > 100M, excluding hidden dot dirs in ~
    const cmd = `find "${HOME}/Downloads" "${HOME}/Documents" -type f -size +100M -exec ls -lh {} + 2>/dev/null | head -n 40`;
    let stdout = '';
    try {
      const res = await execAsync(cmd, { timeout: 8000 });
      stdout = res.stdout;
    } catch (e) {
      stdout = e.stdout || '';
    }

    // Also scan top-level home (depth 1) for large recordings or isos
    try {
      const { stdout: homeFiles } = await execAsync(`find "${HOME}" -maxdepth 1 -type f -size +100M -exec ls -lh {} + 2>/dev/null`, { timeout: 4000 });
      stdout += '\n' + homeFiles;
    } catch (e) {}

    const fileMap = new Map();
    const lines = stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 9) {
        const sizeStr = parts[4];
        // file path can contain spaces
        const filePath = parts.slice(8).join(' ');
        if (!fs.existsSync(filePath)) continue;

        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile() && !fileMap.has(filePath)) {
            fileMap.set(filePath, {
              name: path.basename(filePath),
              path: filePath,
              sizeBytes: stats.size,
              formattedSize: formatBytes(stats.size),
              modifiedTime: stats.mtime,
              directory: path.dirname(filePath),
            });
          }
        } catch (e) {}
      }
    }

    const files = Array.from(fileMap.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Clean endpoint (SSE Stream)
app.get('/api/clean-stream', (req, res) => {
  const { targetId } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const cleanMap = {
    'aur-paru': `rm -rf "${HOME}/.cache/paru/clone"/*`,
    'aur-yay': `rm -rf "${HOME}/.cache/yay"/*`,
    'npm-cache': `rm -rf "${HOME}/.npm/_cacache"/*`,
    'pnpm-cache': `rm -rf "${HOME}/.cache/pnpm"/*`,
    'pip-cache': `rm -rf "${HOME}/.cache/pip"/*`,
    'jetbrains-cache': `rm -rf "${HOME}/.cache/JetBrains/Toolbox/backup"/* "${HOME}/.cache/JetBrains/Toolbox/download"/*`,
    'user-trash': `rm -rf "${HOME}/.local/share/Trash"/*`,
    'docker-desktop-vm': `rm -rf "${HOME}/.docker/desktop/vms"/* "${HOME}/.docker/desktop/data"/*`,
    'virtualbox-vms': `rm -rf "${HOME}/VirtualBox VMs"/*`,
    'vagrant-boxes': `rm -rf "${HOME}/.vagrant.d/boxes"/*`,
    'minikube-cache': `rm -rf "${HOME}/.minikube/cache"/* "${HOME}/.minikube/machines"/*`,
    'android-avd': `rm -rf "${HOME}/.config/.android/avd"/*`,
  };

  if (targetId === 'all-safe') {
    sendEvent({ type: 'log', text: 'Starting batch cleanup of all safe development caches...' });
    const safeCmd = `rm -rf "${HOME}/.cache/paru/clone"/* "${HOME}/.cache/yay"/* "${HOME}/.npm/_cacache"/* "${HOME}/.cache/pnpm"/* "${HOME}/.cache/pip"/* "${HOME}/.cache/JetBrains/Toolbox/backup"/* "${HOME}/.cache/JetBrains/Toolbox/download"/* "${HOME}/.local/share/Trash"/*`;
    
    const child = spawn('bash', ['-c', safeCmd]);

    child.stdout.on('data', (d) => sendEvent({ type: 'log', text: d.toString() }));
    child.stderr.on('data', (d) => sendEvent({ type: 'log', text: d.toString() }));

    child.on('close', (code) => {
      if (code === 0) {
        sendEvent({ type: 'log', text: 'All safe caches successfully cleaned!' });
        sendEvent({ type: 'complete', targetId: 'all-safe', success: true });
      } else {
        sendEvent({ type: 'log', text: `Completed with exit code ${code}` });
        sendEvent({ type: 'complete', targetId: 'all-safe', success: false, code });
      }
      res.end();
    });
    return;
  }

  const cmd = cleanMap[targetId];
  if (!cmd) {
    sendEvent({ type: 'error', message: `Unknown or unsupported cleanup target: ${targetId}` });
    res.end();
    return;
  }

  sendEvent({ type: 'log', text: `Executing: ${cmd}` });
  const child = spawn('bash', ['-c', cmd]);

  child.stdout.on('data', (d) => sendEvent({ type: 'log', text: d.toString() }));
  child.stderr.on('data', (d) => sendEvent({ type: 'log', text: d.toString() }));

  child.on('close', (code) => {
    if (code === 0) {
      sendEvent({ type: 'log', text: `Cleanup of ${targetId} finished successfully.` });
      sendEvent({ type: 'complete', targetId, success: true });
    } else {
      sendEvent({ type: 'log', text: `Command exited with status code ${code}` });
      sendEvent({ type: 'complete', targetId, success: false, code });
    }
    res.end();
  });
});

// 5. Delete single large file
app.post('/api/delete-file', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  // Security guard: Must be inside /home/chanchhay
  if (!filePath.startsWith(HOME)) {
    return res.status(403).json({ error: 'Permission denied: can only delete files inside your home directory' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File does not exist' });
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a regular file' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, deletedPath: filePath, freedBytes: stat.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend in production
const distPath = path.join(path.resolve(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Backend server listening at http://127.0.0.1:${PORT}`);
});
