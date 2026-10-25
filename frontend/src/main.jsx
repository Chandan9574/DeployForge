import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Check,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  RotateCw,
  Server,
  Terminal,
  Trash2,
  X
} from "lucide-react";
import { api } from "./api";
import "./styles.css";

const STAGES = ["cloning", "building", "starting", "checking", "running"];
const ACTIVE = ["pending", "cloning", "building", "starting", "checking", "running"];

const STATUS_LABELS = {
  pending: "Queued",
  cloning: "Cloning",
  building: "Building",
  starting: "Starting",
  checking: "Health check",
  running: "Running",
  failed: "Failed",
  stopped: "Stopped"
};

function formatBytes(bytes = 0) {
  if (!bytes) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function formatDuration(ms = 0) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`;
}

function isActive(status) {
  return ACTIVE.includes(status);
}

function App() {
  const [deployments, setDeployments] = useState([]);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    projectName: "demo-app",
    repositoryUrl: "",
    branchName: "",
    healthcheckPath: "/"
  });
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [logsFor, setLogsFor] = useState(null);
  const messageTimer = useRef(null);

  const notify = useCallback((text) => {
    setMessage(text);
    clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(""), 6000);
  }, []);

  const loadDeployments = useCallback(async ({ manual = false } = {}) => {
    if (document.hidden && !manual) return;
    if (manual) setRefreshing(true);
    try {
      setDeployments(await api.list());
    } catch (error) {
      notify(error.message);
    } finally {
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    api.config()
      .then((value) => {
        setConfig(value);
        setForm((current) => ({
          ...current,
          repositoryUrl: current.repositoryUrl || value.defaultRepositoryUrl || ""
        }));
      })
      .catch((error) => notify(error.message));

    loadDeployments();
    const timer = setInterval(() => loadDeployments(), 3000);
    const onVisible = () => {
      if (!document.hidden) loadDeployments();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      clearTimeout(messageTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadDeployments, notify]);

  // Move to Step 2 when hitting Enter on URL
  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (repoUrl.trim()) {
      let autoName = "demo-app";
      if (repoUrl.includes("github.com/")) {
        autoName = repoUrl.split("github.com/")[1].split("/")[1]?.replace(/\.git$/, '') || "demo-app";
      }
      setProjectName(autoName);
      setBranch(""); // Will be auto-set by BranchDropdown
      setStep(2);
    }
  };

  // Final Deploy
  async function createDeployment(event) {
    event.preventDefault();
    if (!form.branchName.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      await api.create({
        projectName: form.projectName.trim() || "demo-app",
        repositoryUrl: form.repositoryUrl.trim(),
        branchName: form.branchName.trim(),
        healthcheckPath: form.healthcheckPath.trim() || "/",
        dockerfilePath: form.dockerfilePath?.trim() || "Dockerfile",
        buildContext: form.buildContext?.trim() || ".",
        deploymentMode: "dockerfile"
      });
      setForm((current) => ({ ...current, branchName: "" }));
      notify("Deployment queued. Docker build started.");
      await loadDeployments({ manual: true });
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeDeployment(deployment) {
    if (!window.confirm(`Delete the preview for ${deployment.branchName}?`)) return;
    try {
      await api.remove(deployment._id);
      notify(`${deployment.branchName} removed`);
      loadDeployments({ manual: true });
    } catch (error) {
      notify(error.message);
    }
  }

  async function restartDeployment(deployment) {
    try {
      await api.restart(deployment._id);
      notify(`Redeploying ${deployment.branchName}`);
      loadDeployments({ manual: true });
    } catch (error) {
      notify(error.message);
    }
  }

  const offsetX = (mouse.x - window.innerWidth / 2) * -0.03;
  const offsetY = (mouse.y - window.innerHeight / 2) * -0.03;

  return (
    <main className="page">
      <header className="header">
        <div className="brand-wrap">
          <a className="brand" href="/">DeployForge</a>
          <span className="brand-tag">branch previews</span>
        </div>
        <div className="header-actions">
          {config && (
            <span className="domain">
              <Server size={13} /> {config.previewScheme}://*.{config.previewDomain}
            </span>
          )}
          <button className="ghost-button" onClick={() => loadDeployments({ manual: true })}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      <section className="intro">
        <p className="kicker">ZERO-CONFIG PREVIEW ENGINE</p>
        <h1>Every branch deserves a preview.</h1>
        <p>
          Push a branch. DeployForge builds its Dockerfile, starts an isolated container,
          configures Nginx, and returns a public staging link in one request.
        </p>
        <div className="intro-points">
          <span><GitBranch size={14} /> Git branch to container</span>
          <span><Activity size={14} /> Live CPU and memory</span>
          <span><Clock size={14} /> Target under 15 seconds</span>
        </div>
      </section>

      <form className="deploy-form" onSubmit={createDeployment}>
        <div className="form-heading">
          <div>
            <label htmlFor="branch">Create a preview</label>
            <p>Use an HTTPS repository URL that contains a Dockerfile.</p>
          </div>
          <button type="button" className="link-button" onClick={() => setAdvanced((value) => !value)}>
            {advanced ? "Hide options" : "Options"}
          </button>
        </div>

        <div className="form-grid">
          <div className="field">
            <span className="field-label">Project</span>
            <input
              value={form.projectName}
              onChange={(event) => setForm({ ...form, projectName: event.target.value })}
              placeholder="demo-app"
            />
          </div>
          <div className="field grow">
            <span className="field-label">Branch</span>
            <div className="input-with-icon">
              <GitBranch size={16} />
              <input
                id="branch"
                value={form.branchName}
                onChange={(event) => setForm({ ...form, branchName: event.target.value })}
                placeholder="feature/header"
                required
              />
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Repository URL</span>
          <input
            value={form.repositoryUrl}
            onChange={(event) => setForm({ ...form, repositoryUrl: event.target.value })}
            placeholder={config?.defaultRepositoryUrl || "https://github.com/team/app"}
            required={!config?.defaultRepositoryUrl}
          />
        </div>

        {advanced && (
          <div className="form-grid">
            <div className="field">
              <span className="field-label">Dockerfile</span>
              <input
                value={form.dockerfilePath || "Dockerfile"}
                onChange={(event) => setForm({ ...form, dockerfilePath: event.target.value })}
              />
            </div>
            <div className="field">
              <span className="field-label">Build context</span>
              <input
                value={form.buildContext || "."}
                onChange={(event) => setForm({ ...form, buildContext: event.target.value })}
              />
            </div>
            <div className="field">
              <span className="field-label">Health path</span>
              <input
                value={form.healthcheckPath}
                onChange={(event) => setForm({ ...form, healthcheckPath: event.target.value })}
              />
            </div>
          </div>
        )}

        <div className="form-footer">
          <small>Images are built through the Docker socket. Containers are resource-limited.</small>
          <button className="deploy-button" disabled={loading}>
            {loading ? <><LoaderCircle size={15} className="spin" /> Queuing</> : "Deploy branch"}
          </button>
        </div>
      </form>

      {message && <p className="message">{message}</p>}

      <section className="previews">
        <div className="section-title">
          <div>
            <p className="kicker">ALL PROJECTS</p>
            <h2>Preview deployments</h2>
          </div>
          <span>{deployments.length} {deployments.length === 1 ? "preview" : "previews"}</span>
        </div>

        {deployments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><GitBranch size={20} /></div>
            <h3>No preview deployments yet</h3>
            <p>Enter a branch above to build the first isolated environment.</p>
          </div>
        ) : (
          <div className="deployment-list">
            {deployments.map((deployment) => (
              <DeploymentCard
                key={deployment._id}
                deployment={deployment}
                onDelete={() => removeDeployment(deployment)}
                onRestart={() => restartDeployment(deployment)}
                onLogs={() => setLogsFor(deployment)}
              />
            ))}
          </div>
        )}
      </section>

      {logsFor && <LogsDrawer deployment={logsFor} onClose={() => setLogsFor(null)} />}
    </main>
  );
}

function StageProgress({ deployment }) {
  if (deployment.status === "failed" || deployment.status === "stopped") {
    return (
      <div className={`stage-note ${deployment.status}`}>
        {deployment.errorMessage || `Preview ${deployment.status}`}
      </div>
    );
  }

  const current = deployment.status === "pending" ? -1 : STAGES.indexOf(deployment.status);
  return (
    <div className="stages" aria-label="Deployment progress">
      {STAGES.map((stage, index) => (
        <span
          key={stage}
          className={`stage ${index < current ? "done" : ""} ${index === current ? "current" : ""}`}
          title={STATUS_LABELS[stage]}
        >
          <i />
          <em>{STATUS_LABELS[stage]}</em>
        </span>
      ))}
    </div>
  );
}

function Sparkline({ values }) {
  if (!values.length) return <div className="sparkline empty-spark" />;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 28 - (value / max) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeploymentCard({ deployment, onDelete, onRestart, onLogs }) {
  const [stats, setStats] = useState({ cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 });
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (deployment.status !== "running") return undefined;
    let active = true;

    async function refreshStats() {
      if (document.hidden) return;
      try {
        const value = await api.stats(deployment._id);
        if (!active) return;
        setStats(value);
        setCpuHistory((history) => [...history.slice(-29), value.cpuPercent || 0]);
        const memoryMb = (value.memoryUsage || 0) / 1024 / 1024;
        setMemoryHistory((history) => [...history.slice(-29), memoryMb]);
      } catch {
        // A transient stats failure should not break the dashboard.
      }
    }

    refreshStats();
    const timer = setInterval(refreshStats, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deployment._id, deployment.status]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(deployment.previewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail outside secure contexts.
    }
  }

  const latestLog = deployment.logs?.slice(-1)[0];
  const memoryPercent = stats.memoryLimit ? Math.min(100, (stats.memoryUsage / stats.memoryLimit) * 100) : 0;

  return (
    <article className={`deployment-card status-${deployment.status}`}>
      <div className="deployment-main">
        <div className="branch-name">
          <span className={`status-dot ${deployment.status}`} />
          <div>
            <strong>{deployment.branchName}</strong>
            <span className="branch-meta">
              {deployment.commitSha ? <><GitCommitHorizontal size={11} /> {deployment.commitSha.slice(0, 7)}</> : "Waiting for commit"}
              <span className="dot-sep">·</span>
              port {deployment.hostPort}
              {deployment.durationMs > 0 && <><span className="dot-sep">·</span>{formatDuration(deployment.durationMs)}</>}
            </span>
          </div>
        </div>
        <span className={`status ${deployment.status}`}>{STATUS_LABELS[deployment.status] || deployment.status}</span>
      </div>

      <StageProgress deployment={deployment} />

      {isActive(deployment.status) && latestLog && (
        <p className="latest-log" title={latestLog}><Terminal size={12} /> {latestLog}</p>
      )}

      {deployment.previewUrl && (
        <div className="url-row">
          <a className="preview-url" href={deployment.previewUrl} target="_blank" rel="noreferrer">
            {deployment.previewUrl} <ExternalLink size={13} />
          </a>
          <button className="icon-button" onClick={copyUrl} title="Copy preview URL">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <span className="metric-head"><Cpu size={13} /> CPU <b>{stats.cpuPercent}%</b></span>
          <Sparkline values={cpuHistory} />
        </div>
        <div className="metric">
          <span className="metric-head"><Server size={13} /> Memory <b>{formatBytes(stats.memoryUsage)}</b></span>
          <Sparkline values={memoryHistory} />
          <span className="meter"><i style={{ width: `${memoryPercent}%` }} /></span>
        </div>
        <div className="metric small">
          <span className="metric-head"><Terminal size={13} /> Container</span>
          <span className="mono">{deployment.containerName}</span>
        </div>
      </div>

      <div className="card-actions">
        <button onClick={onLogs}><Terminal size={14} /> Logs</button>
        <button onClick={onRestart} disabled={["cloning", "building", "starting", "checking"].includes(deployment.status)}>
          <RotateCw size={14} /> Redeploy
        </button>
        <button className="danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
    </article>
  );
}

function LogsDrawer({ deployment, onClose }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let active = true;
    let seen = 0;

    async function load() {
      try {
        const { logs: lines } = await api.logs(deployment._id);
        if (!active) return;
        if (lines.length !== seen) {
          setLogs(lines);
          seen = lines.length;
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    }

    load();
    const timer = setInterval(load, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deployment._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer">
        <header className="drawer-header">
          <div>
            <p className="kicker">DEPLOYMENT LOGS</p>
            <h3>{deployment.branchName}</h3>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="drawer-body">
          {error && <p className="error">{error}</p>}
          {logs.length === 0 && !error ? <p className="muted">No logs yet.</p> : logs.map((line, index) => (
            <p className="log-line" key={`${index}-${line.slice(0, 20)}`}>{line}</p>
          ))}
          <div ref={bottomRef} />
        </div>
        <footer className="drawer-footer">
          <span><span className={`status-dot ${deployment.status}`} /> {STATUS_LABELS[deployment.status]}</span>
          <span>Refreshes every 1.5s</span>
        </footer>
      </aside>
    </div>
  );
}

const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
