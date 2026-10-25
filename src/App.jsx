import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Layers,
  FileBox,
  Copy,
  Check,
  Folder,
  Server,
  Box,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  Info,
  CheckCircle2,
  FileWarning
} from 'lucide-react';

export default function App() {
  const [systemOverview, setSystemOverview] = useState(null);
  const [targets, setTargets] = useState([]);
  const [safeTotalFormatted, setSafeTotalFormatted] = useState('0 B');
  const [safeTotalBytes, setSafeTotalBytes] = useState(0);
  const [largeFiles, setLargeFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Terminal Drawer State
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [cleanStatus, setCleanStatus] = useState('idle'); // idle | running | success | error
  const [currentCleanTarget, setCurrentCleanTarget] = useState(null);

  // Modal State
  const [confirmModal, setConfirmModal] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (terminalOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, terminalOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sysRes, targetsRes, filesRes] = await Promise.all([
        fetch('/api/system-overview'),
        fetch('/api/targets'),
        fetch('/api/large-files'),
      ]);

      const sysData = await sysRes.json();
      const targetsData = await targetsRes.json();
      const filesData = await filesRes.json();

      setSystemOverview(sysData);
      setTargets(targetsData.targets || []);
      setSafeTotalFormatted(targetsData.safeTotalFormatted || '0 B');
      setSafeTotalBytes(targetsData.safeTotalBytes || 0);
      setLargeFiles(filesData.files || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      addLog(`[Error] Failed to connect to server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (text) => {
    const time = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [...prev, `[${time}] ${text}`]);
  };

  const executeClean = (targetId, targetName) => {
    setTerminalOpen(true);
    setCleanStatus('running');
    setCurrentCleanTarget(targetName || targetId);
    addLog(`Initiating cleanup for: ${targetName || targetId}...`);

    const eventSource = new EventSource(`/api/clean-stream?targetId=${encodeURIComponent(targetId)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          addLog(data.text);
        } else if (data.type === 'complete') {
          if (data.success) {
            setCleanStatus('success');
            addLog(`✓ Cleanup finished successfully!`);
          } else {
            setCleanStatus('error');
            addLog(`✗ Cleanup finished with errors.`);
          }
          eventSource.close();
          setTimeout(() => {
            fetchData();
          }, 1200);
        } else if (data.type === 'error') {
          setCleanStatus('error');
          addLog(`[Error] ${data.message}`);
          eventSource.close();
        }
      } catch (e) {
        addLog(event.data);
      }
    };

    eventSource.onerror = () => {
      setCleanStatus('error');
      addLog('[Error] EventSource connection closed or error occurred.');
      eventSource.close();
    };
  };

  const handleCleanTarget = (target) => {
    if (target.risk === 'review') {
      setConfirmModal({
        type: 'target',
        data: target,
        title: `Clean ${target.name}?`,
        description: `This will remove files in ${target.paths.join(', ')}. Make sure you do not have unsaved data in this environment.`,
        sizeFormatted: target.formattedSize,
      });
      return;
    }
    executeClean(target.id, target.name);
  };

  const handleDeleteFile = (file) => {
    setConfirmModal({
      type: 'file',
      data: file,
      title: `Delete Large File?`,
      description: `Are you sure you want to permanently delete: ${file.path}? This action cannot be undone.`,
      sizeFormatted: file.formattedSize,
    });
  };

  const confirmAction = async () => {
    if (!confirmModal) return;
    const { type, data } = confirmModal;
    setConfirmModal(null);

    if (type === 'target') {
      executeClean(data.id, data.name);
    } else if (type === 'file') {
      setTerminalOpen(true);
      setCleanStatus('running');
      addLog(`Deleting file: ${data.path} (${data.formattedSize})...`);
      try {
        const res = await fetch('/api/delete-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: data.path }),
        });
        const result = await res.json();
        if (result.success) {
          setCleanStatus('success');
          addLog(`✓ Successfully deleted: ${data.name}`);
          setTimeout(fetchData, 800);
        } else {
          setCleanStatus('error');
          addLog(`✗ Failed to delete file: ${result.error}`);
        }
      } catch (err) {
        setCleanStatus('error');
        addLog(`✗ Error: ${err.message}`);
      }
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Grouping targets
  const safeTargets = targets.filter((t) => t.risk === 'safe');
  const reviewTargets = targets.filter((t) => t.risk === 'review');
  const rootTargets = targets.filter((t) => t.risk === 'root');

  const filteredTargets = () => {
    switch (activeTab) {
      case 'safe':
        return safeTargets;
      case 'containers':
        return reviewTargets;
      case 'system':
        return rootTargets;
      default:
        return targets;
    }
  };

  const percentUsed = systemOverview ? systemOverview.percent : 0;
  const isWarning = percentUsed >= 75 && percentUsed < 90;
  const isCritical = percentUsed >= 90;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Storage Hub</h1>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  {systemOverview?.osName || 'Arch Linux'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Host: <span className="text-slate-300 font-mono">{systemOverview?.hostname || 'localhost'}</span> • Root Mount: <span className="text-slate-300 font-mono">/</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTerminalOpen(!terminalOpen)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                terminalOpen
                  ? 'bg-slate-800 border-slate-600 text-cyan-300'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Console</span>
              {terminalLogs.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Rescan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-6 flex-1 w-full space-y-6">
        {/* Storage Overview Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Ring & Usage Card */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/70 border border-slate-800 p-6 flex flex-col sm:flex-row items-center gap-8 shadow-xl">
            {/* Visual Ring */}
            <div className="relative flex-shrink-0 flex items-center justify-center">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  className="stroke-slate-800/80"
                  strokeWidth="12"
                  fill="transparent"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  className={`transition-all duration-1000 ease-out ${
                    isCritical
                      ? 'stroke-rose-500'
                      : isWarning
                      ? 'stroke-amber-400'
                      : 'stroke-cyan-400'
                  }`}
                  strokeWidth="12"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={
                    2 * Math.PI * 50 - (percentUsed / 100) * (2 * Math.PI * 50)
                  }
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {percentUsed}%
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Used
                </span>
              </div>
            </div>

            {/* Storage Stats breakdown */}
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">NVMe Root Filesystem</h2>
                  <p className="text-xs text-slate-400">Total physical capacity: {systemOverview?.totalFormatted || '...'}</p>
                </div>
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
                    isCritical
                      ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                      : isWarning
                      ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  }`}
                >
                  {isCritical ? 'Critically Full' : isWarning ? 'Warning Space' : 'Healthy Status'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60">
                  <span className="text-xs text-slate-400 block mb-1">Used Space</span>
                  <span className="text-lg font-bold text-slate-200">
                    {systemOverview?.usedFormatted || '...'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60">
                  <span className="text-xs text-slate-400 block mb-1">Available Free Space</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {systemOverview?.availableFormatted || '...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Safe Actions Card */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Reclaimable Safe Caches</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Non-destructive caches (NPM, Paru/Yay, JetBrains downloads & Trash) that can be emptied with no risk.
              </p>
              <div className="text-2xl font-black text-emerald-400 tracking-tight mb-1">
                {safeTotalFormatted}
              </div>
              <span className="text-[11px] text-slate-500">Ready to clean right now</span>
            </div>

            <button
              onClick={() => executeClean('all-safe', 'All Safe Caches')}
              disabled={safeTotalBytes === 0 || cleanStatus === 'running'}
              className="w-full mt-4 py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clean All Safe Caches</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2 overflow-x-auto">
          {[
            { id: 'all', label: 'All Targets', count: targets.length },
            { id: 'safe', label: 'Safe Caches', count: safeTargets.length, badge: 'Safe' },
            { id: 'containers', label: 'VMs & Containers', count: reviewTargets.length },
            { id: 'largeFiles', label: 'Large Files (>100MB)', count: largeFiles.length },
            { id: 'system', label: 'System & Root', count: rootTargets.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-slate-400 border border-slate-800">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab 1: Large Files Explorer */}
        {activeTab === 'largeFiles' ? (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Large Files Discovered</h3>
                <p className="text-xs text-slate-400">
                  Files larger than 100MB found in Downloads, Documents, and home.
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-400">
                {largeFiles.length} files found
              </span>
            </div>

            {largeFiles.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No large files (&gt;100MB) found in scan directories.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                {largeFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-800 text-cyan-400 mt-0.5">
                        <FileBox className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-white truncate max-w-xl">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xl font-mono">
                          {file.directory}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-slate-950 text-cyan-400 border border-slate-800">
                        {file.formattedSize}
                      </span>
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Targets Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTargets().map((target) => {
              const isSafe = target.risk === 'safe';
              const isReview = target.risk === 'review';
              const isRoot = target.risk === 'root';

              return (
                <div
                  key={target.id}
                  className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 flex flex-col justify-between hover:border-slate-700/80 transition-all shadow-lg"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-xl ${
                            isSafe
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60'
                              : isReview
                              ? 'bg-amber-950/60 text-amber-400 border border-amber-900/60'
                              : 'bg-purple-950/60 text-purple-400 border border-purple-900/60'
                          }`}
                        >
                          {isSafe ? (
                            <ShieldCheck className="w-4 h-4" />
                          ) : isReview ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <Lock className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white tracking-tight">
                            {target.name}
                          </h4>
                          <span className="text-[10px] text-slate-400">
                            {target.category}
                          </span>
                        </div>
                      </div>

                      <span className="text-sm font-mono font-bold text-white px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                        {target.formattedSize}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                      {target.description}
                    </p>

                    {/* Paths */}
                    <div className="space-y-1 mb-4">
                      {target.paths.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 truncate"
                        >
                          <Folder className="w-3 h-3 flex-shrink-0 text-slate-600" />
                          <span className="truncate">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    {/* Risk Badge */}
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        isSafe
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                          : isReview
                          ? 'bg-amber-950 text-amber-400 border-amber-800/60'
                          : 'bg-purple-950 text-purple-400 border-purple-800/60'
                      }`}
                    >
                      {isSafe ? 'Safe to Clean' : isReview ? 'Requires Review' : 'Requires Root'}
                    </span>

                    {/* Button */}
                    {isRoot ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyToClipboard(target.sudoCmd, target.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedId === target.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied Sudo</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Sudo</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCleanTarget(target)}
                        disabled={target.sizeBytes === 0 || cleanStatus === 'running'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSafe
                            ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm'
                            : 'bg-amber-600/90 hover:bg-amber-500 text-white shadow-sm'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clean</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-900/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{confirmModal.title}</h3>
                <span className="text-xs text-amber-400 font-medium">Reclaiming {confirmModal.sizeFormatted}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              {confirmModal.description}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition-colors cursor-pointer"
              >
                Confirm & Clean
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Terminal Output Console */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 transition-all duration-300 shadow-2xl backdrop-blur-md ${
          terminalOpen ? 'h-64' : 'h-10'
        }`}
      >
        {/* Console Header Bar */}
        <div
          onClick={() => setTerminalOpen(!terminalOpen)}
          className="h-10 px-6 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none border-b border-slate-800/50"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-semibold text-slate-300">
              Live Console Output
            </span>
            {cleanStatus === 'running' && (
              <span className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Running: {currentCleanTarget}...
              </span>
            )}
            {cleanStatus === 'success' && (
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {terminalLogs.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTerminalLogs([]);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            )}
            {terminalOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Console Body */}
        {terminalOpen && (
          <div className="h-[calc(100%-2.5rem)] p-4 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 bg-slate-950/80">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-600 italic">No output yet. Run a cleanup operation to view streaming logs here.</div>
            ) : (
              terminalLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
