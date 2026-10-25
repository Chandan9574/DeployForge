import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { 
  ExternalLink, Trash2, Box, MousePointer, Terminal, 
  GitBranch, Server, Cpu, HardDrive, Clock, Hash, 
  Play, Square, Activity, CheckCircle, RefreshCw, SquareTerminal
} from 'lucide-react';
import './styles.css';

const api = "/api"; 

// --- INTERACTIVE MOUSE TRACKER HOOK ---
function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const updateMousePosition = ev => setMousePosition({ x: ev.clientX, y: ev.clientY });
    window.addEventListener('mousemove', updateMousePosition);
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, []);
  return mousePosition;
}

// --- SPOTLIGHT HOVER CARD ---
function SpotlightCard({ children }) {
  const divRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div ref={divRef} onMouseMove={handleMouseMove} onMouseEnter={() => setOpacity(1)} onMouseLeave={() => setOpacity(0)} className="card spotlight-wrapper">
      <div className="spotlight-effect" style={{ opacity, WebkitMaskImage: `radial-gradient(250px circle at ${position.x}px ${position.y}px, black 15%, transparent 100%)` }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

// --- BACKGROUND PARTICLES ---
function BackgroundParticles() {
  const chars = ['d', 'f', '{', '}', '/', '*', 'dev', 'sys', 'up', 'run', '0', '1'];
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {[...Array(25)].map((_, i) => (
        <span key={i} className="particle" style={{ left: `${Math.random() * 100}%`, fontSize: `${Math.random() * 1.5 + 1}rem`, animationDuration: `${Math.random() * 25 + 15}s`, animationDelay: `-${Math.random() * 20}s` }}>
          {chars[Math.floor(Math.random() * chars.length)]}
        </span>
      ))}
    </div>
  );
}

// --- SCROLL ANIMATION ---
function ScrollReveal({ children, delay = 0 }) {
  const domRef = useRef();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        if (domRef.current) observer.unobserve(domRef.current);
      }
    }, { threshold: 0, rootMargin: "100px" }); 
    
    if (domRef.current) observer.observe(domRef.current);
    const fallback = setTimeout(() => setIsVisible(true), 100 + delay);
    
    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [delay]);

  return (
    <div ref={domRef} className={`reveal-up ${isVisible ? 'is-visible' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// --- HORIZONTAL TELEMETRY CARD ---
function TelemetryCard({ deployment, onDelete }) {
  const mockCommit = Math.random().toString(16).substr(2, 7);
  const mockCpu = (Math.random() * 3 + 0.1).toFixed(1);
  const mockRam = Math.floor(Math.random() * 200 + 50);
  const containerName = `preview-${deployment.projectName || 'app'}-${deployment.branchName.replace(/[^a-z0-9]/gi, '')}-${Date.now().toString().slice(-8)}`;

  return (
    <div className="wide-card">
      <div className="wc-header">
        <div className="wc-title">
          {deployment.branchName}
        </div>
        <div className="status-badge"><span className="live-dot"></span> LIVE</div>
      </div>
      
      <div className="wc-meta">
        <span><Hash size={12} style={{display:'inline', marginBottom:'-2px'}}/> {mockCommit}</span>
        <span>port {deployment.containerPort}</span>
        <span>Deployed 1.2s ago</span>
      </div>

      <a href={`http://${deployment.url}`} target="_blank" rel="noreferrer" className="wc-link">
        http://{deployment.url} <ExternalLink size={14} />
      </a>

      <div className="wc-metrics-row">
        <div className="metric-box">
          <div className="metric-label"><span>CPU</span> <span>{mockCpu}%</span></div>
          <div className="metric-bar"><div className="metric-fill" style={{width: `${mockCpu}%`}}></div></div>
        </div>
        <div className="metric-box">
          <div className="metric-label"><span>MEMORY</span> <span>{mockRam} MB</span></div>
          <div className="metric-bar"><div className="metric-fill" style={{width: `${(mockRam/512)*100}%`, background: '#3b82f6'}}></div></div>
        </div>
        <div className="metric-box" style={{justifyContent: 'center'}}>
          <div className="metric-label" style={{textTransform: 'none', color: '#aaa', fontSize:'0.7rem'}}>_ CONTAINER</div>
          <div style={{fontFamily: 'monospace', fontSize: '0.75rem', color: '#666', overflow:'hidden', textOverflow:'ellipsis'}}>{containerName}</div>
        </div>
      </div>
      
      <div className="wc-actions">
        <button className="action-btn"><SquareTerminal size={14} /> Logs</button>
        <button className="action-btn"><RefreshCw size={14} /> Redeploy</button>
        <button className="action-btn"><Square size={14} /> Stop</button>
        <button onClick={() => onDelete(deployment._id)} className="action-btn danger">
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}

// --- HOME PAGE ---
function Home() {
  const mouse = useMousePosition();
  const [deployments, setDeployments] = useState([]);
  
  // Wizard State
  const [step, setStep] = useState(1);
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDeployments() {
    try {
      const response = await fetch(`${api}/deployments`);
      const data = await response.json();
      setDeployments(data);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    loadDeployments();
    const timer = setInterval(loadDeployments, 5000);
    return () => clearInterval(timer);
  }, []);

  // Move to Step 2 when hitting Enter on URL
  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (repoUrl.trim()) {
      let autoName = "demo-app";
      if (repoUrl.includes("github.com/")) {
        autoName = repoUrl.split("github.com/")[1].split("/")[1] || "demo-app";
      }
      setProjectName(autoName);
      setBranch("main");
      setStep(2);
    }
  };

  // Final Deploy
  async function createDeployment(event) {
    event.preventDefault();
    if (!branch.trim()) return;
    setLoading(true);
    const loadingToast = toast.loading(`Building preview for ${branch}...`);

    try {
      const response = await fetch(`${api}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchName: branch.trim(), projectName: projectName, image: "nginx:alpine", containerPort: 80 })
      });
      const data = await response.json();
      setLoading(false);
      
      if (!response.ok) {
        toast.error(data.message || "Deployment failed", { id: loadingToast });
        return;
      }
      
      // Reset form on success
      setStep(1);
      setRepoUrl("");
      setProjectName("");
      setBranch("");
      
      toast.success("Preview generated successfully!", { id: loadingToast });
      loadDeployments();
    } catch (e) {
      setLoading(false);
      toast.error("Network error.", { id: loadingToast });
    }
  }

  async function removeDeployment(id) {
    try {
      await fetch(`${api}/deployments/${id}`, { method: "DELETE" });
      toast.success("Environment destroyed");
      loadDeployments();
    } catch (e) {
      toast.error("Failed to destroy");
    }
  }

  const offsetX = (mouse.x - window.innerWidth / 2) * -0.03;
  const offsetY = (mouse.y - window.innerHeight / 2) * -0.03;

  return (
    <>
      <section className="section dark-section" style={{ minHeight: '100vh', justifyContent: 'center' }}>
        <div className="bg-grid"></div>
        <BackgroundParticles />
        <div className="content-wrapper">
          
          <MousePointer size={72} strokeWidth={1} className="floating-element float-1" style={{ transform: `translate(${offsetX}px, ${offsetY}px) rotate(-15deg)` }}/>
          <Terminal size={60} strokeWidth={1} className="floating-element float-2" style={{ transform: `translate(${offsetX * -1.5}px, ${offsetY * -1.5}px) rotate(15deg)` }}/>
          <GitBranch size={48} strokeWidth={1} className="floating-element float-3" style={{ transform: `translate(${offsetX * 1.2}px, ${offsetY * 1.2}px) rotate(-5deg)` }}/>
          <Server size={52} strokeWidth={1} className="floating-element float-4" style={{ transform: `translate(${offsetX * -0.8}px, ${offsetY * -0.8}px) rotate(8deg)` }}/>
          
          <ScrollReveal>
            <h1 className="big-serif">
              Deploy like an <br/>
              <span style={{ fontStyle: 'italic', color: '#888' }}>engineer.</span>
            </h1>
          </ScrollReveal>
          
          <ScrollReveal delay={150}>
            <p className="subtitle">
              DeployForge is an instant staging platform made for speed. 
              Skip the YAML configs and launch isolated branches directly from your terminal.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <form onSubmit={step === 1 ? handleUrlSubmit : createDeployment} className="command-station" style={{ borderRadius: step === 2 ? '16px' : '99px' }}>
              <div className="input-row-primary">
                <GitBranch size={20} color="#888" style={{marginLeft: '0.5rem'}} />
                <input 
                  type="url" 
                  className="form-input-transparent"
                  placeholder="Paste GitHub Repository URL... (then press Enter)"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  disabled={loading}
                  required
                />
                {step === 1 && (
                  <button type="submit" className="btn-primary">Continue</button>
                )}
              </div>

              {/* STEP 2 REVEAL */}
              <div className={`step-2-container ${step === 2 ? 'open' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Project Name</label>
                    <input 
                      type="text" 
                      className="form-input-dark"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      required={step === 2}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target Branch</label>
                    <div style={{position: 'relative'}}>
                      <GitBranch size={16} color="#888" style={{position: 'absolute', left: '12px', top: '14px'}} />
                      <input 
                        type="text" 
                        className="form-input-dark"
                        style={{paddingLeft: '2.5rem'}}
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="feature/header"
                        required={step === 2}
                      />
                    </div>
                  </div>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{fontSize: '0.75rem', color: '#666'}}>Containers are fully isolated and resource-limited.</span>
                  <button type="submit" className="btn-primary" disabled={loading}>
                    <Play size={16} style={{display:'inline', marginBottom:'-3px', marginRight:'6px'}}/>
                    {loading ? "Deploying..." : "Launch Preview"}
                  </button>
                </div>
              </div>
            </form>
          </ScrollReveal>
        </div>
      </section>

      <section className="section light-section" style={{ minHeight: '80vh' }}>
        <div className="content-wrapper" style={{ maxWidth: '1200px' }}>
          <ScrollReveal>
            <h2 className="medium-serif" style={{ fontSize: '4.5rem', maxWidth: '800px', margin: '0 auto 1.5rem auto' }}>
              Plenty of tools are made for complex pipelines. <br/>
              <span style={{ fontStyle: 'italic', color: '#777' }}>That's not us.</span>
            </h2>
          </ScrollReveal>
          
          <ScrollReveal delay={200}>
            <p className="subtitle" style={{ color: '#555', marginBottom: '4rem' }}>
              DeployForge automatically handles Nginx reverse proxying and containerization so you can focus on writing code, not managing infrastructure.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={400}>
            <div className="telemetry-list">
              {deployments.length === 0 ? (
                <div style={{ padding: '6rem 2rem', border: '1px dashed #d1d1d1', borderRadius: '16px', textAlign: 'center', background: 'rgba(255,255,255,0.5)' }}>
                  <Box size={40} style={{ opacity: 0.2, margin: '0 auto 1.5rem auto' }} />
                  <p style={{ fontWeight: 500, fontSize: '1.2rem', fontFamily: 'var(--font-serif)' }}>No active environments</p>
                  <span style={{ fontSize: '0.9rem', color: '#888' }}>Provision a branch above to initialize the dashboard.</span>
                </div>
              ) : (
                deployments.map((dep) => (
                  <TelemetryCard key={dep._id} deployment={dep} onDelete={removeDeployment} />
                ))
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <footer className="footer dark-section">
        <div className="bg-grid" style={{ opacity: 0.5 }}></div>
        <BackgroundParticles />
        <div className="footer-grid">
          <ScrollReveal>
             <div className="brand" style={{ fontSize: '3rem', marginBottom: '2rem' }}>
              deploy<span style={{ fontStyle: 'italic', color: '#666' }}>forge</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', color: '#999', fontSize: '1.1rem' }}>
              <Link to="/features" style={{ color: '#999', textDecoration: 'none', transition: 'color 0.2s' }}>Features</Link>
              <Link to="/about" style={{ color: '#999', textDecoration: 'none', transition: 'color 0.2s' }}>About the Team</Link>
              <a href="#" style={{ color: '#999', textDecoration: 'none', transition: 'color 0.2s' }}>GitHub Repository</a>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
             <h3 className="medium-serif" style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>
              "More than any other tool, instant feedback has transformed software engineering."
             </h3>
             <p style={{ color: '#777', fontSize: '1.2rem', fontStyle: 'italic' }}>— Team Ephemeral Edge</p>
          </ScrollReveal>
        </div>
      </footer>
    </>
  );
}

// --- FEATURES PAGE (RESTORED) ---
function Features() {
  const [text, setText] = useState("");
  const fullText = "$ deployforge push feature-ui\n> Isolating Docker container...\n> Linking Nginx proxy...\n> SUCCESS! Environment live at proxy.deployforge.local";
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, index));
      index++;
      if (index > fullText.length) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="section dark-section" style={{ minHeight: '90vh' }}>
      <div className="bg-grid"></div>
      <BackgroundParticles />
      <div className="content-wrapper">
        <ScrollReveal>
          <h1 className="big-serif">
            Built for speed. <br/>
            <span style={{ fontStyle: 'italic', color: '#666' }}>Designed for teams.</span>
          </h1>
        </ScrollReveal>
        <ScrollReveal delay={200}>
          <p className="subtitle">
            DeployForge integrates seamlessly into your workflow with instant Nginx routing, 
            isolated Docker containers, and AI-powered quality checks.
          </p>
        </ScrollReveal>
        
        <ScrollReveal delay={400}>
          <div className="mock-terminal">
            <div className="terminal-header">
              <div className="term-dot dot-r"></div>
              <div className="term-dot dot-y"></div>
              <div className="term-dot dot-g"></div>
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
              <span style={{ color: '#fff' }}>{text}</span>
              <span className="cursor" style={{ animation: 'blink 1s step-end infinite' }}>_</span>
            </pre>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// --- ABOUT PAGE (RESTORED) ---
function About() {
  const team = [
    { name: "Aditya Raj", role: "NIT MZ" },
    { name: "Chandan Kumar", role: "NIT MZ" },
    { name: "Rahul Tudu", role: "NIT MZ" },
    { name: "Prince Patel", role: "NIT MZ" }
  ];

  return (
    <section className="section dark-section" style={{ minHeight: '90vh' }}>
      <div className="bg-grid"></div>
      <BackgroundParticles />
      <div className="content-wrapper">
        <ScrollReveal>
          <h1 className="big-serif" style={{ fontSize: '5rem' }}>
            Built by <br/>
            <span style={{ fontStyle: 'italic', color: '#888' }}>Team Ephemeral Edge.</span>
          </h1>
        </ScrollReveal>
        <ScrollReveal delay={200}>
          <p className="subtitle">
            Engineered during the Hackyard Build 2026 hackathon at IIT Guwahati. 
            DeployForge was created to eliminate deployment friction for developers.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={400}>
          <div className="deployment-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2rem', marginTop: '5rem' }}>
            {team.map((member, index) => (
              <SpotlightCard key={index}>
                <h3 style={{ fontSize: '1.4rem' }}>{member.name}</h3>
                <p style={{ fontSize: '0.9rem', color: '#888', fontFamily: 'var(--font-sans)', marginTop: '0.5rem' }}>{member.role}</p>
              </SpotlightCard>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// --- APP ROUTER (RESTORED) ---
function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: 'var(--font-sans)', borderRadius: '8px', background: '#222', color: '#fff' } }}/>
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand">
            deploy<span style={{ fontStyle: 'italic', color: '#888' }}>forge</span>
          </div>
        </Link>
        <nav className="nav-links">
          <Link to="/features">Features</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/features" element={<Features />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
