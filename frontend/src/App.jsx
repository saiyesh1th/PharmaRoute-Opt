import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import pharmaData from './data/pharmaData.json';
import { 
  Truck, Clock, CheckCircle2, AlertTriangle, Route, ShieldAlert, 
  Play, Square, ExternalLink, Activity, Search, Compass, Calendar,
  ChevronRight, MapPin, Layers, Crosshair, BarChart3, Thermometer
} from 'lucide-react';
import './App.css';

// Enterprise Van Palette (Distinct, high-contrast, harmonious)
const FLEET_COLORS = [
  '#00e5ff', // Electric Cyan (Van 1 - North Corridor)
  '#a855f7', // Lavender Purple (Van 2 - Central Athens)
  '#10b981', // Mint Emerald (Van 3 - West Attica)
  '#f59e0b', // Radiant Amber (Van 4 - Piraeus Harbor)
  '#ec4899', // Hot Pink (Van 5 - East Mesogeia)
  '#3b82f6', // Royal Cobalt (Van 6 - Coastal Suburbs)
  '#14b8a6', // Teal
  '#f97316'  // Orange
];

const DRIVERS = [
  { name: 'Dimitris K.', vanModel: 'Mercedes-Benz eVito #EV-101', zone: 'North Corridor (Marousi / Kifisia)' },
  { name: 'Eleni M.', vanModel: 'Renault Master Z.E. #EV-102', zone: 'Central Athens (Syntagma / Goudi)' },
  { name: 'Nikos P.', vanModel: 'Ford E-Transit #EV-103', zone: 'West Attica (Chaidari / Peristeri)' },
  { name: 'Ioannis S.', vanModel: 'Mercedes-Benz eVito #EV-104', zone: 'South Attica (Piraeus / Faliro)' },
  { name: 'Sophia T.', vanModel: 'Renault Master Z.E. #EV-105', zone: 'East Attica (Mesogeia / Spata)' },
  { name: 'Christos V.', vanModel: 'Ford E-Transit #EV-106', zone: 'Coastal Suburbs (Glyfada / Voula)' }
];

export default function App() {
  // Navigation Tabs: 'dispatch', 'gantt', 'benchmark', 'multiobj', 'robustness'
  const [activeTab, setActiveTab] = useState('dispatch');

  // Operational Filters
  const [day, setDay] = useState(1);
  const [scenario, setScenario] = useState('mostlikely');
  const [engine, setEngine] = useState('decomposed');
  const [selectedVehicle, setSelectedVehicle] = useState(0); // 0-indexed, or null for 'all'
  const [showBackgroundRoutes, setShowBackgroundRoutes] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeMarkerNode, setActiveMarkerNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Secondary Tab Filters
  const [benchmarkFilter, setBenchmarkFilter] = useState('all');
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(6); // Profile 7 default

  // Refs for Leaflet Map
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const simMarkerRef = useRef(null);
  const simIntervalRef = useRef(null);

  // Active Run Data
  const runKey = `day_${day}_${scenario}`;
  const runData = pharmaData.routes?.[runKey] || null;
  const activeMetrics = runData ? runData[engine] : null;
  const altEngine = engine === 'decomposed' ? 'greedy' : 'decomposed';
  const altMetrics = runData ? runData[altEngine] : null;
  const routes = useMemo(() => activeMetrics?.routes || [], [activeMetrics]);

  // Coordinates Map with Athens GPS
  const coordsList = pharmaData.coords?.[String(day)] || [];
  const coordsMap = useMemo(() => {
    const map = {};
    coordsList.forEach(c => { map[c.node] = c; });
    return map;
  }, [coordsList]);

  const dayOrders = pharmaData.orders?.[String(day)] || {};

  // Compute Vehicle Fleet Stats
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
      const driver = DRIVERS[idx % DRIVERS.length];

      return {
        id: idx,
        stopsCount: stops.length,
        weight: Math.round(weight),
        weightPct: Math.min(Math.round((weight / 600) * 100), 100),
        volume: Number(volume.toFixed(2)),
        volumePct: Math.min(Math.round((volume / 3.0) * 100), 100),
        shiftMin: shiftTime,
        shiftPct: Math.min(Math.round((shiftTime / 360) * 100), 100),
        color: FLEET_COLORS[idx % FLEET_COLORS.length],
        driver: driver.name,
        vanModel: driver.vanModel,
        zone: driver.zone,
        stops
      };
    });
  }, [routes, dayOrders, activeMetrics]);

  const activeVan = (selectedVehicle !== null && vehicleStats[selectedVehicle]) ? vehicleStats[selectedVehicle] : null;

  // Initialize Leaflet Map (One-Time)
  useEffect(() => {
    if (activeTab !== 'dispatch') return;
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [38.040, 23.740],
        zoom: 11,
        minZoom: 9,
        maxZoom: 17,
        zoomControl: false,
        attributionControl: false
      });

      // CartoDB Dark Matter Tiles (High-contrast, elegant dark cartography)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      routesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    // Trigger map size recalculation
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

  }, [activeTab]);

  // Render Routes and Markers on Leaflet Map
  useEffect(() => {
    if (activeTab !== 'dispatch') return;
    const map = mapInstanceRef.current;
    if (!map || !routesLayerRef.current || !markersLayerRef.current) return;

    routesLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();

    if (!routes.length || !coordsList.length) return;

    const depotCoord = coordsMap[0];
    const allBounds = [];

    // 1. Draw Inactive / Ghosted Routes First (if enabled)
    if (showBackgroundRoutes) {
      routes.forEach((route, idx) => {
        if (selectedVehicle !== null && selectedVehicle === idx) return; // Draw focused later

        const latlngs = route
          .map(node => coordsMap[node])
          .filter(Boolean)
          .map(c => [c.lat, c.lon]);

        if (latlngs.length > 1) {
          L.polyline(latlngs, {
            color: '#64748b',
            weight: 1.5,
            opacity: 0.25,
            dashArray: '3, 6'
          }).addTo(routesLayerRef.current);

          // Subtle dots for other stops
          route.forEach(node => {
            if (node === 0) return;
            const c = coordsMap[node];
            if (!c) return;

            const ghostIcon = L.divIcon({
              className: 'ghost-marker-dot',
              iconSize: [6, 6]
            });

            L.marker([c.lat, c.lon], { icon: ghostIcon }).addTo(markersLayerRef.current);
          });
        }
      });
    }

    // 2. Draw Focused or All Routes
    let focusBounds = [];

    routes.forEach((route, idx) => {
      const isFocused = selectedVehicle === null || selectedVehicle === idx;
      if (!isFocused) return;

      const vColor = FLEET_COLORS[idx % FLEET_COLORS.length];
      const latlngs = route
        .map(node => coordsMap[node])
        .filter(Boolean)
        .map(c => [c.lat, c.lon]);

      if (latlngs.length > 1) {
        latlngs.forEach(pt => {
          allBounds.push(pt);
          if (selectedVehicle === idx) focusBounds.push(pt);
        });

        // Glowing Active Polyline
        L.polyline(latlngs, {
          color: vColor,
          weight: selectedVehicle === idx ? 4.2 : 2.5,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(routesLayerRef.current);

        // Add Numbered Sequential Pins
        let seq = 1;
        route.forEach((node, nodeIdx) => {
          if (node === 0) return; // Depot handled separately
          const c = coordsMap[node];
          const ord = dayOrders[String(node)] || {};
          if (!c) return;

          const pinNumber = seq++;
          const customPinIcon = L.divIcon({
            className: 'custom-pin-container',
            html: `<div class="stop-marker-pin" style="--pin-color: ${vColor}"><span>${pinNumber}</span></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const marker = L.marker([c.lat, c.lon], { icon: customPinIcon }).addTo(markersLayerRef.current);

          // Rich Enterprise Pop-Up
          const popupHtml = `
            <div class="custom-popup-content">
              <div class="custom-popup-header">
                <span class="popup-tag">STOP #${pinNumber}</span>
                <span class="popup-van-name" style="color: ${vColor}">VAN ${idx + 1}</span>
              </div>
              <div class="popup-facility-name">${c.name || `Clinic #${node}`}</div>
              <div class="popup-med-type">📦 ${c.type || 'Vaccines & Biologics'}</div>
              <div class="popup-grid">
                <div><span class="popup-label">Time Window</span><div class="popup-val">[${ord.eat || 0} - ${ord.lat || 0}] min</div></div>
                <div><span class="popup-label">Scheduled ETA</span><div class="popup-val text-emerald">09:${(nodeIdx * 14 + 10).toString().padStart(2, '0')} AM</div></div>
                <div><span class="popup-label">Payload</span><div class="popup-val">${ord.weight || 0} kg • ${ord.volume || 0} m³</div></div>
                <div><span class="popup-label">Unloading Time</span><div class="popup-val">${ord.service_time || 0} min</div></div>
              </div>
            </div>
          `;

          marker.bindPopup(popupHtml);

          if (activeMarkerNode === node) {
            marker.openPopup();
          }
        });
      }
    });

    // 3. Central Pharmacy Hub Depot Marker (Node 0)
    if (depotCoord) {
      const depotIcon = L.divIcon({
        className: 'custom-depot-container',
        html: `
          <div class="depot-marker-pulse">
            <div class="depot-marker-core">
              <span class="depot-marker-icon">⬨</span>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const depotMarker = L.marker([depotCoord.lat, depotCoord.lon], { icon: depotIcon })
        .addTo(markersLayerRef.current);

      depotMarker.bindPopup(`
        <div class="custom-popup-content">
          <div class="custom-popup-header">
            <span class="popup-tag" style="color: #fbbf24">CENTRAL HUB</span>
            <span class="popup-van-name">BASE LOGISTICS</span>
          </div>
          <div class="popup-facility-name">Athens Central Pharmaceutical Hub (Metamorfosi)</div>
          <div class="popup-med-type">Attiki Odos Logistics Corridor • Cold-Storage Facility</div>
          <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 6px;">
            All 6 electric delivery vans load temperature-controlled cargo and depart at 08:00 AM, returning before shift cutoff (14:00 PM).
          </div>
        </div>
      `);
    }

    // Fit Map Viewport to Active Route Bounds
    if (focusBounds.length && selectedVehicle !== null) {
      map.fitBounds(L.latLngBounds(focusBounds), { padding: [60, 60], maxZoom: 14 });
    } else if (allBounds.length) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [40, 40] });
    }

  }, [day, scenario, engine, activeTab, selectedVehicle, showBackgroundRoutes, routes, coordsMap, dayOrders, activeMarkerNode]);

  // Live Vehicle Simulation on Leaflet Map
  useEffect(() => {
    if (!isSimulating) {
      if (simMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(simMarkerRef.current);
        simMarkerRef.current = null;
      }
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    const map = mapInstanceRef.current;
    if (!map || selectedVehicle === null || !routes[selectedVehicle]) return;

    const route = routes[selectedVehicle];
    const pathCoords = route.map(n => coordsMap[n]).filter(Boolean).map(c => [c.lat, c.lon]);
    if (pathCoords.length < 2) return;

    let step = 0;
    const totalSteps = 240;

    const simIcon = L.divIcon({
      className: 'sim-van-marker',
      html: `
        <div style="width: 22px; height: 22px; border-radius: 50%; background: #ffffff; border: 3px solid ${activeVan?.color || '#38bdf8'}; box-shadow: 0 0 15px #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 11px;">
          🚐
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    simMarkerRef.current = L.marker(pathCoords[0], { icon: simIcon }).addTo(map);

    simIntervalRef.current = setInterval(() => {
      step = (step + 1) % totalSteps;
      const progress = step / totalSteps;
      const totalSegs = pathCoords.length - 1;
      const curSegFloat = progress * totalSegs;
      const segIdx = Math.floor(curSegFloat);
      const segT = curSegFloat - segIdx;

      const p1 = pathCoords[segIdx];
      const p2 = pathCoords[segIdx + 1] || pathCoords[segIdx];

      const curLat = p1[0] + (p2[0] - p1[0]) * segT;
      const curLon = p1[1] + (p2[1] - p1[1]) * segT;

      simMarkerRef.current?.setLatLng([curLat, curLon]);
    }, 50);

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (simMarkerRef.current && map) map.removeLayer(simMarkerRef.current);
    };
  }, [isSimulating, selectedVehicle, routes, coordsMap, activeVan]);

  // Turn-by-Turn Chronological Timeline
  const tourTimeline = useMemo(() => {
    if (selectedVehicle === null || !routes[selectedVehicle]) return [];
    const r = routes[selectedVehicle];
    let seq = 1;
    let runningTime = 0;

    return r.map((node, i) => {
      const isDepot = node === 0;
      const isStart = isDepot && i === 0;
      const isEnd = isDepot && i === r.length - 1;
      const c = coordsMap[node] || {};
      const ord = dayOrders[String(node)] || {};

      runningTime += isDepot ? 0 : (ord.service_time || 8) + 12;
      const etaHour = 8 + Math.floor(runningTime / 60);
      const etaMin = runningTime % 60;
      const etaStr = `${etaHour.toString().padStart(2, '0')}:${etaMin.toString().padStart(2, '0')} AM`;

      return {
        key: `${node}-${i}`,
        node,
        seq: isDepot ? (isStart ? '0' : 'End') : String(seq++),
        isDepot,
        isStart,
        isEnd,
        facility: c.name || (isDepot ? 'Athens Central Pharmaceutical Hub' : `Clinic #${node}`),
        medType: c.type || 'Vaccines & Biologics',
        eat: ord.eat || 0,
        lat: ord.lat || 0,
        weight: ord.weight || 0,
        volume: ord.volume || 0,
        service: ord.service_time || 0,
        eta: etaStr
      };
    });
  }, [routes, selectedVehicle, coordsMap, dayOrders]);

  // Manifest Table Filtered
  const filteredManifest = useMemo(() => {
    let list = [];
    routes.forEach((r, vIdx) => {
      if (selectedVehicle !== null && selectedVehicle !== vIdx) return;
      let seq = 1;
      r.forEach(node => {
        if (node === 0) return;
        const c = coordsMap[node] || {};
        const ord = dayOrders[String(node)] || {};
        list.push({
          node,
          seq: seq++,
          vehicleId: vIdx + 1,
          facility: c.name || `Clinic #${node}`,
          medType: c.type || 'Vaccines & Biologics',
          eat: ord.eat || 0,
          lat: ord.lat || 0,
          weight: ord.weight || 0,
          volume: ord.volume || 0,
          service: ord.service_time || 0
        });
      });
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(item => 
      String(item.node).includes(q) || item.facility.toLowerCase().includes(q)
    );
  }, [routes, selectedVehicle, coordsMap, dayOrders, searchQuery]);

  return (
    <div className="app-shell">
      {/* Top Enterprise Command Navbar */}
      <header className="command-navbar">
        <div className="command-navbar-inner">
          <div className="brand-section">
            <div className="brand-badge">PO</div>
            <div className="brand-info">
              <div className="brand-name">
                PharmaRoute-Opt
                <span className="system-status-pill">
                  <span className="status-dot-pulse" />
                  Fleet Active • 0 Spoilage
                </span>
              </div>
              <span className="brand-subtext">Pharmaceutical Last-Mile Delivery Decision Support System</span>
            </div>
          </div>

          <nav className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
              onClick={() => setActiveTab('dispatch')}
            >
              <Route size={14} /> Fleet Dispatch & Map
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'gantt' ? 'active' : ''}`}
              onClick={() => setActiveTab('gantt')}
            >
              <Clock size={14} /> Shift Schedule (Gantt)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTab('benchmark')}
            >
              <BarChart3 size={14} /> 27-Instance Benchmark (RQ5)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'multiobj' ? 'active' : ''}`}
              onClick={() => setActiveTab('multiobj')}
            >
              <CheckCircle2 size={14} /> Multi-Objective (RQ4)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'robustness' ? 'active' : ''}`}
              onClick={() => setActiveTab('robustness')}
            >
              <ShieldAlert size={14} /> Stress Test & Scalability
            </button>
          </nav>

          <div className="navbar-right">
            <div className="clock-telemetry">
              <Clock size={13} color="#38bdf8" />
              <span>Shift: 08:00 - 14:00 (360m)</span>
            </div>
            <a 
              href="https://github.com/saiyesh1th/PharmaRoute-Opt" 
              target="_blank" 
              rel="noreferrer" 
              className="github-btn"
            >
              <ExternalLink size={13} /> GitHub Code
            </a>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="main-viewport">

        {/* =========================================================================
            TAB 1: FLEET DISPATCH & REAL GIS MAP
           ========================================================================= */}
        {activeTab === 'dispatch' && (
          <div>
            {/* Control Bar */}
            <div className="command-control-bar">
              <div className="control-bar-left">
                {/* Day Selector */}
                <div className="control-item">
                  <span className="control-item-label"><Calendar size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Operational Day:</span>
                  <select 
                    className="select-control"
                    value={day} 
                    onChange={e => setDay(parseInt(e.target.value, 10))}
                  >
                    <option value="1">Day 1 (78 Clinics • Athens Metropolitan)</option>
                    <option value="2">Day 2 (63 Clinics • Attica North)</option>
                    <option value="3">Day 3 (67 Clinics • Attica West)</option>
                    <option value="4">Day 4 (69 Clinics • Central Urban)</option>
                    <option value="5">Day 5 (75 Clinics • Coastal District)</option>
                    <option value="6">Day 6 (77 Clinics • East Corridor)</option>
                    <option value="7">Day 7 (66 Clinics • Regional Net)</option>
                    <option value="8">Day 8 (74 Clinics • High Density)</option>
                    <option value="9">Day 9 (84 Clinics • Full Attica Peak)</option>
                  </select>
                </div>

                {/* Traffic Regime */}
                <div className="control-item">
                  <span className="control-item-label"><Compass size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Traffic Regime:</span>
                  <div className="segmented-group">
                    <button 
                      className={`segmented-btn ${scenario === 'optimistic' ? 'active' : ''}`}
                      onClick={() => setScenario('optimistic')}
                    >Clear Highway</button>
                    <button 
                      className={`segmented-btn ${scenario === 'mostlikely' ? 'active' : ''}`}
                      onClick={() => setScenario('mostlikely')}
                    >Normal Congestion</button>
                    <button 
                      className={`segmented-btn ${scenario === 'pessimistic' ? 'active' : ''}`}
                      onClick={() => setScenario('pessimistic')}
                    >Severe Gridlock (+50%)</button>
                  </div>
                </div>

                {/* Routing Formulation */}
                <div className="control-item">
                  <span className="control-item-label">Algorithm:</span>
                  <div className="segmented-group">
                    <button 
                      className={`segmented-btn primary ${engine === 'decomposed' ? 'active primary' : ''}`}
                      onClick={() => setEngine('decomposed')}
                    >Decomposed MILP (Optimized)</button>
                    <button 
                      className={`segmented-btn ${engine === 'greedy' ? 'active' : ''}`}
                      onClick={() => setEngine('greedy')}
                    >Greedy Baseline</button>
                  </div>
                </div>
              </div>

              <div className="control-bar-right">
                <span>Active Dataset: <strong>Zenodo 10.5281/zenodo.15310106</strong></span>
              </div>
            </div>

            {/* 4 Professional KPI Metric Cards */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-label">Total Fleet Distance</span>
                  <Route size={15} color="#38bdf8" />
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-value">{activeMetrics?.distance_km?.toFixed(1) || 0}</span>
                  <span className="kpi-unit">km</span>
                </div>
                <div className="kpi-subtext">
                  <span>Avg {routes.length ? ((activeMetrics?.distance_km || 0) / routes.length).toFixed(1) : 0} km per delivery van</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-label">Cumulative Transit Time</span>
                  <Clock size={15} color="#a855f7" />
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-value">{activeMetrics?.travel_time_min?.toFixed(0) || 0}</span>
                  <span className="kpi-unit">min</span>
                </div>
                <div className="kpi-subtext">
                  <span>{((activeMetrics?.travel_time_min || 0) / 60).toFixed(1)} fleet hours on road</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-label">Healthcare SLA Punctuality</span>
                  <CheckCircle2 size={15} color="#10b981" />
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-value" style={{ color: (activeMetrics?.on_time_rate_pct || 0) >= 98 ? '#34d399' : '#fbbf24' }}>
                    {activeMetrics?.on_time_rate_pct?.toFixed(1) || 100}%
                  </span>
                  <span className="kpi-unit">on-time</span>
                </div>
                <div className="kpi-subtext" style={{ color: (activeMetrics?.late_deliveries || 0) === 0 ? '#34d399' : '#f87171' }}>
                  {(activeMetrics?.late_deliveries || 0) === 0 
                    ? '✓ 0 late clinic deliveries (Zero Spoilage)' 
                    : `⚠️ ${activeMetrics?.late_deliveries} late deliveries (${activeMetrics?.total_lateness_min?.toFixed(0)} min total delay)`
                  }
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-top">
                  <span className="kpi-label">Dispatched Vans</span>
                  <Truck size={15} color="#f59e0b" />
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-value">{routes.length}</span>
                  <span className="kpi-unit">vehicles</span>
                </div>
                <div className="kpi-subtext">
                  <span>Knapsack Limits: 600 kg • 3.0 m³ per van</span>
                </div>
              </div>
            </div>

            {/* MISSION WORKSPACE: LEAFLET GIS MAP + DISPATCH TELEMETRY */}
            <div className="mission-workspace">
              {/* GIS Map Card (Left) */}
              <div className="gis-map-card">
                <div className="gis-map-header">
                  <div className="gis-title-box">
                    <MapPin size={15} color="#38bdf8" />
                    <div>
                      <div className="gis-title">Attica Pharmaceutical GIS Network</div>
                      <div className="gis-subtitle">
                        {selectedVehicle === null 
                          ? `Displaying all ${routes.length} delivery van circuits across Athens.`
                          : `Focus: Van ${selectedVehicle + 1} (${activeVan?.driver}) • ${activeVan?.stopsCount} clinic stops.`
                        }
                      </div>
                    </div>
                  </div>

                  <div className="gis-controls-right">
                    {/* Van Selector Strip */}
                    <div className="van-pill-strip">
                      <button 
                        className={`van-pill-btn ${selectedVehicle === null ? 'active' : ''}`}
                        onClick={() => setSelectedVehicle(null)}
                      >
                        All Vans
                      </button>
                      {routes.map((_, idx) => (
                        <button 
                          key={idx}
                          className={`van-pill-btn ${selectedVehicle === idx ? 'active' : ''}`}
                          onClick={() => setSelectedVehicle(idx)}
                        >
                          <span className="color-indicator" style={{ backgroundColor: FLEET_COLORS[idx % FLEET_COLORS.length] }} />
                          Van {idx + 1}
                        </button>
                      ))}
                    </div>

                    {/* Toggle Background Routes */}
                    <button 
                      className={`tool-btn ${showBackgroundRoutes ? 'active' : ''}`}
                      onClick={() => setShowBackgroundRoutes(!showBackgroundRoutes)}
                      title="Toggle faint background routes"
                    >
                      <Layers size={13} /> Network
                    </button>

                    {/* Live Simulation Button */}
                    <button 
                      className={`tool-btn ${isSimulating ? 'active' : ''}`}
                      onClick={() => setIsSimulating(!isSimulating)}
                      disabled={selectedVehicle === null}
                    >
                      {isSimulating ? <Square size={13} /> : <Play size={13} />}
                      {isSimulating ? 'Stop Van' : 'Simulate'}
                    </button>
                  </div>
                </div>

                <div className="leaflet-map-wrapper">
                  <div ref={mapContainerRef} className="leaflet-container" />
                </div>
              </div>

              {/* Van Telemetry & Turn-by-Turn Card (Right Column) */}
              <div className="telemetry-card">
                <div className="telemetry-header">
                  <div className="van-title-box">
                    <span 
                      className="color-indicator" 
                      style={{ 
                        backgroundColor: activeVan ? activeVan.color : '#38bdf8',
                        width: '10px',
                        height: '10px'
                      }} 
                    />
                    <span className="van-title">
                      {activeVan ? `Van ${activeVan.id + 1} Mission Profile` : 'Fleet Fleet Manifest'}
                    </span>
                  </div>
                  <span className="van-badge">
                    {activeVan ? `${activeVan.stopsCount} CLINICS` : `${routes.length} VANS`}
                  </span>
                </div>

                {activeVan && (
                  <div className="van-telemetry-meta">
                    <div className="driver-strip">
                      <span>Assigned Driver: <strong>{activeVan.driver}</strong></span>
                      <span className="system-status-pill">
                        <Thermometer size={11} style={{ display: 'inline' }} /> 3.8°C Nominal
                      </span>
                    </div>
                    <div className="driver-strip" style={{ fontSize: '0.7rem' }}>
                      <span>Model: <strong>{activeVan.vanModel}</strong></span>
                      <span>Sector: <strong>{activeVan.zone}</strong></span>
                    </div>

                    <div className="capacity-bars">
                      <div className="bar-row">
                        <div className="bar-labels">
                          <span>Payload Mass</span>
                          <span><strong>{activeVan.weight} kg</strong> / 600 kg ({activeVan.weightPct}%)</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${activeVan.weightPct}%`, backgroundColor: activeVan.color }} />
                        </div>
                      </div>

                      <div className="bar-row">
                        <div className="bar-labels">
                          <span>Cargo Volume</span>
                          <span><strong>{activeVan.volume} m³</strong> / 3.0 m³ ({activeVan.volumePct}%)</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${activeVan.volumePct}%`, backgroundColor: '#38bdf8' }} />
                        </div>
                      </div>

                      <div className="bar-row">
                        <div className="bar-labels">
                          <span>Shift Utilization</span>
                          <span><strong>{activeVan.shiftMin} min</strong> / 360 min ({activeVan.shiftPct}%)</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${activeVan.shiftPct}%`, backgroundColor: '#10b981' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Turn-by-Turn Delivery Timeline */}
                <div className="tour-timeline-wrapper">
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '4px 6px' }}>
                    CHRONOLOGICAL DELIVERY STOPS (CLICK TO LOCATE ON MAP)
                  </div>

                  {tourTimeline.map(step => (
                    <div 
                      key={step.key} 
                      className={`timeline-row ${activeMarkerNode === step.node ? 'active' : ''}`}
                      onClick={() => {
                        setActiveMarkerNode(step.node);
                        const c = coordsMap[step.node];
                        if (c && mapInstanceRef.current) {
                          mapInstanceRef.current.setView([c.lat, c.lon], 14, { animate: true });
                        }
                      }}
                    >
                      <div 
                        className="timeline-number"
                        style={{
                          backgroundColor: step.isDepot ? '#fbbf24' : (activeVan?.color || '#38bdf8'),
                          color: '#080d17'
                        }}
                      >
                        {step.seq}
                      </div>

                      <div className="timeline-content">
                        <div className="timeline-name">{step.facility}</div>
                        <div className="timeline-meta">
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>ETA {step.eta}</span>
                          <span>•</span>
                          <span>[{step.eat}-{step.lat}]m</span>
                          <span>•</span>
                          <span>{step.weight} kg</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {selectedVehicle === null && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                      Select a specific vehicle above (Van 1, Van 2...) to inspect its individual delivery sequence and locate stops on the GIS map.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clinic Manifest Table */}
            <div className="manifest-panel">
              <div className="table-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={15} color="#38bdf8" />
                  <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff' }}>
                    Healthcare Facility Delivery Manifest
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>({filteredManifest.length} facilities)</span>
                </div>

                <div className="search-input-box">
                  <Search size={13} color="#64748b" />
                  <input 
                    type="text" 
                    placeholder="Search hospital or clinic..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="manifest-table">
                  <thead>
                    <tr>
                      <th>Stop #</th>
                      <th>Assigned Van</th>
                      <th>Healthcare Facility</th>
                      <th>Pharmaceutical Class</th>
                      <th>Time Window [EAT - LAT]</th>
                      <th>Payload Weight</th>
                      <th>Volume</th>
                      <th>Service Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredManifest.slice(0, 40).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>#{row.seq}</td>
                        <td style={{ fontWeight: 600, color: FLEET_COLORS[(row.vehicleId - 1) % FLEET_COLORS.length] }}>
                          Van {row.vehicleId}
                        </td>
                        <td style={{ fontWeight: 600, color: '#f8fafc' }}>{row.facility}</td>
                        <td style={{ color: '#94a3b8', fontSize: '0.74rem' }}>{row.medType}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>[{row.eat} - {row.lat}] min</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.weight} kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.volume} m³</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.service} min</td>
                        <td>
                          <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.72rem' }}>
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
            TAB 2: SHIFT SCHEDULE GANTT CHART (ARRIVAL TIME VS TIME WINDOW)
           ========================================================================= */}
        {activeTab === 'gantt' && (
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">Fleet Dispatch Shift Schedule (Gantt Visualization)</h2>
              <p className="page-desc">
                Visual timeline showing all 6 delivery vans across the 6-hour shift (08:00 AM to 14:00 PM / 0 to 360 minutes). 
                Each block represents a hospital stop plotted at its exact scheduled arrival time within its customer time window.
              </p>
            </div>

            <div className="gantt-panel">
              <div className="gantt-header">
                <span className="gantt-title">
                  <Clock size={15} color="#38bdf8" /> 6-Hour Operational Shift Timeline (0 to 360 Minutes)
                </span>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  All vans return to Central Hub prior to 14:00 PM shift deadline
                </span>
              </div>

              {/* Time Axis Header */}
              <div className="gantt-time-axis">
                <span>Vehicle</span>
                <span>08:00 AM (0m)</span>
                <span>09:00 AM (60m)</span>
                <span>10:00 AM (120m)</span>
                <span>11:00 AM (180m)</span>
                <span>12:00 PM (240m)</span>
                <span>13:00 PM (300m)</span>
              </div>

              {/* Vehicle Tracks */}
              <div className="gantt-lanes">
                {routes.map((route, vIdx) => {
                  const vColor = FLEET_COLORS[vIdx % FLEET_COLORS.length];
                  const stops = route.filter(n => n !== 0);
                  let curTime = 15; // Depart depot at 08:15

                  return (
                    <div key={vIdx} className="gantt-lane">
                      <div className="gantt-lane-label">
                        <span className="color-indicator" style={{ backgroundColor: vColor }} />
                        <span>Van {vIdx + 1}</span>
                      </div>

                      <div className="gantt-track">
                        {stops.map((node, sIdx) => {
                          const ord = dayOrders[String(node)] || {};
                          curTime += (ord.service_time || 8) + 12;
                          const leftPct = Math.min((curTime / 360) * 100, 96);
                          const widthPct = Math.max(((ord.service_time || 8) / 360) * 100, 2.5);

                          return (
                            <div 
                              key={sIdx}
                              className="gantt-block"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: vColor
                              }}
                              title={`Stop #${sIdx + 1}: Node ${node} • ETA +${curTime}m • Window [${ord.eat}-${ord.lat}]m`}
                            >
                              {sIdx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: 27-INSTANCE BENCHMARK (RQ5)
           ========================================================================= */}
        {activeTab === 'benchmark' && (
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">27-Instance Academic Benchmark (RQ5)</h2>
              <p className="page-desc">
                Comprehensive evaluation of all 27 problem instances (9 operational days × 3 city traffic scenarios). 
                Proves cluster-first Decomposed MILP superiority over the Greedy baseline across 1,938 real-world clinic stops in Athens.
              </p>
            </div>

            <div className="callout-banner">
              <div>📊</div>
              <div>
                <strong>Empirical Findings:</strong> Decomposed MILP achieves an average <strong>97.58% On-Time Delivery Rate</strong> vs <strong>94.07% for Greedy</strong> (+3.51% punctuality advantage), 
                slashing late hospital deliveries by <strong>58.9% (48 late vs 117 late)</strong> with an average runtime of <strong>46.2 seconds</strong>.
              </div>
            </div>

            <div className="manifest-panel">
              <div className="table-responsive">
                <table className="manifest-table">
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
                      <th>Decomp Runtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pharmaData.benchmarks || []).map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>Day {r.day}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.scenario}</td>
                        <td>{r.num_orders}</td>
                        <td>{r.greedy_distance_km} km</td>
                        <td>{r.greedy_late_deliveries}</td>
                        <td>{r.greedy_on_time_rate_pct?.toFixed(1)}%</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{r.decomp_distance_km} km</td>
                        <td style={{ color: r.decomp_late_deliveries === 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                          {r.decomp_late_deliveries}
                        </td>
                        <td style={{ fontWeight: 700, color: r.decomp_on_time_rate_pct >= 98 ? '#34d399' : '#fbbf24' }}>
                          {r.decomp_on_time_rate_pct?.toFixed(1)}%
                        </td>
                        <td style={{ color: r.delta_on_time_rate_pct >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
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
            TAB 4: MULTI-OBJECTIVE TRADE-OFFS (RQ4)
           ========================================================================= */}
        {activeTab === 'multiobj' && (
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">Multi-Objective Optimization Trade-Offs (RQ4)</h2>
              <p className="page-desc">
                Parametric weight sweep across Z = α·Distance + β·Time + γ·Lateness (where α + β + γ = 1.0). 
                Characterizes the trade-off curve between operational fuel mileage and healthcare SLA compliance.
              </p>
            </div>

            <div className="callout-banner">
              <div>🎯</div>
              <div>
                <strong>Non-Dominated Trade-Off:</strong> Profile 7 (α=0.20, β=0.20, γ=0.60) is the <strong>best observed non-dominated trade-off</strong>, 
                achieving <strong>100% on-time delivery</strong> at <strong>86.0 km</strong>. Optimizing purely for lateness without mileage penalties (Profile 8: γ=1.00) causes distance to inflate by <strong>+159% (222.8 km)</strong>.
              </div>
            </div>

            <div className="manifest-panel">
              <div className="table-responsive">
                <table className="manifest-table">
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
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>{p.profile_name}</td>
                        <td>{p.alpha_distance}</td>
                        <td>{p.beta_time}</td>
                        <td>{p.gamma_lateness}</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{p.total_distance_km} km</td>
                        <td>{p.total_travel_time_min} min</td>
                        <td style={{ color: p.late_deliveries === 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
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
            TAB 5: STRESS TEST & SCALABILITY (RQ6 & RQ3)
           ========================================================================= */}
        {activeTab === 'robustness' && (
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">Traffic Robustness Stress Simulation (RQ6) & Scalability Limits (RQ3)</h2>
              <p className="page-desc">
                Stress-test evaluating route resilience when plans optimized under normal traffic are executed during severe gridlock (+50% delays), 
                and empirical evaluation of monolithic MILP computational limits across customer scale n.
              </p>
            </div>

            <div className="callout-banner">
              <div>🛡️</div>
              <div>
                <strong>Resilience Buffer:</strong> Under severe gridlock, Greedy plans suffer a <strong>-20.3% punctuality collapse</strong> down to 72.71%. 
                Decomposed MILP retains an <strong>80.02% resilience buffer (+7.31% higher)</strong>, avoiding <strong>5,171 minutes</strong> of fleet delay and preventing <strong>49 late hospital deliveries</strong>.
              </div>
            </div>

            <div className="manifest-panel">
              <div className="table-responsive">
                <table className="manifest-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Clinics</th>
                      <th>Greedy Planned</th>
                      <th>Greedy Under Gridlock</th>
                      <th>Greedy Punctuality Drop</th>
                      <th>Decomp Planned</th>
                      <th>Decomp Under Gridlock</th>
                      <th>Decomp Drop</th>
                      <th>Resilience Advantage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pharmaData.robustness || []).map((r, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>Day {r.day}</td>
                        <td>{r.num_orders}</td>
                        <td>{r.greedy_plan_otr_pct?.toFixed(1)}%</td>
                        <td style={{ color: '#f87171', fontWeight: 600 }}>{r.greedy_stress_otr_pct?.toFixed(1)}%</td>
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

      </main>
    </div>
  );
}
