import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import pharmaData from './data/pharmaData.json';
import matrices from './data/matrices.json';
import { solveDynamicFleet } from './solver';
import { 
  Truck, Clock, CheckCircle2, AlertTriangle, Route, ShieldAlert, 
  Play, Square, ExternalLink, Activity, Search, Compass, Calendar,
  MapPin, Layers, BarChart3, Thermometer, Sliders, RotateCcw,
  Sparkles, Gauge, Fuel, Eye, EyeOff, Zap
} from 'lucide-react';
import './App.css';

// Enterprise Van Palette (Distinct, high-contrast, harmonious)
const FLEET_COLORS = [
  '#00e5ff', // Electric Cyan (Van 1)
  '#a855f7', // Lavender Purple (Van 2)
  '#10b981', // Mint Emerald (Van 3)
  '#f59e0b', // Radiant Amber (Van 4)
  '#ec4899', // Hot Pink (Van 5)
  '#3b82f6', // Royal Cobalt (Van 6)
  '#14b8a6', // Teal (Van 7)
  '#f97316', // Orange (Van 8)
  '#8b5cf6', // Indigo (Van 9)
  '#06b6d4'  // Cyan (Van 10)
];

const DRIVERS = [
  { name: 'Dimitris K.', vanModel: 'Mercedes-Benz eVito #EV-101', zone: 'North Corridor (Marousi / Kifisia)' },
  { name: 'Eleni M.', vanModel: 'Renault Master Z.E. #EV-102', zone: 'Central Athens (Syntagma / Goudi)' },
  { name: 'Nikos P.', vanModel: 'Ford E-Transit #EV-103', zone: 'West Attica (Chaidari / Peristeri)' },
  { name: 'Ioannis S.', vanModel: 'Mercedes-Benz eVito #EV-104', zone: 'South Attica (Piraeus / Faliro)' },
  { name: 'Sophia T.', vanModel: 'Renault Master Z.E. #EV-105', zone: 'East Attica (Mesogeia / Spata)' },
  { name: 'Christos V.', vanModel: 'Ford E-Transit #EV-106', zone: 'Coastal Suburbs (Glyfada / Voula)' },
  { name: 'Katerina P.', vanModel: 'Mercedes-Benz eVito #EV-107', zone: 'Northwest Suburbs (Menidi / Acharnes)' },
  { name: 'Giorgos L.', vanModel: 'Renault Master Z.E. #EV-108', zone: 'East Coast (Rafina / Artemis)' },
  { name: 'Vassilis N.', vanModel: 'Ford E-Transit #EV-109', zone: 'South Coast (Vari / Varkiza)' },
  { name: 'Alexandros T.', vanModel: 'Mercedes-Benz eVito #EV-110', zone: 'Central Industrial (Renti / Tavros)' }
];

const DEFAULT_PARAMS = {
  capacityWeight: 600,   // kg
  capacityVolume: 3.0,   // m³
  maxShiftDuration: 360, // minutes
  fleetLimit: null,      // null = auto
  alphaDistance: 0.20,
  betaTime: 0.20,
  gammaLateness: 0.60,
  trafficMultiplier: 1.0 // 1.0x baseline
};

export default function App() {
  // Navigation Tabs: 'dispatch', 'studio', 'gantt', 'benchmark', 'robustness'
  const [activeTab, setActiveTab] = useState('dispatch');

  // Operational Filters
  const [day, setDay] = useState(1);
  const [scenario, setScenario] = useState('mostlikely');
  const [engine, setEngine] = useState('decomposed');
  const [selectedVehicle, setSelectedVehicle] = useState(null); // null = All Vans
  const [lastSelectedVehicle, setLastSelectedVehicle] = useState(0); // remembers last inspected van
  const [showBackgroundRoutes, setShowBackgroundRoutes] = useState(false); // clean focused view by default
  const [mapTheme, setMapTheme] = useState('dark'); // 'dark' (Esri) or 'street' (OSM)
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeMarkerNode, setActiveMarkerNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive Simulation Parameters State
  const [simParams, setSimParams] = useState(DEFAULT_PARAMS);
  const [benchmarkFilter, setBenchmarkFilter] = useState('all');

  // Python Backend Connection & Solver State
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'offline' | 'checking'
  const [isSolving, setIsSolving] = useState(false);
  const [backendSolution, setBackendSolution] = useState(null);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [solveNotification, setSolveNotification] = useState(null);
  const debounceTimerRef = useRef(null);

  // Refs for Leaflet Map
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const simMarkersRef = useRef([]);
  const simIntervalRef = useRef(null);

  // Coordinates Map with Athens GPS
  const coordsList = useMemo(() => pharmaData.coords?.[String(day)] || [], [day]);
  const coordsMap = useMemo(() => {
    const map = {};
    coordsList.forEach(c => { map[c.node] = c; });
    return map;
  }, [coordsList]);

  const dayOrders = useMemo(() => pharmaData.orders?.[String(day)] || {}, [day]);
  const dayMatrix = useMemo(() => matrices[String(day)] || null, [day]);

  // Check if dispatcher modified any operational parameters away from baseline
  const isCustomParams = useMemo(() => {
    return (
      simParams.capacityWeight !== DEFAULT_PARAMS.capacityWeight ||
      simParams.capacityVolume !== DEFAULT_PARAMS.capacityVolume ||
      simParams.maxShiftDuration !== DEFAULT_PARAMS.maxShiftDuration ||
      Math.abs(simParams.trafficMultiplier - DEFAULT_PARAMS.trafficMultiplier) > 0.001 ||
      Math.abs(simParams.alphaDistance - DEFAULT_PARAMS.alphaDistance) > 0.001 ||
      Math.abs(simParams.betaTime - DEFAULT_PARAMS.betaTime) > 0.001 ||
      Math.abs(simParams.gammaLateness - DEFAULT_PARAMS.gammaLateness) > 0.001
    );
  }, [simParams]);

  // Baseline Benchmark Data
  const runKey = `day_${day}_${scenario}`;
  const baselineRunData = pharmaData.routes?.[runKey] || null;
  const baselineMetrics = baselineRunData ? baselineRunData[engine] : null;

  // Trigger Real Python Backend Optimization
  const triggerPythonOptimization = async (customParams = simParams, targetDay = day, targetScenario = scenario, targetEngine = engine) => {
    setIsSolving(true);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: targetDay,
          scenario: targetScenario,
          engine: targetEngine,
          capacity_weight: customParams.capacityWeight,
          capacity_volume: customParams.capacityVolume,
          max_shift_duration: customParams.maxShiftDuration,
          traffic_multiplier: customParams.trafficMultiplier,
          alpha_distance: customParams.alphaDistance,
          beta_time: customParams.betaTime,
          gamma_lateness: customParams.gammaLateness,
          time_limit_sec: 10
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBackendSolution(data);
      setBackendStatus('connected');
      setSolveNotification(`Solved via Python ${targetEngine === 'decomposed' ? 'HiGHS MILP' : 'Nearest-Neighbor'} in ${data.solve_time_sec ? `${data.solve_time_sec}s` : `${data.solve_time_ms}ms`}`);
      setTimeout(() => setSolveNotification(null), 5000);
    } catch (err) {
      console.warn('Python backend offline or error, falling back to client solver:', err);
      setBackendStatus('offline');
    } finally {
      setIsSolving(false);
    }
  };

  // Health check for Python FastAPI backend
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const d = await res.json();
          if (active && d.status === 'healthy') {
            setBackendStatus('connected');
            return;
          }
        }
      } catch {}
      if (active) setBackendStatus('offline');
    };
    check();
    const interval = setInterval(check, 10000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Debounced Auto-Optimization when Parameters change
  useEffect(() => {
    if (!isCustomParams || !autoOptimize || backendStatus !== 'connected') return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      triggerPythonOptimization(simParams, day, scenario, engine);
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isCustomParams, simParams, day, scenario, engine, autoOptimize, backendStatus]);

  // Fast Client-side fallback solution (CVRPTW in browser)
  const clientSolution = useMemo(() => {
    if (!isCustomParams) return null;
    return solveDynamicFleet(day, scenario, engine, simParams, dayOrders, dayMatrix);
  }, [isCustomParams, day, scenario, engine, simParams, dayOrders, dayMatrix]);

  // Unified Dynamic Solution: prefers Python backend solution if fresh & matching, else client fallback
  const dynamicSolution = useMemo(() => {
    if (!isCustomParams) return null;
    if (backendSolution && backendSolution.day === day && backendSolution.scenario === scenario && backendSolution.engine === engine) {
      return backendSolution;
    }
    return clientSolution;
  }, [isCustomParams, backendSolution, clientSolution, day, scenario, engine]);

  // Active Metrics: dynamically driven by solver when parameters are tweaked, else baseline
  const activeMetrics = useMemo(() => {
    if (isCustomParams && dynamicSolution?.metrics) {
      return dynamicSolution.metrics;
    }
    return baselineMetrics;
  }, [isCustomParams, dynamicSolution, baselineMetrics]);

  // Active Routes: dynamically driven by solver when parameters are tweaked, else baseline
  const routes = useMemo(() => {
    if (isCustomParams && dynamicSolution?.routes) {
      return dynamicSolution.routes;
    }
    return activeMetrics?.routes || [];
  }, [isCustomParams, dynamicSolution, activeMetrics]);

  // Derived safeSelectedVehicle so out-of-bounds indices never crash or hide routes
  const safeSelectedVehicle = (selectedVehicle !== null && selectedVehicle < routes.length) ? selectedVehicle : null;

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
        weightPct: Math.min(Math.round((weight / simParams.capacityWeight) * 100), 100),
        volume: Number(volume.toFixed(2)),
        volumePct: Math.min(Math.round((volume / simParams.capacityVolume) * 100), 100),
        shiftMin: shiftTime,
        shiftPct: Math.min(Math.round((shiftTime / simParams.maxShiftDuration) * 100), 100),
        color: FLEET_COLORS[idx % FLEET_COLORS.length],
        driver: driver.name,
        vanModel: driver.vanModel,
        zone: driver.zone,
        stops
      };
    });
  }, [routes, dayOrders, activeMetrics, simParams]);

  const activeVan = useMemo(() => {
    return (safeSelectedVehicle !== null && vehicleStats[safeSelectedVehicle]) ? vehicleStats[safeSelectedVehicle] : null;
  }, [safeSelectedVehicle, vehicleStats]);

  // Aggregate Fleet Telemetry Summary (for All Vans Telemetry View)
  const fleetSummary = useMemo(() => {
    if (!vehicleStats.length) return null;
    const totalStops = vehicleStats.reduce((acc, v) => acc + v.stopsCount, 0);
    const totalWeight = vehicleStats.reduce((acc, v) => acc + v.weight, 0);
    const totalVolume = Number(vehicleStats.reduce((acc, v) => acc + v.volume, 0).toFixed(2));
    const totalCapWeight = vehicleStats.length * simParams.capacityWeight;
    const totalCapVolume = Number((vehicleStats.length * simParams.capacityVolume).toFixed(2));
    const weightPct = totalCapWeight ? Math.min(Math.round((totalWeight / totalCapWeight) * 100), 100) : 0;
    const volumePct = totalCapVolume ? Math.min(Math.round((totalVolume / totalCapVolume) * 100), 100) : 0;
    const avgShift = Math.round(vehicleStats.reduce((acc, v) => acc + v.shiftMin, 0) / vehicleStats.length);
    const shiftPct = simParams.maxShiftDuration ? Math.min(Math.round((avgShift / simParams.maxShiftDuration) * 100), 100) : 0;

    return {
      totalVans: vehicleStats.length,
      totalStops,
      totalWeight,
      totalCapWeight,
      weightPct,
      totalVolume,
      totalCapVolume,
      volumePct,
      avgShift,
      shiftPct
    };
  }, [vehicleStats, simParams]);

  // Robust Network / Isolate Van Toggle Action
  const handleToggleNetworkOrIsolate = () => {
    if (safeSelectedVehicle === null) {
      // Currently displaying All Vans -> Isolate active van!
      const target = (lastSelectedVehicle !== null && lastSelectedVehicle < routes.length) ? lastSelectedVehicle : 0;
      setSelectedVehicle(target);
      setShowBackgroundRoutes(false);
    } else {
      // Currently inspecting an individual van -> Show entire fleet network!
      setSelectedVehicle(null);
      setShowBackgroundRoutes(false);
    }
  };

  // Simulation Impact Calculations & Constraint Feasibility
  const simulationResults = useMemo(() => {
    if (!activeMetrics || !routes.length) return null;

    let maxWeightObserved = 0;
    let maxVolumeObserved = 0;
    let maxShiftObserved = 0;
    let overloadedVehicles = 0;
    let shiftOverrunVehicles = 0;

    routes.forEach((route, idx) => {
      let rWeight = 0;
      let rVolume = 0;
      let rService = 0;

      route.forEach(n => {
        if (n !== 0) {
          const ord = dayOrders[String(n)];
          if (ord) {
            rWeight += ord.weight || 0;
            rVolume += ord.volume || 0;
            rService += ord.service_time || 0;
          }
        }
      });

      const rTransit = dynamicSolution?.routeMetrics?.[idx]?.travel_time_min 
        ?? ((activeMetrics.travel_time_min / routes.length) * simParams.trafficMultiplier);
      const rShift = rService + rTransit;

      if (rWeight > maxWeightObserved) maxWeightObserved = rWeight;
      if (rVolume > maxVolumeObserved) maxVolumeObserved = rVolume;
      if (rShift > maxShiftObserved) maxShiftObserved = rShift;

      if (rWeight > simParams.capacityWeight || rVolume > simParams.capacityVolume) {
        overloadedVehicles++;
      }
      if (rShift > simParams.maxShiftDuration) {
        shiftOverrunVehicles++;
      }
    });

    const isFeasible = overloadedVehicles === 0 && shiftOverrunVehicles === 0;
    const simTravelTime = Math.round(activeMetrics.travel_time_min || 0);
    const simDistance = Math.round(activeMetrics.distance_km || 0);
    const simLateDeliveries = activeMetrics.late_deliveries || 0;
    const simOnTimeRate = activeMetrics.on_time_rate_pct !== undefined 
      ? Number(activeMetrics.on_time_rate_pct.toFixed(1)) 
      : 100;
    const estVehicles = routes.length;

    const driverHours = (simTravelTime + 78 * 6) / 60;
    const fuelCost = simDistance * 0.38;
    const laborCost = driverHours * 22.50;
    const totalCost = Math.round(fuelCost + laborCost);

    const co2ElectricKg = Math.round((simDistance * 0.023) * 10) / 10;
    const co2DieselKg = Math.round((simDistance * 0.142) * 10) / 10;
    const co2SavingsKg = Math.round((co2DieselKg - co2ElectricKg) * 10) / 10;

    // Baseline comparisons
    const baseVehicles = baselineMetrics?.vehicles || baselineMetrics?.routes?.length || 4;
    const baseDist = Math.round(baselineMetrics?.distance_km || 0);
    const baseTime = Math.round(baselineMetrics?.travel_time_min || 0);
    const baseLate = baselineMetrics?.late_deliveries || 0;
    const baseOTR = baselineMetrics?.on_time_rate_pct !== undefined 
      ? Number(baselineMetrics.on_time_rate_pct.toFixed(1)) 
      : 100;
    const baseDriverHours = (baseTime + 78 * 6) / 60;
    const baseCost = Math.round(baseDist * 0.38 + baseDriverHours * 22.50);

    const deltaVehicles = estVehicles - baseVehicles;
    const deltaDistance = simDistance - baseDist;
    const deltaTime = simTravelTime - baseTime;
    const deltaLate = simLateDeliveries - baseLate;
    const deltaOTR = Number((simOnTimeRate - baseOTR).toFixed(1));
    const deltaCost = totalCost - baseCost;

    return {
      isFeasible,
      overloadedVehicles,
      shiftOverrunVehicles,
      maxWeightObserved: Math.round(maxWeightObserved),
      maxVolumeObserved: Number(maxVolumeObserved.toFixed(2)),
      maxShiftObserved: Math.round(maxShiftObserved),
      simTravelTime,
      simDistance,
      simLateDeliveries,
      simOnTimeRate,
      estVehicles,
      totalCost,
      co2ElectricKg,
      co2SavingsKg,
      baseVehicles,
      baseDist,
      baseTime,
      baseLate,
      baseOTR,
      baseCost,
      deltaVehicles,
      deltaDistance,
      deltaTime,
      deltaLate,
      deltaOTR,
      deltaCost
    };
  }, [activeMetrics, baselineMetrics, routes, dayOrders, simParams, dynamicSolution]);

  // Persistent Leaflet Map Initialization
  useEffect(() => {
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

      const esriUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
      const tileLayer = L.tileLayer(esriUrl, {
        maxZoom: 16,
        attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      routesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Cleanup map and markers only when entire component unmounts
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (simMarkersRef.current && mapInstanceRef.current) {
        simMarkersRef.current.forEach(m => {
          try {
            mapInstanceRef.current?.removeLayer(m);
          } catch {}
        });
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Invalidate Map Size whenever switching back to dispatch tab
  useEffect(() => {
    if (activeTab === 'dispatch' && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Handle Dynamic Map Theme Switcher (Esri Dark Gray vs OSM)
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const esriUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileLayerRef.current.setUrl(mapTheme === 'dark' ? esriUrl : osmUrl);
  }, [mapTheme]);

  // Render Routes and Markers on Leaflet Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routesLayerRef.current || !markersLayerRef.current) return;

    routesLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();

    if (!routes.length || !coordsList.length) return;

    const depotCoord = coordsMap[0];
    const allBounds = [];
    const focusBounds = [];

    // 1. Draw Inactive / Ghosted Routes First
    if (showBackgroundRoutes && safeSelectedVehicle !== null) {
      routes.forEach((route, idx) => {
        if (safeSelectedVehicle === idx) return;

        const latlngs = route
          .map(node => coordsMap[node])
          .filter(Boolean)
          .map(c => [c.lat, c.lon]);

        if (latlngs.length > 1) {
          const bgCol = FLEET_COLORS[idx % FLEET_COLORS.length];
          L.polyline(latlngs, {
            color: bgCol,
            weight: 2.2,
            opacity: 0.5,
            dashArray: '5, 7'
          }).addTo(routesLayerRef.current);

          route.forEach(node => {
            if (node === 0) return;
            const c = coordsMap[node];
            const ord = dayOrders[String(node)] || {};
            if (!c) return;

            const ghostIcon = L.divIcon({
              className: 'ghost-marker-dot',
              html: `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${bgCol}; opacity: 0.85; border: 1.5px solid rgba(255, 255, 255, 0.7); box-shadow: 0 0 6px ${bgCol};"></div>`,
              iconSize: [8, 8],
              iconAnchor: [4, 4]
            });

            const m = L.marker([c.lat, c.lon], { icon: ghostIcon }).addTo(markersLayerRef.current);
            m.bindPopup(`
              <div class="custom-popup-content">
                <div class="custom-popup-header">
                  <span class="popup-tag">FLEET CONTEXT</span>
                  <span class="popup-van-name" style="color: ${bgCol}">VAN ${idx + 1}</span>
                </div>
                <div class="popup-facility-name">${c.name || `Clinic #${node}`}</div>
                <div class="popup-med-type">📦 ${c.type || 'Vaccines & Cold-Chain'}</div>
                <div class="popup-grid">
                  <div><span class="popup-label">Time Window</span><div class="popup-val">[${ord.eat || 0} - ${ord.lat || 0}] min</div></div>
                  <div><span class="popup-label">Payload</span><div class="popup-val">${ord.weight || 0} kg</div></div>
                </div>
              </div>
            `);
          });
        }
      });
    }

    // 2. Draw Active Routes
    routes.forEach((route, idx) => {
      const isFocused = safeSelectedVehicle === null || safeSelectedVehicle === idx;
      if (!isFocused) return;

      const vColor = FLEET_COLORS[idx % FLEET_COLORS.length];
      const latlngs = route
        .map(node => coordsMap[node])
        .filter(Boolean)
        .map(c => [c.lat, c.lon]);

      if (latlngs.length > 1) {
        latlngs.forEach(pt => {
          allBounds.push(pt);
          if (safeSelectedVehicle === idx) focusBounds.push(pt);
        });

        // Vibrant active polyline
        L.polyline(latlngs, {
          color: vColor,
          weight: safeSelectedVehicle === idx ? 4.5 : 3.0,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(routesLayerRef.current);

        // Add Numbered Sequential Pins
        let seq = 1;
        route.forEach((node, nodeIdx) => {
          if (node === 0) return;
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

          const popupHtml = `
            <div class="custom-popup-content">
              <div class="custom-popup-header">
                <span class="popup-tag">STOP #${pinNumber}</span>
                <span class="popup-van-name" style="color: ${vColor}">VAN ${idx + 1}</span>
              </div>
              <div class="popup-facility-name">${c.name || `Clinic #${node}`}</div>
              <div class="popup-med-type">📦 ${c.type || 'Vaccines & Cold-Chain'}</div>
              <div class="popup-grid">
                <div><span class="popup-label">Time Window</span><div class="popup-val">[${ord.eat || 0} - ${ord.lat || 0}] min</div></div>
                <div><span class="popup-label">Scheduled ETA</span><div class="popup-val text-emerald">09:${(nodeIdx * 14 + 10).toString().padStart(2, '0')} AM</div></div>
                <div><span class="popup-label">Payload</span><div class="popup-val">${ord.weight || 0} kg • ${ord.volume || 0} m³</div></div>
                <div><span class="popup-label">Service</span><div class="popup-val">${ord.service_time || 0} min</div></div>
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
          <div class="popup-med-type">Attiki Odos Logistics Hub • Cold-Storage Facility</div>
          <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 6px;">
            Depot departs at 08:00 AM. Temperature-controlled fleet returns before 14:00 PM shift cutoff.
          </div>
        </div>
      `);
    }

    // Auto-fit bounds
    if (focusBounds.length && safeSelectedVehicle !== null) {
      map.fitBounds(L.latLngBounds(focusBounds), { padding: [60, 60], maxZoom: 14 });
    } else if (allBounds.length) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [40, 40] });
    }

  }, [day, scenario, engine, safeSelectedVehicle, showBackgroundRoutes, routes, coordsMap, coordsList, dayOrders, activeMarkerNode]);

  // Live Vehicle Simulation on Leaflet Map (Supports both Individual Van and All Vans Fleet Simulation)
  useEffect(() => {
    const map = mapInstanceRef.current;

    const cleanupSim = () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      if (simMarkersRef.current && map) {
        simMarkersRef.current.forEach(m => {
          try {
            map.removeLayer(m);
          } catch {}
        });
      }
      simMarkersRef.current = [];
    };

    if (!isSimulating || !map || !routes.length) {
      cleanupSim();
      return;
    }

    cleanupSim();

    // Determine target routes to animate:
    // If safeSelectedVehicle !== null: only that vehicle
    // If safeSelectedVehicle === null (All Vans): all active routes simultaneously!
    const routesToSimulate = safeSelectedVehicle !== null
      ? [{ vanIdx: safeSelectedVehicle, route: routes[safeSelectedVehicle] }]
      : routes.map((route, idx) => ({ vanIdx: idx, route }));

    const vanSimData = [];
    routesToSimulate.forEach(({ vanIdx, route }) => {
      const pathCoords = route.map(n => coordsMap[n]).filter(Boolean).map(c => [c.lat, c.lon]);
      if (pathCoords.length >= 2) {
        const vColor = FLEET_COLORS[vanIdx % FLEET_COLORS.length];
        const vanNum = vanIdx + 1;

        const simIcon = L.divIcon({
          className: 'sim-van-marker',
          html: `
            <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; background: #ffffff; border: 3px solid ${vColor}; box-shadow: 0 0 16px ${vColor}; display: flex; align-items: center; justify-content: center; font-size: 13px;">
              <span style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 9px; font-weight: 800; background: rgba(8, 12, 20, 0.9); color: #ffffff; padding: 1px 5px; border-radius: 4px; border: 1px solid ${vColor}; white-space: nowrap; pointer-events: none; letter-spacing: 0.02em;">
                Van ${vanNum}
              </span>
              🚐
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker(pathCoords[0], { icon: simIcon, zIndexOffset: 2000 + vanIdx }).addTo(map);
        simMarkersRef.current.push(marker);

        vanSimData.push({
          marker,
          pathCoords,
          vanIdx
        });
      }
    });

    if (vanSimData.length === 0) return;

    let step = 0;
    const totalSteps = 240;

    simIntervalRef.current = setInterval(() => {
      step = (step + 1) % totalSteps;
      const progress = step / totalSteps;

      vanSimData.forEach(({ marker, pathCoords }) => {
        const totalSegs = pathCoords.length - 1;
        const curSegFloat = progress * totalSegs;
        const segIdx = Math.floor(curSegFloat);
        const segT = curSegFloat - segIdx;

        const p1 = pathCoords[segIdx];
        const p2 = pathCoords[segIdx + 1] || pathCoords[segIdx];

        const curLat = p1[0] + (p2[0] - p1[0]) * segT;
        const curLon = p1[1] + (p2[1] - p1[1]) * segT;

        marker.setLatLng([curLat, curLon]);
      });
    }, 50);

    return () => {
      cleanupSim();
    };
  }, [isSimulating, safeSelectedVehicle, routes, coordsMap]);

  // Turn-by-Turn Chronological Timeline
  const tourTimeline = useMemo(() => {
    if (safeSelectedVehicle === null || !routes[safeSelectedVehicle]) return [];
    const r = routes[safeSelectedVehicle];
    let seq = 1;
    let runningTime = 0;

    const dynamicArrTimes = dynamicSolution?.routeMetrics?.[safeSelectedVehicle]?.arrival_times;

    return r.map((node, i) => {
      const isDepot = node === 0;
      const isStart = isDepot && i === 0;
      const isEnd = isDepot && i === r.length - 1;
      const c = coordsMap[node] || {};
      const ord = dayOrders[String(node)] || {};

      let arrMin = 0;
      if (dynamicArrTimes && dynamicArrTimes[i] !== undefined) {
        arrMin = Math.round(dynamicArrTimes[i]);
      } else {
        runningTime += isDepot ? 0 : (ord.service_time || 8) + 14;
        arrMin = runningTime;
      }

      const etaHour = 8 + Math.floor(arrMin / 60);
      const etaMin = arrMin % 60;
      const period = etaHour >= 12 ? 'PM' : 'AM';
      const displayHour = etaHour > 12 ? etaHour - 12 : (etaHour === 0 ? 12 : etaHour);
      const etaStr = `${displayHour.toString().padStart(2, '0')}:${etaMin.toString().padStart(2, '0')} ${period}`;
      const isLate = !isDepot && ord.lat && arrMin > ord.lat;

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
        eta: etaStr,
        arrMin,
        isLate,
        latenessMin: isLate ? Math.round(arrMin - ord.lat) : 0
      };
    });
  }, [routes, safeSelectedVehicle, coordsMap, dayOrders, dynamicSolution]);

  // Filtered Clinic Manifest
  const filteredManifest = useMemo(() => {
    let list = [];
    routes.forEach((r, vIdx) => {
      if (safeSelectedVehicle !== null && safeSelectedVehicle !== vIdx) return;
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
          medType: c.type || 'Cold-Chain Biologics',
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
      item.facility.toLowerCase().includes(q) ||
      String(item.node).includes(q) ||
      item.medType.toLowerCase().includes(q)
    );
  }, [routes, safeSelectedVehicle, coordsMap, dayOrders, searchQuery]);

  // Preset Handlers for Parameter Studio
  const applyPreset = (presetName) => {
    setBackendSolution(null);
    switch(presetName) {
      case 'balanced':
        setSimParams({ ...DEFAULT_PARAMS });
        break;
      case 'green':
        setSimParams({
          ...DEFAULT_PARAMS,
          alphaDistance: 0.70,
          betaTime: 0.15,
          gammaLateness: 0.15
        });
        break;
      case 'urgent':
        setSimParams({
          ...DEFAULT_PARAMS,
          alphaDistance: 0.05,
          betaTime: 0.15,
          gammaLateness: 0.80
        });
        break;
      case 'gridlock':
        setSimParams({
          ...DEFAULT_PARAMS,
          trafficMultiplier: 1.50
        });
        break;
      case 'lightvans':
        setSimParams({
          ...DEFAULT_PARAMS,
          capacityWeight: 450,
          capacityVolume: 2.2
        });
        break;
      default:
        setSimParams({ ...DEFAULT_PARAMS });
    }
  };

  // KPI calculations
  const totalDist = activeMetrics?.distance_km?.toFixed(1) || 0;
  const totalTime = activeMetrics?.travel_time_min ? (activeMetrics.travel_time_min / 60).toFixed(1) : 0;
  const onTimeRate = activeMetrics?.on_time_rate_pct?.toFixed(1) || '100.0';
  const lateDeliveries = activeMetrics?.late_deliveries || 0;
  const vanCount = routes.length;

  return (
    <div className="app-shell">
      {/* Top Navigation */}
      <header className="command-navbar">
        <div className="command-navbar-inner">
          <div className="brand-section">
            <div className="brand-badge">Rx</div>
            <div className="brand-info">
              <div className="brand-name">
                <span>PharmaRoute-Opt</span>
                <span className="system-status-pill">
                  <span className="status-dot-pulse" />
                  Live Operational DSS
                </span>
              </div>
              <span className="brand-subtext">Pharmaceutical Last-Mile Operations Research Decision Support</span>
            </div>
          </div>

          <nav className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
              onClick={() => setActiveTab('dispatch')}
            >
              <Route size={14} /> Fleet Map & Dispatch
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('studio')}
            >
              <Sliders size={14} /> Parameter Studio
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'gantt' ? 'active' : ''}`}
              onClick={() => setActiveTab('gantt')}
            >
              <Clock size={14} /> Schedule (Gantt)
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTab('benchmark')}
            >
              <BarChart3 size={14} /> 27-Instance Benchmark
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'robustness' ? 'active' : ''}`}
              onClick={() => setActiveTab('robustness')}
            >
              <ShieldAlert size={14} /> Stress Test (RQ6)
            </button>
          </nav>

          <div className="navbar-right">
            {backendStatus === 'connected' ? (
              <div className="backend-pill connected" title="Python FastAPI Optimization Backend Connected (HiGHS MILP & Nearest-Neighbor)">
                <span className="status-dot-pulse-green" />
                <span>Python OR Engine: Live</span>
              </div>
            ) : (
              <div className="backend-pill offline" title="Run 'python server.py' to enable the Python HiGHS backend">
                <span className="status-dot-orange" />
                <span>Client Engine (Server Offline)</span>
              </div>
            )}
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
              <ExternalLink size={13} /> GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="main-viewport">

        {/* =========================================================================
            TAB 1: FLEET DISPATCH & MAP (PERSISTENT MOUNTED TO PREVENT MAP DISAPPEARING)
           ========================================================================= */}
        <div className="tab-pane" style={{ display: activeTab === 'dispatch' ? 'block' : 'none' }}>
          {/* Unified Controls Bar */}
          <div className="command-control-bar">
            <div className="control-bar-left">
              {/* Day Selector */}
              <div className="control-item">
                <span className="control-item-label">
                  <Calendar size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Operational Day:
                </span>
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
                <span className="control-item-label">
                  <Compass size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Traffic Regime:
                </span>
                <div className="segmented-group">
                  <button 
                    className={`segmented-btn ${scenario === 'optimistic' ? 'active' : ''}`}
                    onClick={() => setScenario('optimistic')}
                  >Clear Traffic</button>
                  <button 
                    className={`segmented-btn ${scenario === 'mostlikely' ? 'active' : ''}`}
                    onClick={() => setScenario('mostlikely')}
                  >Normal Daytime</button>
                  <button 
                    className={`segmented-btn ${scenario === 'pessimistic' ? 'active' : ''}`}
                    onClick={() => setScenario('pessimistic')}
                  >Severe Gridlock (+50%)</button>
                </div>
              </div>

              {/* Routing Engine */}
              <div className="control-item">
                <span className="control-item-label">Algorithm:</span>
                <div className="segmented-group">
                  <button 
                    className={`segmented-btn primary ${engine === 'decomposed' ? 'active primary' : ''}`}
                    onClick={() => setEngine('decomposed')}
                  >⚡ Decomposed MILP</button>
                  <button 
                    className={`segmented-btn ${engine === 'greedy' ? 'active' : ''}`}
                    onClick={() => setEngine('greedy')}
                  >🏃 Greedy Baseline</button>
                </div>
              </div>
            </div>

            <div className="control-bar-right">
              <button 
                className="tweak-btn-pill"
                onClick={() => setActiveTab('studio')}
                title="Tweak payload, volume, shift, or traffic parameters"
              >
                <Sliders size={12} /> Tweak Parameters
              </button>
            </div>
          </div>

          {/* Dynamic Optimization Active Banner */}
          {isCustomParams && (
            <div className="dynamic-optimization-banner">
              <div className="dynamic-banner-left">
                <span className={`live-status-pulse-badge ${dynamicSolution?.is_python_backend ? 'python-badge' : ''}`}>
                  <span className="live-pulse-dot" /> {dynamicSolution?.is_python_backend ? '🐍 PYTHON HiGHS ENGINE' : 'LIVE RE-OPTIMIZED'}
                </span>
                <span className="dynamic-banner-text">
                  Fleet routing re-solved dynamically with custom constraints: 
                  <strong> {simParams.capacityWeight}kg payload</strong> • 
                  <strong> {simParams.capacityVolume}m³ volume</strong> • 
                  <strong> {simParams.maxShiftDuration}m max shift</strong>
                  {Math.abs(simParams.trafficMultiplier - 1.0) > 0.001 && (
                    <> • <strong>{simParams.trafficMultiplier.toFixed(2)}x traffic</strong></>
                  )}
                  {dynamicSolution?.solve_time_sec !== undefined ? (
                    <span className="dynamic-banner-runtime"> (Solved in {dynamicSolution.solve_time_sec}s by {dynamicSolution.solver_engine})</span>
                  ) : dynamicSolution?.metrics?.runtime_ms !== undefined ? (
                    <span className="dynamic-banner-runtime"> (Solved in {dynamicSolution.metrics.runtime_ms}ms)</span>
                  ) : null}
                </span>
              </div>
              <div className="dynamic-banner-right">
                <button 
                  className="reset-pill-btn"
                  onClick={() => applyPreset('balanced')}
                  title="Restore baseline standard benchmark parameters"
                >
                  <RotateCcw size={12} /> Reset to Baseline
                </button>
              </div>
            </div>
          )}

          {/* 5 Sleek KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Fleet Mileage</span>
                <Route size={15} color="#38bdf8" />
              </div>
              <div className="kpi-value-row">
                <span className="kpi-value">{totalDist}</span>
                <span className="kpi-unit">km</span>
              </div>
              <div className="kpi-subtext">
                <span>Avg {routes.length ? ((activeMetrics?.distance_km || 0) / routes.length).toFixed(1) : 0} km per van</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Fleet Transit</span>
                <Clock size={15} color="#a855f7" />
              </div>
              <div className="kpi-value-row">
                <span className="kpi-value">{totalTime}</span>
                <span className="kpi-unit">hrs</span>
              </div>
              <div className="kpi-subtext">
                <span>{activeMetrics?.travel_time_min || 0} total vehicle minutes</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Punctuality (OTR)</span>
                <CheckCircle2 size={15} color="#10b981" />
              </div>
              <div className="kpi-value-row">
                <span className="kpi-value text-emerald">{onTimeRate}%</span>
              </div>
              <div className="kpi-subtext" style={{ color: lateDeliveries === 0 ? '#34d399' : '#fbbf24' }}>
                {lateDeliveries === 0 ? '✓ 100% on schedule' : `⚠️ ${lateDeliveries} clinics delayed`}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Delayed Deliveries</span>
                <AlertTriangle size={15} color={lateDeliveries === 0 ? '#10b981' : '#f43f5e'} />
              </div>
              <div className="kpi-value-row">
                <span className="kpi-value" style={{ color: lateDeliveries === 0 ? '#34d399' : '#fb7185' }}>
                  {lateDeliveries}
                </span>
                <span className="kpi-unit">stops</span>
              </div>
              <div className="kpi-subtext">
                {lateDeliveries === 0 ? 'Zero cold-chain SLA breach' : `${activeMetrics?.total_lateness_min?.toFixed(0) || 0} min total lateness`}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Active Fleet</span>
                <Truck size={15} color="#f59e0b" />
              </div>
              <div className="kpi-value-row">
                <span className="kpi-value">{vanCount}</span>
                <span className="kpi-unit">electric vans</span>
              </div>
              <div className="kpi-subtext">
                <span>Dual knapsack: {simParams.capacityWeight}kg • {simParams.capacityVolume}m³</span>
              </div>
            </div>
          </div>

          {/* Mission Workspace: Leaflet Map + Telemetry */}
          <div className="mission-workspace">
            {/* GIS Map Card */}
            <div className="gis-map-card">
              <div className="gis-map-header">
                <div className="gis-title-box">
                  <MapPin size={15} color="#38bdf8" />
                  <div>
                    <div className="gis-title">Attica Pharmaceutical GIS Network</div>
                    <div className="gis-subtitle">
                      {safeSelectedVehicle === null 
                        ? `Displaying entire fleet network (${routes.length} circuits) across Athens.`
                        : `Inspecting Van ${safeSelectedVehicle + 1} (${activeVan?.driver}) • ${activeVan?.stopsCount} clinic stops.`
                      }
                    </div>
                  </div>
                </div>

                <div className="gis-controls-right">
                  {/* Van Selector Strip */}
                  <div className="van-pill-strip">
                    <button 
                      className={`van-pill-btn ${safeSelectedVehicle === null ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedVehicle(null);
                        setShowBackgroundRoutes(false);
                      }}
                    >
                      All Vans
                    </button>
                    {routes.map((_, idx) => (
                      <button 
                        key={idx}
                        className={`van-pill-btn ${safeSelectedVehicle === idx ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedVehicle(idx);
                          setLastSelectedVehicle(idx);
                        }}
                      >
                        <span className="color-indicator" style={{ backgroundColor: FLEET_COLORS[idx % FLEET_COLORS.length] }} />
                        Van {idx + 1}
                      </button>
                    ))}
                  </div>

                  {/* Theme Toggle */}
                  <button 
                    className="tool-btn"
                    onClick={() => setMapTheme(mapTheme === 'dark' ? 'street' : 'dark')}
                    title="Switch Map Theme (Dark / Street View)"
                  >
                    {mapTheme === 'dark' ? 'Street View' : 'Dark Cartography'}
                  </button>

                  {/* Network / Isolate Van Toggle */}
                  <button 
                    className={`tool-btn ${safeSelectedVehicle !== null ? 'active' : ''}`}
                    onClick={handleToggleNetworkOrIsolate}
                    title={
                      safeSelectedVehicle === null 
                        ? 'Isolate active van and zoom into single route' 
                        : 'Show full fleet network (All Vans)'
                    }
                  >
                    <Layers size={13} /> {safeSelectedVehicle === null ? 'Isolate Van' : 'Show Network'}
                  </button>

                  {/* Fleet Context Toggle (when inspecting a single van) */}
                  {safeSelectedVehicle !== null && (
                    <button 
                      className={`tool-btn ${showBackgroundRoutes ? 'active' : ''}`}
                      onClick={() => setShowBackgroundRoutes(!showBackgroundRoutes)}
                      title={showBackgroundRoutes ? 'Hide background fleet routes' : 'Show background fleet routes'}
                    >
                      {showBackgroundRoutes ? <EyeOff size={13} /> : <Eye size={13} />}
                      {showBackgroundRoutes ? 'Hide Context' : 'Fleet Context'}
                    </button>
                  )}

                  {/* Simulation Button */}
                  <button 
                    className={`tool-btn ${isSimulating ? 'active' : ''}`}
                    onClick={() => setIsSimulating(!isSimulating)}
                    disabled={routes.length === 0}
                    title={
                      isSimulating 
                        ? 'Stop GPS tracking simulation' 
                        : (safeSelectedVehicle === null 
                            ? 'Simulate all fleet vans moving simultaneously' 
                            : `Simulate Van ${safeSelectedVehicle + 1} GPS movement`
                          )
                    }
                  >
                    {isSimulating ? <Square size={13} /> : <Play size={13} />}
                    {isSimulating 
                      ? 'Stop GPS' 
                      : (safeSelectedVehicle === null ? 'Simulate All Vans' : `Track Van ${safeSelectedVehicle + 1}`)
                    }
                  </button>
                </div>
              </div>

              <div className="leaflet-map-wrapper">
                <div ref={mapContainerRef} className="leaflet-container" />
              </div>
            </div>

            {/* Van Telemetry Card */}
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
                    {activeVan ? `Van ${activeVan.id + 1} Mission Profile` : 'Fleet Telemetry Overview'}
                  </span>
                </div>
                <span className="van-badge">
                  {activeVan ? `${activeVan.stopsCount} STOPS` : `${routes.length} VANS ACTIVE`}
                </span>
              </div>

              {activeVan ? (
                <div className="van-telemetry-meta">
                  <div className="driver-strip">
                    <span>Driver: <strong>{activeVan.driver}</strong></span>
                    <span className="system-status-pill">
                      <Thermometer size={11} style={{ display: 'inline' }} /> 3.8°C Nominal
                    </span>
                  </div>
                  <div className="driver-strip" style={{ fontSize: '0.7rem' }}>
                    <span>Model: <strong>{activeVan.vanModel}</strong></span>
                    <span>Zone: <strong>{activeVan.zone}</strong></span>
                  </div>

                  <div className="capacity-bars">
                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Payload Weight</span>
                        <span><strong>{activeVan.weight} kg</strong> / {simParams.capacityWeight} kg ({activeVan.weightPct}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${activeVan.weightPct}%`, backgroundColor: activeVan.color }} />
                      </div>
                    </div>

                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Cargo Volume</span>
                        <span><strong>{activeVan.volume} m³</strong> / {simParams.capacityVolume} m³ ({activeVan.volumePct}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${activeVan.volumePct}%`, backgroundColor: '#38bdf8' }} />
                      </div>
                    </div>

                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Shift Duration</span>
                        <span><strong>{activeVan.shiftMin} min</strong> / {simParams.maxShiftDuration} min ({activeVan.shiftPct}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${activeVan.shiftPct}%`, backgroundColor: '#10b981' }} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="van-telemetry-meta">
                  <div className="driver-strip">
                    <span>Fleet Network: <strong>{vehicleStats.length} Vans Active</strong></span>
                    <span className="system-status-pill">
                      <Thermometer size={11} style={{ display: 'inline' }} /> 100% Cold-Chain Nominal
                    </span>
                  </div>
                  <div className="driver-strip" style={{ fontSize: '0.7rem' }}>
                    <span>Total Facilities: <strong>{fleetSummary?.totalStops || 0} Clinics Scheduled</strong></span>
                    <span>Depot Hub: <strong>Athens Hub (08:00 AM)</strong></span>
                  </div>

                  <div className="capacity-bars">
                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Fleet Payload Loading</span>
                        <span><strong>{fleetSummary?.totalWeight || 0} kg</strong> / {fleetSummary?.totalCapWeight || 0} kg ({fleetSummary?.weightPct || 0}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${fleetSummary?.weightPct || 0}%`, backgroundColor: '#00e5ff' }} />
                      </div>
                    </div>

                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Fleet Volume Loading</span>
                        <span><strong>{fleetSummary?.totalVolume || 0} m³</strong> / {fleetSummary?.totalCapVolume || 0} m³ ({fleetSummary?.volumePct || 0}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${fleetSummary?.volumePct || 0}%`, backgroundColor: '#a855f7' }} />
                      </div>
                    </div>

                    <div className="bar-row">
                      <div className="bar-labels">
                        <span>Fleet Average Shift</span>
                        <span><strong>{fleetSummary?.avgShift || 0} min avg</strong> / {simParams.maxShiftDuration} min limit ({fleetSummary?.shiftPct || 0}%)</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${fleetSummary?.shiftPct || 0}%`, backgroundColor: '#10b981' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Turn-by-Turn Delivery Timeline OR Fleet Circuits Roster */}
              <div className="tour-timeline-wrapper">
                {activeVan ? (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '4px 6px' }}>
                      CHRONOLOGICAL CLINIC STOPS (CLICK TO LOCATE ON MAP)
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
                            <span>Window [{step.eat}-{step.lat}]m</span>
                            <span>•</span>
                            <span>{step.weight} kg</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', padding: '4px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>ACTIVE FLEET CIRCUITS (CLICK TO INSPECT)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#38bdf8' }}>{vehicleStats.length} VANS</span>
                    </div>

                    <div className="fleet-circuit-list">
                      {vehicleStats.map(v => (
                        <div 
                          key={v.id}
                          className="fleet-circuit-card"
                          onClick={() => {
                            setSelectedVehicle(v.id);
                            setLastSelectedVehicle(v.id);
                          }}
                          title={`Click to inspect Van ${v.id + 1} (${v.driver})`}
                        >
                          <div className="fleet-circuit-top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="color-indicator" style={{ backgroundColor: v.color, width: '10px', height: '10px' }} />
                              <strong style={{ color: '#ffffff', fontSize: '0.82rem' }}>Van {v.id + 1}</strong>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>• {v.driver}</span>
                            </div>
                            <span className="van-badge" style={{ color: v.color }}>
                              {v.stopsCount} stops
                            </span>
                          </div>

                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {v.zone}
                          </div>

                          <div className="fleet-circuit-meta">
                            <span>Payload: <strong>{v.weight} kg ({v.weightPct}%)</strong></span>
                            <span>•</span>
                            <span>Volume: <strong>{v.volume} m³</strong></span>
                            <span>•</span>
                            <span>Shift: <strong>{v.shiftMin}m</strong></span>
                          </div>

                          <div className="bar-track" style={{ height: '3px', marginTop: '3px' }}>
                            <div className="bar-fill" style={{ width: `${v.weightPct}%`, backgroundColor: v.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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
                  Pharmaceutical Delivery Stop Manifest
                </span>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>({filteredManifest.length} destinations)</span>
              </div>

              <div className="search-input-box">
                <Search size={13} color="#64748b" />
                <input 
                  type="text" 
                  placeholder="Search clinic or hospital..."
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
                    <th>Pharmaceutical Cargo</th>
                    <th>Time Window</th>
                    <th>Weight</th>
                    <th>Volume</th>
                    <th>Service Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredManifest.slice(0, 30).map((row, idx) => (
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

        {/* =========================================================================
            TAB 2: PARAMETER STUDIO & INTERACTIVE FLEET SIMULATOR (NEW FEATURE)
           ========================================================================= */}
        <div className="tab-pane" style={{ display: activeTab === 'studio' ? 'block' : 'none' }}>
          <div className="page-stack">
            <div className="header-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 className="page-title" style={{ margin: 0 }}>Interactive Parameter Studio & Fleet Simulator</h2>
                    {isCustomParams ? (
                      <span className="solver-active-tag">
                        <Zap size={12} /> Active ({dynamicSolution?.metrics?.runtime_ms || 1.2}ms)
                      </span>
                    ) : (
                      <span className="solver-baseline-tag">
                        Baseline Benchmark
                      </span>
                    )}
                  </div>
                  <p className="page-desc">
                    Tweak physical van capacities, shift limits, objective weights, and traffic congestion shocks to evaluate operational feasibility in real-time.
                  </p>
                </div>
                <button 
                  className={`reset-btn ${isCustomParams ? 'highlight' : ''}`}
                  onClick={() => applyPreset('balanced')}
                >
                  <RotateCcw size={13} /> Reset Defaults
                </button>
              </div>

              {/* Strategy Presets Strip */}
              <div className="preset-bar">
                <span className="preset-title"><Sparkles size={13} color="#fbbf24" /> Instant Scenario Presets:</span>
                <button className="preset-pill" onClick={() => applyPreset('balanced')}>
                  ⚖️ Balanced Standard
                </button>
                <button className="preset-pill" onClick={() => applyPreset('green')}>
                  🌿 Eco-Green (Min Fuel)
                </button>
                <button className="preset-pill" onClick={() => applyPreset('urgent')}>
                  🏥 Hospital SLA (Zero Lateness)
                </button>
                <button className="preset-pill" onClick={() => applyPreset('gridlock')}>
                  🚨 Traffic Gridlock Shock (+50%)
                </button>
                <button className="preset-pill" onClick={() => applyPreset('lightvans')}>
                  ⚡ Compact Electric Fleet
                </button>
              </div>

              {/* Python Backend Optimization Command Bar */}
              <div className="backend-control-banner">
                <div className="backend-banner-status">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`engine-dot ${backendStatus === 'connected' ? 'active' : 'warn'}`} />
                    <span className="engine-name-text">
                      {backendStatus === 'connected' ? (
                        <><strong>Python Backend Online:</strong> Connected to HiGHS MILP / PuLP Engine</>
                      ) : (
                        <><strong>Python Server Offline:</strong> Run <code>python server.py</code> in terminal for HiGHS MILP</>
                      )}
                    </span>
                  </div>
                  {solveNotification && (
                    <span className="solve-notify-badge">
                      <CheckCircle2 size={12} color="#34d399" /> {solveNotification}
                    </span>
                  )}
                </div>

                <div className="backend-banner-actions">
                  <label className="auto-toggle-check" title="Automatically re-run optimization when adjusting parameters">
                    <input 
                      type="checkbox" 
                      checked={autoOptimize} 
                      onChange={e => setAutoOptimize(e.target.checked)} 
                    />
                    <span>Live Auto-Solve</span>
                  </label>

                  <button 
                    className="run-python-opt-btn"
                    onClick={() => triggerPythonOptimization()}
                    disabled={isSolving}
                    title="Execute the full Python Operations Research algorithm with current parameters"
                  >
                    {isSolving ? (
                      <>
                        <RotateCcw size={13} className="spin-icon" /> Solving via Python...
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" /> Run Python Optimization ({engine === 'decomposed' ? 'HiGHS MILP' : 'Greedy'})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Studio 2-Column Grid */}
            <div className="studio-layout">
              {/* Left Column: Parameter Controls */}
              <div className="studio-controls-card">
                <div className="card-section-title">
                  <Sliders size={15} color="#38bdf8" /> Physical & Operational Constraints
                </div>

                {/* Payload Capacity Slider */}
                <div className="param-slider-group">
                  <div className="param-header">
                    <span className="param-name">Van Payload Limit ($C_w$)</span>
                    <span className="param-val">{simParams.capacityWeight} kg</span>
                  </div>
                  <input 
                    type="range"
                    min="300"
                    max="1000"
                    step="25"
                    value={simParams.capacityWeight}
                    onChange={e => setSimParams({ ...simParams, capacityWeight: Number(e.target.value) })}
                    className="slider-input"
                  />
                  <div className="slider-range-labels">
                    <span>300 kg (Light Van)</span>
                    <span>Standard: 600 kg</span>
                    <span>1,000 kg (Heavy)</span>
                  </div>
                </div>

                {/* Cargo Volume Capacity Slider */}
                <div className="param-slider-group">
                  <div className="param-header">
                    <span className="param-name">Cargo Volume Limit ($C_v$)</span>
                    <span className="param-val">{simParams.capacityVolume.toFixed(1)} m³</span>
                  </div>
                  <input 
                    type="range"
                    min="1.5"
                    max="6.0"
                    step="0.1"
                    value={simParams.capacityVolume}
                    onChange={e => setSimParams({ ...simParams, capacityVolume: Number(e.target.value) })}
                    className="slider-input"
                  />
                  <div className="slider-range-labels">
                    <span>1.5 m³</span>
                    <span>Standard: 3.0 m³</span>
                    <span>6.0 m³</span>
                  </div>
                </div>

                {/* Shift Cutoff Duration Slider */}
                <div className="param-slider-group">
                  <div className="param-header">
                    <span className="param-name">Driver Max Shift Duration ($T_&#123;\max&#125;$)</span>
                    <span className="param-val">{simParams.maxShiftDuration} min ({(simParams.maxShiftDuration / 60).toFixed(1)} hrs)</span>
                  </div>
                  <input 
                    type="range"
                    min="240"
                    max="480"
                    step="15"
                    value={simParams.maxShiftDuration}
                    onChange={e => setSimParams({ ...simParams, maxShiftDuration: Number(e.target.value) })}
                    className="slider-input"
                  />
                  <div className="slider-range-labels">
                    <span>4 hrs (240m)</span>
                    <span>Standard: 6 hrs (360m)</span>
                    <span>8 hrs (480m)</span>
                  </div>
                </div>

                {/* Congestion Multiplier */}
                <div className="param-slider-group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div className="param-header">
                    <span className="param-name">Stochastic Traffic Congestion Surge</span>
                    <span className="param-val" style={{ color: simParams.trafficMultiplier > 1.2 ? '#f87171' : '#38bdf8' }}>
                      {simParams.trafficMultiplier.toFixed(2)}x Delay Factor
                    </span>
                  </div>
                  <input 
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.05"
                    value={simParams.trafficMultiplier}
                    onChange={e => setSimParams({ ...simParams, trafficMultiplier: Number(e.target.value) })}
                    className="slider-input"
                  />
                  <div className="slider-range-labels">
                    <span>1.0x (Normal)</span>
                    <span>1.5x (+50% Gridlock)</span>
                    <span>2.0x (Severe Shock)</span>
                  </div>
                </div>

                {/* Multi-Objective Priority Weights */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div className="card-section-title" style={{ marginBottom: '12px' }}>
                    <Gauge size={15} color="#a855f7" /> Objective Weights ($Z = \alpha D + \beta T + \gamma L$)
                  </div>

                  <div className="weight-sliders-row">
                    <div className="weight-col">
                      <span className="weight-tag">α Distance: {(simParams.alphaDistance * 100).toFixed(0)}%</span>
                      <input 
                        type="range" 
                        min="0.0" 
                        max="1.0" 
                        step="0.05" 
                        value={simParams.alphaDistance}
                        onChange={e => setSimParams({ ...simParams, alphaDistance: Number(e.target.value) })}
                        className="slider-input"
                      />
                    </div>
                    <div className="weight-col">
                      <span className="weight-tag">β Transit: {(simParams.betaTime * 100).toFixed(0)}%</span>
                      <input 
                        type="range" 
                        min="0.0" 
                        max="1.0" 
                        step="0.05" 
                        value={simParams.betaTime}
                        onChange={e => setSimParams({ ...simParams, betaTime: Number(e.target.value) })}
                        className="slider-input"
                      />
                    </div>
                    <div className="weight-col">
                      <span className="weight-tag">γ SLA Punctuality: {(simParams.gammaLateness * 100).toFixed(0)}%</span>
                      <input 
                        type="range" 
                        min="0.0" 
                        max="1.0" 
                        step="0.05" 
                        value={simParams.gammaLateness}
                        onChange={e => setSimParams({ ...simParams, gammaLateness: Number(e.target.value) })}
                        className="slider-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Real-Time Fleet Impact Simulator */}
              <div className="studio-impact-card">
                <div className="card-section-title">
                  <Activity size={15} color="#10b981" /> Live Simulation Outcome & Feasibility Check
                </div>

                <div className="solver-details-box">
                  <div>
                    <span>Active Solver: </span>
                    <strong>{dynamicSolution?.solver_engine || (engine === 'decomposed' ? 'Decomposed MILP (HiGHS)' : 'Greedy Nearest-Neighbor')}</strong>
                  </div>
                  <div>
                    <span>Runtime: </span>
                    <strong>
                      {dynamicSolution?.solve_time_sec !== undefined 
                        ? `${dynamicSolution.solve_time_sec}s` 
                        : `${dynamicSolution?.metrics?.runtime_ms || 1.2}ms`}
                    </strong>
                    {dynamicSolution?.is_python_backend && (
                      <span style={{ color: '#34d399', marginLeft: '6px' }}>(Python Backend)</span>
                    )}
                  </div>
                </div>

                {/* Feasibility Alert */}
                {simulationResults?.isFeasible ? (
                  <div className="feasibility-banner feasible">
                    <CheckCircle2 size={16} color="#34d399" />
                    <div>
                      <strong>All Constraints Feasible:</strong> Fleet operates safely within cargo knapsack limits and shift cutoffs.
                    </div>
                  </div>
                ) : (
                  <div className="feasibility-banner violation">
                    <AlertTriangle size={16} color="#fb7185" />
                    <div>
                      <strong>Operational Constraint Overrun:</strong> 
                      {simulationResults?.overloadedVehicles > 0 && ` ${simulationResults.overloadedVehicles} vans exceed cargo capacity.`}
                      {simulationResults?.shiftOverrunVehicles > 0 && ` ${simulationResults.shiftOverrunVehicles} drivers exceed ${simParams.maxShiftDuration}m shift cutoff.`}
                    </div>
                  </div>
                )}

                {/* Simulation KPI Grid */}
                <div className="sim-kpi-grid">
                  <div className="sim-kpi-box">
                    <span className="sim-kpi-label">Punctuality (OTR)</span>
                    <span className="sim-kpi-val" style={{ color: (simulationResults?.simOnTimeRate || 0) >= 95 ? '#34d399' : '#fbbf24' }}>
                      {simulationResults?.simOnTimeRate}%
                    </span>
                    <span className="sim-kpi-delta">
                      {simulationResults?.simLateDeliveries || 0} delayed stops
                      {isCustomParams && simulationResults?.deltaLate !== undefined && simulationResults.deltaLate !== 0 && (
                        <span className={simulationResults.deltaLate < 0 ? 'delta-good' : 'delta-bad'}>
                          {' '}({simulationResults.deltaLate > 0 ? `+${simulationResults.deltaLate}` : simulationResults.deltaLate} vs base)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="sim-kpi-box">
                    <span className="sim-kpi-label">Transit Time Under Traffic</span>
                    <span className="sim-kpi-val">
                      {simulationResults ? (simulationResults.simTravelTime / 60).toFixed(1) : 0} hrs
                    </span>
                    <span className="sim-kpi-delta">
                      {simulationResults?.simTravelTime} mins
                      {isCustomParams && simulationResults?.deltaTime !== undefined && simulationResults.deltaTime !== 0 && (
                        <span className={simulationResults.deltaTime < 0 ? 'delta-good' : 'delta-bad'}>
                          {' '}({simulationResults.deltaTime > 0 ? `+${simulationResults.deltaTime}m` : `${simulationResults.deltaTime}m`} vs base)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="sim-kpi-box">
                    <span className="sim-kpi-label">Active Fleet Size</span>
                    <span className="sim-kpi-val">
                      {simulationResults?.estVehicles} vans
                    </span>
                    <span className="sim-kpi-delta">
                      {isCustomParams && simulationResults?.deltaVehicles !== undefined && simulationResults.deltaVehicles !== 0 ? (
                        <span className={simulationResults.deltaVehicles < 0 ? 'delta-good' : 'delta-warn'}>
                          {simulationResults.deltaVehicles > 0 ? `+${simulationResults.deltaVehicles}` : simulationResults.deltaVehicles} vans vs base
                        </span>
                      ) : (
                        <span>Peak payload: {simulationResults?.maxWeightObserved} kg</span>
                      )}
                    </span>
                  </div>

                  <div className="sim-kpi-box">
                    <span className="sim-kpi-label">Fleet Operating Cost</span>
                    <span className="sim-kpi-val text-cyan">
                      €{simulationResults?.totalCost}
                    </span>
                    <span className="sim-kpi-delta">
                      {isCustomParams && simulationResults?.deltaCost !== undefined && simulationResults.deltaCost !== 0 ? (
                        <span className={simulationResults.deltaCost < 0 ? 'delta-good' : 'delta-warn'}>
                          {simulationResults.deltaCost > 0 ? `+€${simulationResults.deltaCost}` : `-€${Math.abs(simulationResults.deltaCost)}`} vs base
                        </span>
                      ) : (
                        <span>Power + Driver Labor</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Environmental & Carbon Footprint Card */}
                <div className="eco-stats-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Fuel size={14} color="#10b981" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                      Green Cold-Chain Logistics Footprint
                    </span>
                  </div>
                  <div className="eco-row">
                    <span>Electric Fleet Emissions:</span>
                    <strong>{simulationResults?.co2ElectricKg} kg CO₂</strong>
                  </div>
                  <div className="eco-row">
                    <span>Emissions Avoided vs Diesel Vans:</span>
                    <strong style={{ color: '#34d399' }}>-{simulationResults?.co2SavingsKg} kg CO₂ (-84%)</strong>
                  </div>
                </div>

                {/* Return to Map Action */}
                <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                  <button 
                    className="apply-studio-btn"
                    onClick={() => setActiveTab('dispatch')}
                  >
                    View Routes on GIS Map →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            TAB 3: SHIFT SCHEDULE GANTT TIMELINE
           ========================================================================= */}
        <div className="tab-pane" style={{ display: activeTab === 'gantt' ? 'block' : 'none' }}>
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">Fleet Dispatch Shift Schedule (Gantt Visualization)</h2>
              <p className="page-desc">
                Visual timeline showing all delivery vans across the 6-hour shift (08:00 AM to 14:00 PM / 0 to 360 minutes). 
                Each block represents a hospital stop plotted at its scheduled arrival time within its customer time window.
              </p>
            </div>

            <div className="gantt-panel">
              <div className="gantt-header">
                <span className="gantt-title">
                  <Clock size={15} color="#38bdf8" /> {simParams.maxShiftDuration}-Minute Shift Timeline (0 to {simParams.maxShiftDuration}m)
                </span>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  {isCustomParams ? `Dynamic Schedule (${simParams.maxShiftDuration}m cutoff)` : 'All vans return to Central Hub prior to 14:00 PM shift deadline'}
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
                  const maxShift = simParams.maxShiftDuration || 360;
                  let curTime = 15;

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
                          const arrMin = dynamicSolution?.routeMetrics?.[vIdx]?.arrival_times?.[sIdx + 1] ?? curTime;
                          const isLate = ord.lat && arrMin > ord.lat;
                          const leftPct = Math.min((arrMin / maxShift) * 100, 96);
                          const widthPct = Math.max(((ord.service_time || 8) / maxShift) * 100, 2.5);

                          return (
                            <div 
                              key={sIdx}
                              className="gantt-block"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: isLate ? '#f43f5e' : vColor,
                                border: isLate ? '1px solid #ffffff' : 'none'
                              }}
                              title={`Stop #${sIdx + 1}: Node ${node} • ETA +${Math.round(arrMin)}m • Window [${ord.eat}-${ord.lat}]m${isLate ? ` (⚠️ LATE by ${Math.round(arrMin - ord.lat)}m)` : ' (✓ On Time)'}`}
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
        </div>

        {/* =========================================================================
            TAB 4: 27-INSTANCE ACADEMIC BENCHMARK (RQ5)
           ========================================================================= */}
        <div className="tab-pane" style={{ display: activeTab === 'benchmark' ? 'block' : 'none' }}>
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">27-Instance Academic Benchmark (RQ5)</h2>
              <p className="page-desc">
                Comprehensive evaluation across all 27 instances (9 days × 3 traffic regimes). 
                Proves cluster-first Decomposed MILP superiority over the Greedy baseline across 1,938 real-world clinic stops in Athens.
              </p>
            </div>

            <div className="callout-banner">
              <div>📊</div>
              <div>
                <strong>Empirical Findings:</strong> Decomposed MILP achieves an average <strong>97.58% On-Time Delivery Rate</strong> vs <strong>94.07% for Greedy</strong> (+3.51% punctuality advantage), 
                slashing late hospital deliveries by <strong>58.9% (48 late vs 117 late)</strong> with an average solve time of <strong>46.2 seconds</strong>.
              </div>
            </div>

            <div className="manifest-panel">
              <div className="table-header">
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff' }}>
                  27-Instance Benchmark Summary Table
                </span>
                <div className="segmented-group">
                  <button 
                    className={`segmented-btn ${benchmarkFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setBenchmarkFilter('all')}
                  >All Scenarios</button>
                  <button 
                    className={`segmented-btn ${benchmarkFilter === 'optimistic' ? 'active' : ''}`}
                    onClick={() => setBenchmarkFilter('optimistic')}
                  >Optimistic</button>
                  <button 
                    className={`segmented-btn ${benchmarkFilter === 'mostlikely' ? 'active' : ''}`}
                    onClick={() => setBenchmarkFilter('mostlikely')}
                  >Most-Likely</button>
                  <button 
                    className={`segmented-btn ${benchmarkFilter === 'pessimistic' ? 'active' : ''}`}
                    onClick={() => setBenchmarkFilter('pessimistic')}
                  >Pessimistic</button>
                </div>
              </div>

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
                    {(pharmaData.benchmarks || [])
                      .filter(r => benchmarkFilter === 'all' || r.scenario === benchmarkFilter)
                      .map((r, idx) => (
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
        </div>

        {/* =========================================================================
            TAB 5: ROBUSTNESS STRESS TEST & GRIDLOCK SHOCK (RQ6)
           ========================================================================= */}
        <div className="tab-pane" style={{ display: activeTab === 'robustness' ? 'block' : 'none' }}>
          <div className="page-stack">
            <div className="header-card">
              <h2 className="page-title">Traffic Robustness Stress Simulation (RQ6) & Scalability Limits</h2>
              <p className="page-desc">
                Stress-test evaluating route resilience when plans optimized under normal traffic are executed during severe gridlock (+50% delays), 
                and empirical evaluation of monolithic MILP computational limits.
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
                      <th>Greedy Gridlock</th>
                      <th>Greedy Drop</th>
                      <th>Decomp Planned</th>
                      <th>Decomp Gridlock</th>
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
        </div>

      </main>
    </div>
  );
}
