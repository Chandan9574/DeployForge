import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExternalLink, RefreshCw, Trash2, Terminal, Box } from "lucide-react";
import "./styles.css";

const api = "/api";

function formatBytes(bytes = 0) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function App() {
  const [deployments, setDeployments] = useState([]);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDeployments() {
    const response = await fetch(`${api}/deployments`);
    setDeployments(await response.json());
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
    const response = await fetch(`${api}/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchName: branch.trim(), image: "nginx:alpine", containerPort: 80 })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.message);
      return;
    }
    setBranch("");
    setMessage("Preview is ready.");
    loadDeployments();
  }

  async function removeDeployment(id) {
    await fetch(`${api}/deployments/${id}`, { method: "DELETE" });
    loadDeployments();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D</span><div><strong>DeployForge</strong><small>Preview control room</small></div></div>
        <button className="icon-button" onClick={loadDeployments} title="Refresh"><RefreshCw size={18} /></button>
      </header>

      <section className="hero">
        <div><p className="eyebrow">SELF-HOSTED DEPLOYMENTS</p><h1>Every branch deserves<br /><span>a working preview.</span></h1><p className="intro">Build isolated containers, route them through Nginx, and share a live URL without leaving your terminal.</p></div>
        <form className="deploy-form" onSubmit={createDeployment}>
          <label>Deploy a branch</label>
          <div className="input-row"><input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="feature/your-branch" /><button disabled={loading}>{loading ? "Starting..." : "Create preview"}</button></div>
          <small>Demo mode uses the nginx:alpine image.</small>
        </form>
      </section>

      {message && <p className="message">{message}</p>}
      <section className="section-heading"><div><p className="eyebrow">LIVE ENVIRONMENTS</p><h2>Preview deployments</h2></div><span className="count">{deployments.length} total</span></section>

      <section className="deployment-grid">
        {deployments.length === 0 && <div className="empty"><Box size={30} /><p>No previews yet</p><small>Deploy a branch to see it here.</small></div>}
        {deployments.map((deployment) => <DeploymentCard key={deployment._id} deployment={deployment} onDelete={removeDeployment} />)}
      </section>
    </main>
  );
}

function DeploymentCard({ deployment, onDelete }) {
  const [stats, setStats] = useState({ cpuPercent: 0, memoryUsage: 0 });
  useEffect(() => {
    if (deployment.status !== "running") return undefined;
    let active = true;
    async function refresh() {
      const response = await fetch(`${api}/deployments/${deployment._id}/stats`);
      if (active) setStats(await response.json());
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [deployment._id, deployment.status]);

  return <article className="deployment-card">
    <div className="card-top"><div className="branch"><span className={`status-dot ${deployment.status}`} />{deployment.branchName}</div><span className={`status ${deployment.status}`}>{deployment.status}</span></div>
    <p className="url">{deployment.previewUrl}</p>
    <div className="metrics"><div><small>CPU</small><strong>{stats.cpuPercent}%</strong></div><div><small>Memory</small><strong>{formatBytes(stats.memoryUsage)}</strong></div><div><small>Port</small><strong>{deployment.hostPort}</strong></div></div>
    <div className="card-actions"><a href={deployment.previewUrl} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a><span><Terminal size={14} /> {deployment.containerName}</span><button onClick={() => onDelete(deployment._id)} title="Delete"><Trash2 size={15} /></button></div>
    {deployment.errorMessage && <p className="error">{deployment.errorMessage}</p>}
  </article>;
}

createRoot(document.getElementById("root")).render(<App />);
