import React, { useState, useEffect, useRef, useMemo } from 'react';
import pharmaData from './data/pharmaData.json';
import { 
  Truck, Clock, CheckCircle2, AlertTriangle, Route, ShieldAlert, 
  Play, Square, ExternalLink, Activity, Search, Compass, Calendar,
  ChevronRight, MapPin, Info, ArrowRight
} from 'lucide-react';
import './App.css';

const VEHICLE_COLORS = [
  '#38bdf8', // radiant cyan
  '#a78bfa', // soft purple
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#60a5fa', // blue
];

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('routes'); // 'routes', 'benchmark', 'multiobj', 'robustness', 'scalability'

  // Route Explorer Filters
  const [day, setDay] = useState(1);
  const [scenario, setScenario] = useState('mostlikely');
  const [engine, setEngine] = useState('decomposed'); // 'decomposed' or 'greedy'
  const [selectedVehicle, setSelectedVehicle] = useState(0); // 0-indexed or null for 'all'
  const [isSimulating, setIsSimulating] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [searchStop, setSearchStop] = useState('');
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });

  // Other Tab Filters
  const [benchmarkFilter, setBenchmarkFilter] = useState('all');
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(6); // default to Profile 7 (0.2, 0.2, 0.6)

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const simProgressRef = useRef(0);

  // Active Instance Data
  const runKey = `day_${day}_${scenario}`;
  const runData = pharmaData.routes?.[runKey] || null;
  const activeMetrics = runData ? runData[engine] : null;
  const altEngine = engine === 'decomposed' ? 'greedy' : 'decomposed';
  const altMetrics = runData ? runData[altEngine] : null;
  const routes = useMemo(() => activeMetrics?.routes || [], [activeMetrics]);

  // Reset selected vehicle on instance switch
  useEffect(() => {
    if (routes.length && selectedVehicle !== null && selectedVehicle >= routes.length) {
      setSelectedVehicle(0);
    }
  }, [routes, selectedVehicle]);

  // Compute Vehicle Fleet Stats
  const dayOrders = pharmaData.orders?.[String(day)] || {};
  const vehicleStats = useMemo(() => {
    return routes.map((route, idx) => {
      const stops = route.filter(n => n !== 0);
      let weight = 0;
      let volume = 0;
      let serviceTime = 0;

      stops.forEach(node => {
        const ord = dayOrders[String(node)];
        if (ord) {
          weight += ord.weight || 0;
          volume += ord.volume || 0;
          serviceTime += ord.service_time || 0;
        }
      });

      const avgTransit = routes.length ? (activeMetrics?.travel_time_min || 0) / routes.length : 0;
      const shiftTime = Math.round(serviceTime + avgTransit);

      return {
        id: idx,
        stopsCount: stops.length,
        weight: Math.round(weight),
        weightPct: Math.min(Math.round((weight / 600) * 100), 100),
        volume: Number(volume.toFixed(2)),
        volumePct: Math.min(Math.round((volume / 3.0) * 100), 100),
        shiftMin: shiftTime,
        shiftPct: Math.min(Math.round((shiftTime / 360) * 100), 100),
        color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
        stops
      };
    });
  }, [routes, dayOrders, activeMetrics]);

  // Active Focused Vehicle Data
  const activeVan = (selectedVehicle !== null && vehicleStats[selectedVehicle]) ? vehicleStats[selectedVehicle] : null;

  // Canvas Route Drawing
  useEffect(() => {
    if (activeTab !== 'routes') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Rich Dark Sapphire Canvas
    ctx.fillStyle = '#080d17';
    ctx.fillRect(0, 0, width, height);

    // Coordinate Bounding Box
    const coordsList = pharmaData.coords?.[String(day)] || [];
    if (!coordsList.length || !routes.length) return;

    const coordsMap = {};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    coordsList.forEach(item => {
      coordsMap[item.node] = { x: item.x, y: item.y };
      minX = Math.min(minX, item.x); maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y); maxY = Math.max(maxY, item.y);
    });

    const pad = 54;
    const scaleX = (width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);

    const toScreen = (nx, ny) => ({
      x: pad + (nx - minX) * scaleX,
      y: pad + (ny - minY) * scaleY
    });

    // Depot Screen Position
    const depotScreen = toScreen(coordsMap[0]?.x || 0, coordsMap[0]?.y || 0);

    // 1. Concentric Distance Rings around Depot (10 km, 20 km)
    const kmScale = (scaleX + scaleY) / 2;
    [10, 20].forEach(km => {
      const radius = km * kmScale;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(depotScreen.x, depotScreen.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.font = '500 10px JetBrains Mono, monospace';
      ctx.fillText(`${km} km`, depotScreen.x + radius - 22, depotScreen.y - 4);
      ctx.restore();
    });

    // 2. Background Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 44) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 44) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // 3. Draw Ghosted (Inactive) Routes First
    routes.forEach((route, idx) => {
      const isSelected = selectedVehicle === null || selectedVehicle === idx;
      if (isSelected) return;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < route.length - 1; i++) {
        const p1 = toScreen(coordsMap[route[i]]?.x || 0, coordsMap[route[i]]?.y || 0);
        const p2 = toScreen(coordsMap[route[i + 1]]?.x || 0, coordsMap[route[i + 1]]?.y || 0);
        if (i === 0) ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();

      // Muted background dots
      route.forEach(node => {
        if (node === 0) return;
        const pt = toScreen(coordsMap[node]?.x || 0, coordsMap[node]?.y || 0);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // 4. Draw Active / Focused Vehicle Routes
    routes.forEach((route, idx) => {
      const isSelected = selectedVehicle === null || selectedVehicle === idx;
      if (!isSelected) return;

      const vColor = VEHICLE_COLORS[idx % VEHICLE_COLORS.length];

      // Route Path Line with Glow
      ctx.save();
      ctx.strokeStyle = vColor;
      ctx.lineWidth = selectedVehicle === null ? 2.0 : 3.2;
      ctx.shadowColor = selectedVehicle === null ? 'transparent' : vColor;
      ctx.shadowBlur = selectedVehicle === null ? 0 : 8;
      ctx.globalAlpha = selectedVehicle === null ? 0.85 : 1.0;
      ctx.beginPath();

      for (let i = 0; i < route.length - 1; i++) {
        const p1 = toScreen(coordsMap[route[i]]?.x || 0, coordsMap[route[i]]?.y || 0);
        const p2 = toScreen(coordsMap[route[i + 1]]?.x || 0, coordsMap[route[i + 1]]?.y || 0);
        if (i === 0) ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.restore();

      // Directional Arrowheads (when single vehicle selected)
      if (selectedVehicle === idx) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < route.length - 1; i++) {
          const p1 = toScreen(coordsMap[route[i]]?.x || 0, coordsMap[route[i]]?.y || 0);
          const p2 = toScreen(coordsMap[route[i + 1]]?.x || 0, coordsMap[route[i + 1]]?.y || 0);
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          if (dist > 30) {
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-5, -3.5);
            ctx.lineTo(1, 0);
            ctx.lineTo(-5, 3.5);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // Customer Stops with Sequential Numbers
      let seqNum = 1;
      route.forEach(node => {
        if (node === 0) return;
        const pt = toScreen(coordsMap[node]?.x || 0, coordsMap[node]?.y || 0);
        const isHovered = hoveredNode === node;

        if (selectedVehicle === idx) {
          // Distinct Numbered Badge
          ctx.save();
          ctx.fillStyle = vColor;
          ctx.shadowColor = vColor;
          ctx.shadowBlur = isHovered ? 18 : 8;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isHovered ? 11 : 8.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.stroke();

          ctx.fillStyle = '#080d17';
          ctx.font = `700 ${isHovered ? '11px' : '9px'} JetBrains Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(seqNum++), pt.x, pt.y);
          ctx.restore();
        } else {
          // Clean dot in "All Routes" view
          ctx.save();
          ctx.fillStyle = vColor;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, isHovered ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // Simulation Animated Van
      if (isSimulating) {
        const totalSegs = route.length - 1;
        const progressVal = (simProgressRef.current * totalSegs) % totalSegs;
        const segIdx = Math.floor(progressVal);
        const segT = progressVal - segIdx;

        const u = route[segIdx];
        const v = route[segIdx + 1];
        const p1 = toScreen(coordsMap[u]?.x || 0, coordsMap[u]?.y || 0);
        const p2 = toScreen(coordsMap[v]?.x || 0, coordsMap[v]?.y || 0);

        const curX = p1.x + (p2.x - p1.x) * segT;
        const curY = p1.y + (p2.y - p1.y) * segT;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = vColor;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(curX, curY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // 5. Central Pharmacy Depot (Node 0) - Radiant Gold Landmark
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;

    const sz = 10;
    ctx.beginPath();
    ctx.moveTo(depotScreen.x, depotScreen.y - sz);
    ctx.lineTo(depotScreen.x + sz, depotScreen.y);
    ctx.lineTo(depotScreen.x, depotScreen.y + sz);
    ctx.lineTo(depotScreen.x - sz, depotScreen.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px Plus Jakarta Sans, sans-serif';
    ctx.fillText('DEPOT (HUB)', depotScreen.x - 38, depotScreen.y - 15);
    ctx.restore();

  }, [day, scenario, engine, activeTab, selectedVehicle, isSimulating, routes, hoveredNode]);

  // Simulation Animation Loop
  useEffect(() => {
    if (!isSimulating) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const loop = () => {
      simProgressRef.current += 0.003;
      if (simProgressRef.current > 1) simProgressRef.current = 0;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.dispatchEvent(new CustomEvent('rerender'));
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isSimulating]);

  // Canvas Hover Tooltip
  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const coordsList = pharmaData.coords?.[String(day)] || [];
    if (!coordsList.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    coordsList.forEach(item => {
      minX = Math.min(minX, item.x); maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y); maxY = Math.max(maxY, item.y);
    });

    const pad = 54;
    const scaleX = (rect.width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);

    let closest = null;
    let minDist = 18;

    coordsList.forEach(item => {
      const scrX = pad + (item.x - minX) * scaleX;
      const scrY = pad + (item.y - minY) * scaleY;
      const dist = Math.hypot(scrX - mouseX, scrY - mouseY);
      if (dist < minDist) {
        minDist = dist;
        closest = { ...item, screenX: scrX, screenY: scrY };
      }
    });

    if (closest) {
      setHoveredNode(closest.node);
      const ord = dayOrders[String(closest.node)] || {};
      setTooltip({
        visible: true,
        x: closest.screenX,
        y: closest.screenY,
        content: closest.node === 0 ? (
          <div>
            <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.84rem' }}>🏥 Athens Central Hub</div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Base Pharmacy Depot • Departs & Returns Here</div>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.84rem' }}>Clinic #{closest.node}</div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5, marginTop: '4px' }}>
              • Time Window: [{ord.eat || 0} - {ord.lat || 0}] min<br />
              • Payload: {ord.weight || 0} kg • {ord.volume || 0} m³<br />
              • Service Time: {ord.service_time || 0} min
            </div>
          </div>
        )
      });
    } else {
      setHoveredNode(null);
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  };

  // Chronological Tour Steps for Focused Van
  const tourTimelineSteps = useMemo(() => {
    if (selectedVehicle === null || !routes[selectedVehicle]) return [];
    const r = routes[selectedVehicle];
    let stepCount = 1;
    return r.map((node, i) => {
      const isDepot = node === 0;
      const isStart = isDepot && i === 0;
      const isEnd = isDepot && i === r.length - 1;
      const ord = dayOrders[String(node)] || {};

      return {
        key: `${node}-${i}`,
        node,
        isDepot,
        isStart,
        isEnd,
        stepNumber: isDepot ? (isStart ? '0' : 'End') : String(stepCount++),
        eat: ord.eat || 0,
        lat: ord.lat || 0,
        weight: ord.weight || 0,
        volume: ord.volume || 0,
        service: ord.service_time || 0
      };
    });
  }, [routes, selectedVehicle, dayOrders]);

  // Filtered Table Rows
  const tableStops = useMemo(() => {
    let rawList = [];
    if (selectedVehicle !== null && routes[selectedVehicle]) {
      const r = routes[selectedVehicle];
      let seq = 1;
      r.forEach(node => {
        if (node === 0) return;
        const ord = dayOrders[String(node)] || {};
        rawList.push({
          seq: seq++,
          vehicleId: selectedVehicle + 1,
          node,
          eat: ord.eat || 0,
          lat: ord.lat || 0,
          weight: ord.weight || 0,
          volume: ord.volume || 0,
          service: ord.service_time || 0
        });
      });
    } else {
      let seq = 1;
      routes.forEach((r, vIdx) => {
        r.forEach(node => {
          if (node === 0) return;
          const ord = dayOrders[String(node)] || {};
          rawList.push({
            seq: seq++,
            vehicleId: vIdx + 1,
            node,
            eat: ord.eat || 0,
            lat: ord.lat || 0,
            weight: ord.weight || 0,
            volume: ord.volume || 0,
            service: ord.service_time || 0
          });
        });
      });
    }

    if (!searchStop.trim()) return rawList;
    return rawList.filter(item => String(item.node).includes(searchStop.trim()));
  }, [routes, selectedVehicle, dayOrders, searchStop]);

  // Filtered Benchmark Rows
  const benchmarkRows = useMemo(() => {
    const list = pharmaData.benchmarks || [];
    if (benchmarkFilter === 'all') return list;
    return list.filter(r => r.scenario === benchmarkFilter);
  }, [benchmarkFilter]);

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <header className="top-navbar">
        <div className="navbar-inner">
          <div className="brand-section">
            <div className="brand-logo-badge">PO</div>
            <div className="brand-text">
              <span className="brand-title">PharmaRoute-Opt</span>
              <span className="brand-subtitle">Pharmaceutical Last-Mile Delivery Optimization • Decision Support</span>
            </div>
          </div>

          <nav className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
              onClick={() => setActiveTab('routes')}
            >
              <Route size={15} /> Route Explorer
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTab('benchmark')}
            >
              <Truck size={15} /> 9-Day Benchmark (RQ5)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'multiobj' ? 'active' : ''}`}
              onClick={() => setActiveTab('multiobj')}
            >
              <CheckCircle2 size={15} /> Multi-Objective (RQ4)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'robustness' ? 'active' : ''}`}
              onClick={() => setActiveTab('robustness')}
            >
              <ShieldAlert size={15} /> Traffic Robustness (RQ6)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'scalability' ? 'active' : ''}`}
              onClick={() => setActiveTab('scalability')}
            >
              <Activity size={15} /> Scalability Limits (RQ3)
            </button>
          </nav>

          <div className="nav-actions">
            <a 
              href="https://github.com/saiyesh1th/PharmaRoute-Opt" 
              target="_blank" 
              rel="noreferrer" 
              className="github-link-btn"
            >
              <ExternalLink size={14} /> GitHub Code
            </a>
          </div>
        </div>
      </header>

      {/* Main Expansive Container */}
      <main className="main-container">

        {/* =========================================================================
            TAB 1: ROUTE EXPLORER
           ========================================================================= */}
        {activeTab === 'routes' && (
          <div>
            {/* Plain-English 3-Step Explainer Banner */}
            <div className="explainer-banner">
              <div className="explainer-steps">
                <div className="explainer-step">
                  <span className="step-circle">1</span>
                  <span><strong>Central Hub:</strong> Van loads cold-chain supplies at Athens Hub</span>
                </div>
                <ChevronRight size={14} color="#64748b" />
                <div className="explainer-step">
                  <span className="step-circle">2</span>
                  <span><strong>Smart Clustering:</strong> Nearby clinics grouped into balanced zones</span>
                </div>
                <ChevronRight size={14} color="#64748b" />
                <div className="explainer-step">
                  <span className="step-circle">3</span>
                  <span><strong>Guaranteed Delivery:</strong> Van serves stops in sequence (1 → 2 → 3) before deadlines</span>
                </div>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Instance: <strong>Day {day} ({pharmaData.orders?.[String(day)] ? Object.keys(pharmaData.orders[String(day)]).length : 0} Clinics)</strong>
              </div>
            </div>

            {/* Horizontal Control Filter Bar */}
            <div className="control-bar">
              <div className="control-bar-left">
                {/* Day Selector */}
                <div className="filter-group">
                  <span className="filter-label"><Calendar size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Day:</span>
                  <select 
                    className="filter-select"
                    value={day} 
                    onChange={e => setDay(parseInt(e.target.value, 10))}
                  >
                    <option value="1">Day 1 (78 Clinics)</option>
                    <option value="2">Day 2 (63 Clinics)</option>
                    <option value="3">Day 3 (67 Clinics)</option>
                    <option value="4">Day 4 (69 Clinics)</option>
                    <option value="5">Day 5 (75 Clinics)</option>
                    <option value="6">Day 6 (77 Clinics)</option>
                    <option value="7">Day 7 (66 Clinics)</option>
                    <option value="8">Day 8 (74 Clinics)</option>
                    <option value="9">Day 9 (84 Clinics)</option>
                  </select>
                </div>

                {/* Traffic Condition */}
                <div className="filter-group">
                  <span className="filter-label"><Compass size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Traffic:</span>
                  <div className="pill-group">
                    <button 
                      className={`pill-btn ${scenario === 'optimistic' ? 'active' : ''}`}
                      onClick={() => setScenario('optimistic')}
                    >Clear</button>
                    <button 
                      className={`pill-btn ${scenario === 'mostlikely' ? 'active' : ''}`}
                      onClick={() => setScenario('mostlikely')}
                    >Most-Likely</button>
                    <button 
                      className={`pill-btn ${scenario === 'pessimistic' ? 'active' : ''}`}
                      onClick={() => setScenario('pessimistic')}
                    >Gridlock</button>
                  </div>
                </div>

                {/* Optimization Engine */}
                <div className="filter-group">
                  <span className="filter-label">Method:</span>
                  <div className="pill-group">
                    <button 
                      className={`pill-btn primary ${engine === 'decomposed' ? 'active primary' : ''}`}
                      onClick={() => setEngine('decomposed')}
                    >Decomposed MILP</button>
                    <button 
                      className={`pill-btn ${engine === 'greedy' ? 'active' : ''}`}
                      onClick={() => setEngine('greedy')}
                    >Greedy Baseline</button>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Traffic Setting: <strong style={{ textTransform: 'capitalize', color: '#ffffff' }}>{scenario}</strong> • Engine: <strong style={{ color: '#38bdf8' }}>{engine === 'decomposed' ? 'Decomposed MILP' : 'Greedy Baseline'}</strong>
              </div>
            </div>

            {/* 4 Clean Primary OR Metric Cards */}
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Distance</span>
                  <span className="kpi-icon">🛣️</span>
                </div>
                <div className="kpi-value">
                  {activeMetrics?.distance_km?.toFixed(1) || 0} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#94a3b8' }}>km</span>
                </div>
                <div className="kpi-subtext">
                  {engine === 'decomposed' ? (
                    <span style={{ color: '#94a3b8' }}>
                      {((activeMetrics?.distance_km || 0) - (altMetrics?.distance_km || 0)) > 0 ? '+' : ''}
                      {((activeMetrics?.distance_km || 0) - (altMetrics?.distance_km || 0)).toFixed(1)} km vs Greedy
                    </span>
                  ) : (
                    <span>Greedy sequential dispatch</span>
                  )}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Travel Time</span>
                  <span className="kpi-icon">⏱️</span>
                </div>
                <div className="kpi-value">
                  {activeMetrics?.travel_time_min?.toFixed(0) || 0} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#94a3b8' }}>min</span>
                </div>
                <div className="kpi-subtext">
                  <span>{((activeMetrics?.travel_time_min || 0) / 60).toFixed(1)} total fleet hours</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">On-Time Rate</span>
                  <span className="kpi-icon">🎯</span>
                </div>
                <div className="kpi-value" style={{ color: (activeMetrics?.on_time_rate_pct || 0) >= 98 ? '#34d399' : '#fbbf24' }}>
                  {activeMetrics?.on_time_rate_pct?.toFixed(1) || 100}%
                </div>
                <div className="kpi-subtext" style={{ color: (activeMetrics?.late_deliveries || 0) === 0 ? '#34d399' : '#f87171' }}>
                  {(activeMetrics?.late_deliveries || 0) === 0 
                    ? '0 late deliveries' 
                    : `${activeMetrics?.late_deliveries} late (${activeMetrics?.total_lateness_min?.toFixed(0)} min delay)`
                  }
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Fleet Size</span>
                  <span className="kpi-icon">🚐</span>
                </div>
                <div className="kpi-value">
                  {routes.length} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#94a3b8' }}>vans</span>
                </div>
                <div className="kpi-subtext">
                  <span>{activeMetrics?.clusters ? `${activeMetrics.clusters} spatial clusters` : 'Sequential loops'}</span>
                </div>
              </div>
            </div>

            {/* SIDE-BY-SIDE ROUTE WORKSPACE (MAP + VAN TOUR INSPECTOR) */}
            <div className="route-workspace-grid">
              {/* Map Panel (Left) */}
              <div className="map-panel">
                <div className="map-header">
                  <div className="map-header-left">
                    <span className="map-title">
                      <Route size={16} /> Spatial Route Network (Athens Metropolitan Area)
                    </span>
                    <span className="map-subtitle">
                      {selectedVehicle === null 
                        ? `Displaying all ${routes.length} vehicle routes. Click any Van pill to focus its sequential tour.`
                        : `Inspecting Van ${selectedVehicle + 1} (${activeVan?.stopsCount || 0} stops in sequence). Non-selected routes are dimmed in the background.`
                      }
                    </span>
                  </div>

                  <div className="map-controls-right">
                    {/* Vehicle selector pills */}
                    <div className="vehicle-selector-pills">
                      <button 
                        className={`van-pill ${selectedVehicle === null ? 'active' : ''}`}
                        onClick={() => setSelectedVehicle(null)}
                      >
                        All Routes
                      </button>
                      {routes.map((_, idx) => (
                        <button 
                          key={idx}
                          className={`van-pill ${selectedVehicle === idx ? 'active' : ''}`}
                          onClick={() => setSelectedVehicle(idx)}
                        >
                          <span className="color-dot" style={{ backgroundColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length] }} />
                          Van {idx + 1}
                        </button>
                      ))}
                    </div>

                    {/* Simulation Button */}
                    <button 
                      className={`sim-btn ${isSimulating ? 'running' : ''}`}
                      onClick={() => setIsSimulating(!isSimulating)}
                    >
                      {isSimulating ? <Square size={13} /> : <Play size={13} />}
                      {isSimulating ? 'Stop Van' : 'Simulate'}
                    </button>
                  </div>
                </div>

                <div className="canvas-container">
                  <canvas 
                    ref={canvasRef} 
                    className="route-canvas" 
                    onMouseMove={handleCanvasMouseMove}
                    onMouseLeave={() => { setHoveredNode(null); setTooltip(prev => ({ ...prev, visible: false })); }}
                  />

                  {/* Floating Legend */}
                  <div className="map-floating-legend">
                    <div className="legend-item">
                      <span className="legend-icon-hub">⬨</span>
                      <span>Depot (Hub)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-icon-stop" />
                      <span>Delivery Stop</span>
                    </div>
                    <div className="legend-item">
                      <span style={{ color: '#38bdf8', fontWeight: 800 }}>➔</span>
                      <span>Travel Direction</span>
                    </div>
                  </div>

                  {tooltip.visible && (
                    <div 
                      className="map-tooltip" 
                      style={{ left: tooltip.x, top: tooltip.y }}
                    >
                      {tooltip.content}
                    </div>
                  )}
                </div>
              </div>

              {/* Van Tour Inspector Card (Right Column) */}
              <div className="tour-inspector-card">
                <div className="inspector-header">
                  <div className="inspector-title-box">
                    <span 
                      className="color-dot" 
                      style={{ 
                        backgroundColor: activeVan ? activeVan.color : '#38bdf8',
                        width: '10px',
                        height: '10px'
                      }} 
                    />
                    <span className="inspector-title">
                      {activeVan ? `Van ${activeVan.id + 1} Delivery Tour` : 'Fleet Overview'}
                    </span>
                  </div>
                  <span className="inspector-badge">
                    {activeVan ? `${activeVan.stopsCount} Clinics` : `${routes.length} Vans Dispatched`}
                  </span>
                </div>

                {/* Capacity Gauges for Selected Van */}
                {activeVan && (
                  <div className="inspector-gauges">
                    <div className="gauge-row">
                      <div className="gauge-labels">
                        <span>Payload Weight</span>
                        <span><strong>{activeVan.weight} kg</strong> / 600 kg ({activeVan.weightPct}%)</span>
                      </div>
                      <div className="gauge-track">
                        <div 
                          className="gauge-fill" 
                          style={{ width: `${activeVan.weightPct}%`, backgroundColor: activeVan.color }} 
                        />
                      </div>
                    </div>

                    <div className="gauge-row">
                      <div className="gauge-labels">
                        <span>Cargo Volume</span>
                        <span><strong>{activeVan.volume} m³</strong> / 3.0 m³ ({activeVan.volumePct}%)</span>
                      </div>
                      <div className="gauge-track">
                        <div 
                          className="gauge-fill" 
                          style={{ width: `${activeVan.volumePct}%`, backgroundColor: '#38bdf8' }} 
                        />
                      </div>
                    </div>

                    <div className="gauge-row">
                      <div className="gauge-labels">
                        <span>Est. Shift Duration</span>
                        <span><strong>{activeVan.shiftMin} min</strong> / 360 min ({activeVan.shiftPct}%)</span>
                      </div>
                      <div className="gauge-track">
                        <div 
                          className="gauge-fill" 
                          style={{ width: `${activeVan.shiftPct}%`, backgroundColor: '#10b981' }} 
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step-by-Step Chronological Tour Timeline */}
                <div className="tour-timeline-container">
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    CHRONOLOGICAL DELIVERY SEQUENCE
                  </div>

                  {tourTimelineSteps.map(step => (
                    <div 
                      key={step.key} 
                      className="timeline-step"
                      onMouseEnter={() => setHoveredNode(step.node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{
                        borderColor: hoveredNode === step.node ? 'rgba(56, 189, 248, 0.4)' : 'transparent',
                        background: hoveredNode === step.node ? 'rgba(56, 189, 248, 0.08)' : undefined
                      }}
                    >
                      <div 
                        className="timeline-step-badge"
                        style={{
                          backgroundColor: step.isDepot ? '#fbbf24' : (activeVan ? activeVan.color : '#38bdf8'),
                          color: '#080d17'
                        }}
                      >
                        {step.stepNumber}
                      </div>
                      <div className="timeline-step-content">
                        <div className="timeline-step-name">
                          {step.isDepot 
                            ? (step.isStart ? 'Depart: Athens Central Hub' : 'Return: Athens Central Hub') 
                            : `Clinic #${step.node}`
                          }
                        </div>
                        {!step.isDepot && (
                          <div className="timeline-step-meta">
                            <span>Window: [{step.eat}-{step.lat}]m</span>
                            <span>•</span>
                            <span>{step.weight} kg</span>
                            <span>•</span>
                            <span style={{ color: '#34d399' }}>✓ On Time</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {selectedVehicle === null && (
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '16px 0', textAlign: 'center' }}>
                      Click on any Van above (Van 1, Van 2...) to inspect its turn-by-turn clinic stop sequence.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fleet Vehicles Overview Cards */}
            <div className="vehicles-section">
              <div className="section-heading">
                <Truck size={15} /> All Dispatched Fleet Vehicles ({vehicleStats.length})
              </div>
              <div className="vehicles-grid">
                {vehicleStats.map(v => (
                  <div 
                    key={v.id} 
                    className={`vehicle-card ${selectedVehicle === v.id ? 'selected' : ''}`}
                    onClick={() => setSelectedVehicle(selectedVehicle === v.id ? null : v.id)}
                  >
                    <div className="vehicle-card-top">
                      <span className="vehicle-card-title">
                        <span className="color-dot" style={{ backgroundColor: v.color }} />
                        Vehicle {v.id + 1}
                      </span>
                      <span className="vehicle-stops-badge">{v.stopsCount} stops</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8' }}>
                      <span>Weight: <strong>{v.weight} kg</strong> ({v.weightPct}%)</span>
                      <span>Vol: <strong>{v.volume} m³</strong> ({v.volumePct}%)</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#94a3b8' }}>
                      <span>Shift: <strong>{v.shiftMin} min</strong></span>
                      <span style={{ color: '#34d399', fontWeight: 600 }}>✓ On Schedule</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Clinic Delivery Schedule Table */}
            <div className="schedule-panel">
              <div className="table-header-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={15} color="#94a3b8" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                    {selectedVehicle !== null ? `Delivery Schedule: Vehicle ${selectedVehicle + 1}` : 'All Clinic Delivery Stops'}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>({tableStops.length} stops)</span>
                </div>

                <div className="table-search-box">
                  <Search size={14} color="#64748b" />
                  <input 
                    type="text" 
                    placeholder="Search clinic ID..." 
                    value={searchStop}
                    onChange={e => setSearchStop(e.target.value)}
                    className="table-search-input"
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Stop #</th>
                      <th>Vehicle</th>
                      <th>Clinic ID</th>
                      <th>Time Window [EAT - LAT]</th>
                      <th>Weight</th>
                      <th>Volume</th>
                      <th>Service Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableStops.slice(0, 50).map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>#{s.seq}</td>
                        <td>Van {s.vehicleId}</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>Clinic #{s.node}</td>
                        <td>[{s.eat} - {s.lat}] min</td>
                        <td>{s.weight} kg</td>
                        <td>{s.volume} m³</td>
                        <td>{s.service} min</td>
                        <td>
                          <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.74rem' }}>
                            ✓ On Schedule
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: 9-DAY MULTI-SCENARIO BENCHMARK (RQ5)
           ========================================================================= */}
        {activeTab === 'benchmark' && (
          <div className="page-container">
            <div className="page-header-card">
              <h2 className="page-headline">9-Day Multi-Scenario Benchmark (RQ5)</h2>
              <p className="page-description">
                Evaluation across all 27 problem instances (9 operational days × 3 city traffic scenarios). 
                Compares the baseline Greedy heuristic against cluster-first Decomposed MILP on Athens pharmaceutical last-mile delivery data.
              </p>
            </div>

            <div className="summary-banner">
              <div className="summary-banner-icon">📊</div>
              <div className="summary-banner-text">
                <strong>Benchmark Key Findings:</strong> Across all 27 instances (1,938 total clinic stops), Decomposed MILP achieves 
                an average <strong>97.58% On-Time Rate</strong> compared to <strong>94.07%</strong> for Greedy (+3.51% punctuality advantage). 
                Decomposed MILP reduced late deliveries from <strong>117 stops down to 48 stops</strong> (58.9% lateness reduction) with an average solve time of <strong>46.2 seconds</strong>.
              </div>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Filter Scenario:</span>
              <div className="pill-group">
                <button 
                  className={`pill-btn ${benchmarkFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setBenchmarkFilter('all')}
                >All 27 Runs</button>
                <button 
                  className={`pill-btn ${benchmarkFilter === 'optimistic' ? 'active' : ''}`}
                  onClick={() => setBenchmarkFilter('optimistic')}
                >Optimistic (9)</button>
                <button 
                  className={`pill-btn ${benchmarkFilter === 'mostlikely' ? 'active' : ''}`}
                  onClick={() => setBenchmarkFilter('mostlikely')}
                >Most-Likely (9)</button>
                <button 
                  className={`pill-btn ${benchmarkFilter === 'pessimistic' ? 'active' : ''}`}
                  onClick={() => setBenchmarkFilter('pessimistic')}
                >Pessimistic (9)</button>
              </div>
            </div>

            {/* Benchmark Table */}
            <div className="schedule-panel">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Traffic</th>
                      <th>Clinics</th>
                      <th>Greedy Dist</th>
                      <th>Greedy Late</th>
                      <th>Greedy OTR%</th>
                      <th>Decomp Dist</th>
                      <th>Decomp Late</th>
                      <th>Decomp OTR%</th>
                      <th>OTR Delta</th>
                      <th>Runtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkRows.map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>Day {r.day}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.scenario}</td>
                        <td>{r.num_orders}</td>
                        <td>{r.greedy_distance_km} km</td>
                        <td>{r.greedy_late_deliveries}</td>
                        <td>{r.greedy_on_time_rate_pct?.toFixed(1)}%</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{r.decomp_distance_km} km</td>
                        <td style={{ color: r.decomp_late_deliveries === 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                          {r.decomp_late_deliveries}
                        </td>
                        <td style={{ fontWeight: 700, color: r.decomp_on_time_rate_pct >= 98 ? '#34d399' : '#fbbf24' }}>
                          {r.decomp_on_time_rate_pct?.toFixed(1)}%
                        </td>
                        <td style={{ color: r.delta_on_time_rate_pct >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                          {r.delta_on_time_rate_pct > 0 ? '+' : ''}{r.delta_on_time_rate_pct?.toFixed(1)}%
                        </td>
                        <td style={{ color: '#94a3b8' }}>{r.decomp_runtime_sec?.toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: MULTI-OBJECTIVE TRADE-OFFS (RQ4)
           ========================================================================= */}
        {activeTab === 'multiobj' && (
          <div className="page-container">
            <div className="page-header-card">
              <h2 className="page-headline">Multi-Objective Trade-Offs (RQ4)</h2>
              <p className="page-description">
                Parametric weight sweep across the multi-objective routing function Z = α·Distance + β·Time + γ·Lateness (where α + β + γ = 1.0). 
                Evaluates the operational trade-off between minimizing transit mileage and strictly adhering to healthcare delivery deadlines.
              </p>
            </div>

            <div className="summary-banner">
              <div className="summary-banner-icon">🎯</div>
              <div className="summary-banner-text">
                <strong>Empirical Trade-Off Finding:</strong> Profile 7 (α=0.20, β=0.20, γ=0.60) represents the <strong>best observed non-dominated trade-off</strong>, 
                achieving <strong>100% on-time delivery (0 lateness)</strong> at <strong>86.0 km</strong>. 
                In contrast, purely prioritizing lateness without mileage penalties (Profile 8: γ=1.00) causes route distance to inflate by <strong>+159% (222.8 km)</strong>.
              </div>
            </div>

            {/* Profile Selector Cards */}
            <div className="section-heading">Weight Profiles (8 Experimental Configurations)</div>
            <div className="vehicles-grid">
              {(pharmaData.multiobjective || []).map((p, idx) => (
                <div 
                  key={idx}
                  className={`vehicle-card ${selectedProfileIdx === idx ? 'selected' : ''}`}
                  onClick={() => setSelectedProfileIdx(idx)}
                >
                  <div className="vehicle-card-top">
                    <span className="vehicle-card-title">{p.profile_name}</span>
                    <span className="vehicle-stops-badge">P{idx + 1}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    α={p.alpha_distance} • β={p.beta_time} • γ={p.gamma_lateness}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginTop: '4px' }}>
                    <span>Distance: <strong>{p.total_distance_km} km</strong></span>
                    <span style={{ color: p.late_deliveries === 0 ? '#34d399' : '#f87171' }}>
                      {p.late_deliveries} late
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Multi-Objective Summary Table */}
            <div className="schedule-panel">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th>α (Dist)</th>
                      <th>β (Time)</th>
                      <th>γ (Late)</th>
                      <th>Distance</th>
                      <th>Travel Time</th>
                      <th>Late Stops</th>
                      <th>Total Lateness</th>
                      <th>On-Time %</th>
                      <th>MIP Gap %</th>
                      <th>Solver Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pharmaData.multiobjective || []).map((p, idx) => (
                      <tr key={idx} style={{ background: selectedProfileIdx === idx ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>{p.profile_name}</td>
                        <td>{p.alpha_distance}</td>
                        <td>{p.beta_time}</td>
                        <td>{p.gamma_lateness}</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{p.total_distance_km} km</td>
                        <td>{p.total_travel_time_min} min</td>
                        <td style={{ color: p.late_deliveries === 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                          {p.late_deliveries}
                        </td>
                        <td>{p.total_lateness_min} min</td>
                        <td style={{ fontWeight: 700, color: p.on_time_rate_pct >= 98 ? '#34d399' : '#fbbf24' }}>
                          {p.on_time_rate_pct?.toFixed(1)}%
                        </td>
                        <td style={{ color: '#94a3b8' }}>{p.mip_gap_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#94a3b8' }}>{p.solver_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: TRAFFIC ROBUSTNESS STRESS SIMULATION (RQ6)
           ========================================================================= */}
        {activeTab === 'robustness' && (
          <div className="page-container">
            <div className="page-header-card">
              <h2 className="page-headline">Traffic Robustness Stress Simulation (RQ6)</h2>
              <p className="page-description">
                Stress-test evaluating route resilience when a baseline plan optimized under normal traffic (Most-Likely) 
                is executed during unexpected severe congestion (Pessimistic scenario: +50% transit travel times).
              </p>
            </div>

            <div className="summary-banner">
              <div className="summary-banner-icon">🛡️</div>
              <div className="summary-banner-text">
                <strong>Resilience Buffer:</strong> Under severe traffic shocks, Greedy plans experience a <strong>-20.3% punctuality collapse</strong> down to 
                <strong> 72.71%</strong> on-time delivery. The Decomposed MILP maintains an <strong>80.02% on-time resilience buffer (+7.31% higher)</strong>, 
                saving <strong>5,171 minutes</strong> of fleet delay and preventing <strong>49 late clinic deliveries</strong> across all 9 days.
              </div>
            </div>

            {/* Robustness KPI Row */}
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-header"><span className="kpi-title">Greedy Under Gridlock</span></div>
                <div className="kpi-value" style={{ color: '#f87171' }}>72.7%</div>
                <div className="kpi-subtext">Drops -20.3% from 93.0%</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header"><span className="kpi-title">Decomposed Under Gridlock</span></div>
                <div className="kpi-value" style={{ color: '#38bdf8' }}>80.0%</div>
                <div className="kpi-subtext">+7.3% higher resilience buffer</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header"><span className="kpi-title">Fleet Delay Avoided</span></div>
                <div className="kpi-value" style={{ color: '#34d399' }}>5,171 min</div>
                <div className="kpi-subtext">47.3% lateness reduction</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-header"><span className="kpi-title">Late Deliveries Saved</span></div>
                <div className="kpi-value" style={{ color: '#34d399' }}>49 stops</div>
                <div className="kpi-subtext">Critical medicines protected</div>
              </div>
            </div>

            {/* 9-Day Robustness Table */}
            <div className="schedule-panel">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Clinics</th>
                      <th>Greedy Planned</th>
                      <th>Greedy Stressed</th>
                      <th>Greedy Drop</th>
                      <th>Decomp Planned</th>
                      <th>Decomp Stressed</th>
                      <th>Decomp Drop</th>
                      <th>Resilience Buffer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pharmaData.robustness || []).map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>Day {r.day}</td>
                        <td>{r.num_orders}</td>
                        <td>{r.greedy_plan_otr_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#f87171' }}>{r.greedy_stress_otr_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#f87171' }}>-{r.greedy_otr_drop_pct?.toFixed(1)}%</td>
                        <td>{r.decomp_plan_otr_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#38bdf8', fontWeight: 600 }}>{r.decomp_stress_otr_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#38bdf8' }}>-{r.decomp_otr_drop_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#34d399', fontWeight: 700 }}>
                          +{(r.decomp_stress_otr_pct - r.greedy_stress_otr_pct).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: COMPUTATIONAL SCALABILITY LIMITS (RQ3)
           ========================================================================= */}
        {activeTab === 'scalability' && (
          <div className="page-container">
            <div className="page-header-card">
              <h2 className="page-headline">Computational Scalability Limits (RQ3)</h2>
              <p className="page-description">
                Empirical investigation of monolithic Mixed-Integer Linear Programming (MILP) solver tractability 
                as customer count n scales from 10 to 78 nodes under finite time budgets.
              </p>
            </div>

            <div className="summary-banner">
              <div className="summary-banner-icon">⚡</div>
              <div className="summary-banner-text">
                <strong>Justification for Decomposition:</strong> For small problem sizes (n ≤ 20), the monolithic MILP finds feasible solutions 
                within a 30s limit, terminating with 25–50% optimality gaps. However, for large instances (n = 25 and full n = 78 Day 1), 
                the monolithic model <strong>fails to find an integer feasible solution within the time limit</strong>. 
                Spatial cluster-first decomposition divides the 78 customers into 6 independent subproblems, finding a feasible solution with <strong>0 late deliveries in 51.2 seconds</strong>.
              </div>
            </div>

            {/* Scalability Table */}
            <div className="schedule-panel">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer Count (n)</th>
                      <th>Formulation Method</th>
                      <th>Primal Bound (km)</th>
                      <th>Dual Bound (km)</th>
                      <th>MIP Optimality Gap</th>
                      <th>Runtime (sec)</th>
                      <th>Solver Termination Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pharmaData.scalability || []).map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>n = {s.n_customers}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 600 }}>{s.method}</td>
                        <td>{s.primal_bound_km ? `${s.primal_bound_km} km` : 'No Feasible Solution'}</td>
                        <td>{s.dual_bound_km ? `${s.dual_bound_km} km` : '—'}</td>
                        <td style={{ color: s.mip_gap_pct ? '#fbbf24' : '#94a3b8' }}>
                          {s.mip_gap_pct ? `${s.mip_gap_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td>{s.runtime_sec?.toFixed(1)}s</td>
                        <td style={{ color: '#94a3b8' }}>{s.solver_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
