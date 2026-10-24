import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, GitBranch, LoaderCircle, RefreshCw, Terminal, Trash2 } from "lucide-react";
import "./styles.css";

const api = "/api";

function formatBytes(bytes = 0) {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : "0 MB";
}

function App() {
  const [deployments, setDeployments] = useState([]);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDeployments(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    try {
      const response = await fetch(`${api}/deployments`);
      if (!response.ok) throw new Error("Unable to load deployments.");
      setDeployments(await response.json());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDeployments();
    const timer = setInterval(loadDeployments, 5000);
    return () => clearInterval(timer);
  }, []);

  async function createDeployment(event) {
    event.preventDefault();
    if (!branch.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${api}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchName: branch.trim(), image: "nginx:alpine", containerPort: 80 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to create deployment.");
      setBranch("");
      setMessage("Deployment started.");
      loadDeployments();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeDeployment(id) {
    try {
      const response = await fetch(`${api}/deployments/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to remove deployment.");
      loadDeployments();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <a className="brand" href="/">DeployForge</a>
        <button className="refresh" onClick={() => loadDeployments(true)} title="Refresh deployments">
          <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Refresh
        </button>
      </header>

      <section className="intro">
        <p className="kicker">DEPLOYMENT PREVIEWS</p>
        <h1>Test a branch before it ships.</h1>
        <p>Start a preview environment for a branch and share the link with your team.</p>
      </section>

      <form className="deploy-form" onSubmit={createDeployment}>
        <label htmlFor="branch">Branch name</label>
        <div className="form-row">
          <div className="input">
            <GitBranch size={16} />
            <input id="branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="feature/header" />
          </div>
          <button className="deploy-button" disabled={loading}>
            {loading ? <><LoaderCircle size={15} className="spin" /> Starting</> : "Create preview"}
          </button>
        </div>
        <small>Preview environments use the nginx:alpine image in demo mode.</small>
      </form>

      {message && <p className="message">{message}</p>}

      <section className="previews">
        <div className="section-title">
          <div><p className="kicker">YOUR PROJECT</p><h2>Preview deployments</h2></div>
          <span>{deployments.length} {deployments.length === 1 ? "deployment" : "deployments"}</span>
        </div>
        {deployments.length === 0 ? <div className="empty"><h3>No preview deployments</h3><p>Create one above to get started.</p></div> : <div className="deployment-list">{deployments.map((deployment) => <DeploymentCard key={deployment._id} deployment={deployment} onDelete={removeDeployment} />)}</div>}
      </section>
    </main>
  );
}

function DeploymentCard({ deployment, onDelete }) {
  const [stats, setStats] = useState({ cpuPercent: 0, memoryUsage: 0 });

  useEffect(() => {
    if (deployment.status !== "running") return undefined;
    let active = true;
    async function refreshStats() {
      const response = await fetch(`${api}/deployments/${deployment._id}/stats`);
      if (response.ok && active) setStats(await response.json());
    }
    refreshStats();
    const timer = setInterval(refreshStats, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [deployment._id, deployment.status]);

  return (
    <article className="deployment-card">
      <div className="deployment-main">
        <div className="branch-name"><span className={`status-dot ${deployment.status}`} /><strong>{deployment.branchName}</strong></div>
        <span className={`status ${deployment.status}`}>{deployment.status}</span>
      </div>
      <a className="preview-url" href={deployment.previewUrl} target="_blank" rel="noreferrer">{deployment.previewUrl}<ExternalLink size={14} /></a>
      <div className="details">
        <span><small>CPU</small><strong>{stats.cpuPercent}%</strong></span>
        <span><small>Memory</small><strong>{formatBytes(stats.memoryUsage)}</strong></span>
        <span><small>Port</small><strong>{deployment.hostPort || "—"}</strong></span>
        <span className="container"><Terminal size={13} />{deployment.containerName}</span>
        <button onClick={() => onDelete(deployment._id)} title="Delete deployment"><Trash2 size={15} /></button>
      </div>
      {deployment.errorMessage && <p className="error">{deployment.errorMessage}</p>}
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);