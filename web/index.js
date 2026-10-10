/**
 * PharmaRoute-Opt: High-End Operations Research Web Application
 * Vanilla JS Client Engine
 */

(function() {
    'use strict';

    // ---------------------------------------------------------------------------
    // App State & Data References
    // ---------------------------------------------------------------------------
    const data = window.PHARMA_DATA || {};
    let currentDay = 1;
    let currentScenario = 'mostlikely';
    let currentEngine = 'decomposed';
    let selectedVanIndex = 0;
    let vehicleFilter = 'all';
    let isSimulating = false;
    let simProgress = 0;
    let simAnimationId = null;

    // Charts storage to allow responsive updates
    const chartInstances = {};

    // ---------------------------------------------------------------------------
    // DOM Elements Cache
    // ---------------------------------------------------------------------------
    const daySelect = document.getElementById('daySelect');
    const trafficControl = document.getElementById('trafficControl');
    const engineCards = document.querySelectorAll('.engine-card');
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const vanSelect = document.getElementById('vanSelect');
    const vehicleFilterSelect = document.getElementById('vehicleFilter');
    const playSimBtn = document.getElementById('playSimBtn');
    const routeCanvas = document.getElementById('routeCanvas');
    const mapTooltip = document.getElementById('mapTooltip');
    const guideModalBtn = document.getElementById('guideModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const guideModal = document.getElementById('guideModal');

    // ---------------------------------------------------------------------------
    // Palette Definitions
    // ---------------------------------------------------------------------------
    const VEHICLE_COLORS = [
        '#6366f1', '#06b6d4', '#10b981', '#f59e0b', 
        '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', 
        '#f97316', '#a855f7'
    ];

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------
    function init() {
        bindEvents();
        updateDashboard();
        initBenchmarkTab();
        initMultiObjTab();
        initRobustnessTab();
        initScalabilityTab();
    }

    // ---------------------------------------------------------------------------
    // Event Listeners
    // ---------------------------------------------------------------------------
    function bindEvents() {
        // Day selector
        daySelect.addEventListener('change', (e) => {
            currentDay = parseInt(e.target.value, 10);
            selectedVanIndex = 0;
            vehicleFilter = 'all';
            updateDashboard();
        });

        // Traffic Regime buttons
        trafficControl.addEventListener('click', (e) => {
            const btn = e.target.closest('.seg-btn');
            if (!btn) return;
            trafficControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentScenario = btn.dataset.scenario;
            updateDashboard();
        });

        // Engine Cards
        engineCards.forEach(card => {
            card.addEventListener('click', () => {
                engineCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                currentEngine = card.dataset.engine;
                updateDashboard();
            });
        });

        // Tab Navigation
        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.tab;
                navTabs.forEach(t => t.classList.remove('active'));
                tabPanels.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById(targetId);
                if (panel) panel.classList.add('active');

                // Trigger resize for Chart.js charts
                setTimeout(() => {
                    Object.values(chartInstances).forEach(chart => {
                        if (chart) chart.resize();
                    });
                }, 50);
            });
        });

        // Van Selector
        vanSelect.addEventListener('change', (e) => {
            selectedVanIndex = parseInt(e.target.value, 10);
            updateVehicleInspector();
        });

        // Vehicle Filter on Canvas Map
        vehicleFilterSelect.addEventListener('change', (e) => {
            vehicleFilter = e.target.value;
            drawRouteCanvas();
        });

        // Route Simulation Button
        playSimBtn.addEventListener('click', toggleSimulation);

        // Canvas Tooltip Tracking
        routeCanvas.addEventListener('mousemove', handleCanvasHover);
        routeCanvas.addEventListener('mouseleave', () => {
            mapTooltip.classList.add('hidden');
        });

        // Modal Controls
        guideModalBtn.addEventListener('click', () => guideModal.classList.remove('hidden'));
        closeModalBtn.addEventListener('click', () => guideModal.classList.add('hidden'));
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) guideModal.classList.add('hidden');
        });

        // CSV Export Button
        const dlBtn = document.getElementById('downloadBenchmarkCsv');
        if (dlBtn) dlBtn.addEventListener('click', exportBenchmarkCsv);

        // Window resize
        window.addEventListener('resize', () => {
            drawRouteCanvas();
        });
    }

    // ---------------------------------------------------------------------------
    // Dashboard State Update
    // ---------------------------------------------------------------------------
    function updateDashboard() {
        const runKey = `day_${currentDay}_${currentScenario}`;
        const runEntry = data.routes ? data.routes[runKey] : null;

        if (!runEntry) {
            console.warn(`No precomputed data found for ${runKey}`);
            return;
        }

        const activeMetrics = runEntry[currentEngine];
        const altEngine = currentEngine === 'decomposed' ? 'greedy' : 'decomposed';
        const altMetrics = runEntry[altEngine];
        const altLabel = currentEngine === 'decomposed' ? 'Greedy' : 'Decomp';

        // 1. Update 5 Hero KPIs
        const distVal = activeMetrics.distance_km;
        const timeVal = activeMetrics.travel_time_min;
        const otrVal = activeMetrics.on_time_rate_pct;
        const lateVal = activeMetrics.late_deliveries;
        const vehVal = activeMetrics.vehicles;

        const deltaDist = distVal - altMetrics.distance_km;
        const deltaOtr = otrVal - altMetrics.on_time_rate_pct;
        const deltaLate = lateVal - altMetrics.late_deliveries;

        document.getElementById('kpiDist').textContent = distVal.toFixed(1);
        const kpiDistDelta = document.getElementById('kpiDistDelta');
        kpiDistDelta.textContent = `${deltaDist >= 0 ? '+' : ''}${deltaDist.toFixed(1)} km vs ${altLabel}`;
        kpiDistDelta.className = `kpi-badge ${deltaDist > 0 ? 'negative' : 'positive'}`;

        document.getElementById('kpiTime').textContent = Math.round(timeVal);
        document.getElementById('kpiTimeSub').textContent = `${(timeVal / 60).toFixed(1)} vehicle-hours total`;

        const kpiOtr = document.getElementById('kpiOtr');
        kpiOtr.textContent = otrVal.toFixed(1);
        kpiOtr.style.color = otrVal >= 98 ? '#34d399' : (otrVal >= 92 ? '#fbbf24' : '#f87171');

        const kpiOtrDelta = document.getElementById('kpiOtrDelta');
        kpiOtrDelta.textContent = `${deltaOtr >= 0 ? '+' : ''}${deltaOtr.toFixed(1)}% vs ${altLabel}`;
        kpiOtrDelta.className = `kpi-badge ${deltaOtr >= 0 ? 'positive' : 'negative'}`;

        const kpiLate = document.getElementById('kpiLate');
        kpiLate.textContent = lateVal;
        kpiLate.style.color = lateVal === 0 ? '#34d399' : '#f87171';

        const kpiLateDelta = document.getElementById('kpiLateDelta');
        kpiLateDelta.textContent = `${deltaLate >= 0 ? '+' : ''}${deltaLate} late vs ${altLabel}`;
        kpiLateDelta.className = `kpi-badge ${deltaLate <= 0 ? 'positive' : 'negative'}`;

        document.getElementById('kpiVeh').textContent = vehVal;
        const ordersCount = runEntry.num_orders;
        document.getElementById('kpiVehSub').textContent = `${(ordersCount / Math.max(vehVal, 1)).toFixed(1)} stops / van`;

        // 2. Populate Vehicle Selectors
        populateVehicleSelectors(activeMetrics.routes);

        // 3. Update Vehicle Inspector & Gauges
        updateVehicleInspector();

        // 4. Render Spatial Canvas
        drawRouteCanvas();
    }

    // ---------------------------------------------------------------------------
    // Vehicle Selectors Population
    // ---------------------------------------------------------------------------
    function populateVehicleSelectors(routes) {
        // Filter dropdown on map
        vehicleFilterSelect.innerHTML = '<option value="all">Show All Vehicles</option>';
        vanSelect.innerHTML = '';

        routes.forEach((route, idx) => {
            const stopCount = route.filter(n => n !== 0).length;
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `Van ${idx + 1} (${stopCount} stops)`;
            vanSelect.appendChild(opt);

            const mapOpt = document.createElement('option');
            mapOpt.value = idx;
            mapOpt.textContent = `Van ${idx + 1} only`;
            vehicleFilterSelect.appendChild(mapOpt);
        });

        if (selectedVanIndex >= routes.length) {
            selectedVanIndex = 0;
        }
        vanSelect.value = selectedVanIndex;
    }

    // ---------------------------------------------------------------------------
    // Vehicle Inspector & Schedule Table
    // ---------------------------------------------------------------------------
    function updateVehicleInspector() {
        const runKey = `day_${currentDay}_${currentScenario}`;
        const runEntry = data.routes ? data.routes[runKey] : null;
        if (!runEntry) return;

        const activeRoutes = runEntry[currentEngine].routes;
        if (!activeRoutes || !activeRoutes[selectedVanIndex]) return;

        const route = activeRoutes[selectedVanIndex];
        const customerStops = route.filter(n => n !== 0);
        const dayOrders = data.orders ? data.orders[String(currentDay)] : {};

        let totW = 0;
        let totV = 0;
        customerStops.forEach(node => {
            const ord = dayOrders[String(node)];
            if (ord) {
                totW += ord.weight;
                totV += ord.volume;
            }
        });

        // Compute route duration based on stop sequence
        // Service time + approximate travel time
        let rDur = 0;
        let rTrav = 0;
        customerStops.forEach(node => {
            const ord = dayOrders[String(node)];
            if (ord) rDur += ord.service_time;
        });

        // Estimate transit duration proportionally to total fleet travel time
        const totalFleetTime = runEntry[currentEngine].travel_time_min;
        const vanTransitEst = (totalFleetTime / activeRoutes.length);
        rDur += vanTransitEst;

        // Update Gauges
        const wPct = (totW / 600.0) * 100;
        const vPct = (totV / 3.0) * 100;
        const durPct = (rDur / 360.0) * 100;

        document.getElementById('gaugeWeightVal').textContent = `${totW.toFixed(1)} / 600 kg (${wPct.toFixed(1)}%)`;
        document.getElementById('gaugeWeightBar').style.width = `${Math.min(wPct, 100)}%`;

        document.getElementById('gaugeVolumeVal').textContent = `${totV.toFixed(2)} / 3.00 m³ (${vPct.toFixed(1)}%)`;
        document.getElementById('gaugeVolumeBar').style.width = `${Math.min(vPct, 100)}%`;

        document.getElementById('gaugeShiftVal').textContent = `${rDur.toFixed(0)} / 360 min (${durPct.toFixed(1)}%)`;
        const shiftBar = document.getElementById('gaugeShiftBar');
        shiftBar.style.width = `${Math.min(durPct, 100)}%`;
        shiftBar.style.background = durPct > 100 ? '#f43f5e' : 'linear-gradient(90deg, #6366f1, #38bdf8)';

        // Stop Sequence Pills
        const flowContainer = document.getElementById('stopSequenceFlow');
        flowContainer.innerHTML = '';
        route.forEach((node, idx) => {
            const pill = document.createElement('span');
            pill.className = `seq-pill ${node === 0 ? 'depot-pill' : ''}`;
            pill.textContent = node === 0 ? '🏥 DEPOT' : `Stop ${node}`;
            flowContainer.appendChild(pill);

            if (idx < route.length - 1) {
                const arrow = document.createElement('span');
                arrow.style.color = '#64748b';
                arrow.style.fontSize = '0.75rem';
                arrow.textContent = '➔';
                flowContainer.appendChild(arrow);
            }
        });

        // Schedule Table
        updateScheduleTable(route, dayOrders);
    }

    // ---------------------------------------------------------------------------
    // Schedule Table Builder
    // ---------------------------------------------------------------------------
    function updateScheduleTable(route, dayOrders) {
        const tbody = document.getElementById('scheduleTableBody');
        tbody.innerHTML = '';

        let currTime = 0;
        let seq = 1;

        route.forEach((node, idx) => {
            if (node === 0) {
                if (idx > 0) {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>#${seq++}</td>
                        <td><b>🏥 Central Pharmacy Depot</b></td>
                        <td>${currTime.toFixed(1)}</td>
                        <td>[0 - 360] min</td>
                        <td>--</td>
                        <td><span class="status-tag tag-ontime">Tour Terminated</span></td>
                        <td>--</td>
                        <td>--</td>
                    `;
                    tbody.appendChild(row);
                }
                return;
            }

            const ord = dayOrders[String(node)] || { weight: 0, volume: 0, service_time: 5, eat: 0, lat: 240 };
            
            // Advance time
            currTime += 12.0; // average hop transit
            const arrT = Math.max(currTime, ord.eat);
            const lateDur = Math.max(0, arrT - ord.lat);
            const depT = arrT + ord.service_time;
            currTime = depT;

            const isLate = lateDur > 0;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>#${seq++}</td>
                <td><b>Pharmacy Node ${node}</b></td>
                <td>${arrT.toFixed(1)}</td>
                <td>[${ord.eat.toFixed(0)} - ${ord.lat.toFixed(0)}] min</td>
                <td>${depT.toFixed(1)}</td>
                <td><span class="status-tag ${isLate ? 'tag-late' : 'tag-ontime'}">${isLate ? `⚠️ Late (+${lateDur.toFixed(0)}m)` : '✅ On-Time'}</span></td>
                <td>${ord.weight.toFixed(1)} kg</td>
                <td>${ord.volume.toFixed(3)} m³</td>
            `;
            tbody.appendChild(row);
        });
    }

    // ---------------------------------------------------------------------------
    // Canvas Spatial Route Network Renderer
    // ---------------------------------------------------------------------------
    let activeNodesOnCanvas = [];

    function drawRouteCanvas() {
        const canvas = routeCanvas;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        // Clear canvas with dark gradient
        ctx.clearRect(0, 0, width, height);
        const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(1, '#080c14');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Draw subtle grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        const runKey = `day_${currentDay}_${currentScenario}`;
        const runEntry = data.routes ? data.routes[runKey] : null;
        const coordsList = data.coords ? data.coords[String(currentDay)] : null;
        if (!runEntry || !coordsList) return;

        // Build coordinate map
        const coords = {};
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        coordsList.forEach(item => {
            coords[item.node] = { x: item.x, y: item.y };
            minX = Math.min(minX, item.x);
            maxX = Math.max(maxX, item.x);
            minY = Math.min(minY, item.y);
            maxY = Math.max(maxY, item.y);
        });

        // Scale factors to fit canvas with padding
        const pad = 45;
        const scaleX = (width - pad * 2) / (maxX - minX || 1);
        const scaleY = (height - pad * 2) / (maxY - minY || 1);

        function toScreen(nx, ny) {
            return {
                x: pad + (nx - minX) * scaleX,
                y: pad + (ny - minY) * scaleY
            };
        }

        const activeRoutes = runEntry[currentEngine].routes;
        activeNodesOnCanvas = [];

        // 1. Draw Route Lines
        activeRoutes.forEach((route, idx) => {
            if (vehicleFilter !== 'all' && parseInt(vehicleFilter, 10) !== idx) return;

            const color = VEHICLE_COLORS[idx % VEHICLE_COLORS.length];
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.2;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();

            for (let i = 0; i < route.length - 1; i++) {
                const u = route[i];
                const v = route[i + 1];
                const p1 = toScreen(coords[u].x, coords[u].y);
                const p2 = toScreen(coords[v].x, coords[v].y);

                if (i === 0) ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();

            // Animated Simulation Pulse
            if (isSimulating) {
                const totalSegments = route.length - 1;
                const progressFloat = (simProgress * totalSegments) % totalSegments;
                const segIdx = Math.floor(progressFloat);
                const segT = progressFloat - segIdx;

                const u = route[segIdx];
                const v = route[segIdx + 1];
                const p1 = toScreen(coords[u].x, coords[u].y);
                const p2 = toScreen(coords[v].x, coords[v].y);

                const simX = p1.x + (p2.x - p1.x) * segT;
                const simY = p1.y + (p2.y - p1.y) * segT;

                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(simX, simY, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });

        ctx.globalAlpha = 1.0;

        // 2. Draw Customer Stops
        const dayOrders = data.orders ? data.orders[String(currentDay)] : {};

        activeRoutes.forEach((route, vIdx) => {
            if (vehicleFilter !== 'all' && parseInt(vehicleFilter, 10) !== vIdx) return;
            const vColor = VEHICLE_COLORS[vIdx % VEHICLE_COLORS.length];

            route.forEach((node) => {
                if (node === 0) return; // Depot drawn separately
                const pt = toScreen(coords[node].x, coords[node].y);
                const ord = dayOrders[String(node)] || {};

                activeNodesOnCanvas.push({
                    node: node,
                    x: pt.x,
                    y: pt.y,
                    van: vIdx + 1,
                    order: ord
                });

                ctx.save();
                ctx.fillStyle = vColor;
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        });

        // 3. Draw Central Depot Hub (Node 0)
        const depotPt = toScreen(coords[0].x, coords[0].y);
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        const size = 8;
        ctx.moveTo(depotPt.x, depotPt.y - size);
        ctx.lineTo(depotPt.x + size, depotPt.y);
        ctx.lineTo(depotPt.x, depotPt.y + size);
        ctx.lineTo(depotPt.x - size, depotPt.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 10px Plus Jakarta Sans';
        ctx.fillText('DEPOT', depotPt.x - 18, depotPt.y - 12);
        ctx.restore();

        activeNodesOnCanvas.push({
            node: 0,
            x: depotPt.x,
            y: depotPt.y,
            van: 'All',
            order: { weight: 0, volume: 0, eat: 0, lat: 360 }
        });
    }

    // ---------------------------------------------------------------------------
    // Canvas Mouse Hover Tooltip
    // ---------------------------------------------------------------------------
    function handleCanvasHover(e) {
        const rect = routeCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let closest = null;
        let minDist = 12; // hit radius

        for (const item of activeNodesOnCanvas) {
            const dx = item.x - mouseX;
            const dy = item.y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closest = item;
            }
        }

        if (closest) {
            const ord = closest.order;
            mapTooltip.innerHTML = closest.node === 0 ? `
                <div style="font-weight: 700; color: #fbbf24; margin-bottom: 2px;">🏥 Central Pharmacy Hub</div>
                <div style="color: #94a3b8; font-size: 0.74rem;">Base Depot • All routes originate and terminate here</div>
            ` : `
                <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px;">Pharmacy Stop #${closest.node}</div>
                <div style="line-height: 1.5; color: #cbd5e1;">
                    • <b>Assigned</b>: Van ${closest.van}<br>
                    • <b>Time Window</b>: [${ord.eat || 0} - ${ord.lat || 0}] min<br>
                    • <b>Payload</b>: ${ord.weight || 0} kg • ${ord.volume || 0} m³
                </div>
            `;
            mapTooltip.style.left = `${closest.x + 15}px`;
            mapTooltip.style.top = `${closest.y - 20}px`;
            mapTooltip.classList.remove('hidden');
        } else {
            mapTooltip.classList.add('hidden');
        }
    }

    // ---------------------------------------------------------------------------
    // Route Playback Simulation
    // ---------------------------------------------------------------------------
    function toggleSimulation() {
        if (isSimulating) {
            isSimulating = false;
            cancelAnimationFrame(simAnimationId);
            playSimBtn.textContent = '▶ Play Route Simulation';
            drawRouteCanvas();
        } else {
            isSimulating = true;
            playSimBtn.textContent = '⏹ Stop Simulation';
            simProgress = 0;
            runSimLoop();
        }
    }

    function runSimLoop() {
        if (!isSimulating) return;
        simProgress += 0.004;
        if (simProgress > 1) simProgress = 0;
        drawRouteCanvas();
        simAnimationId = requestAnimationFrame(runSimLoop);
    }

    // ---------------------------------------------------------------------------
    // TAB 2: Benchmark Charts & Table
    // ---------------------------------------------------------------------------
    function initBenchmarkTab() {
        const benchmarks = data.benchmarks || [];
        if (!benchmarks.length) return;

        // Grouped Bar Chart
        const ctxOtr = document.getElementById('chartBenchmarkOtr');
        if (ctxOtr) {
            const labels = Array.from(new Set(benchmarks.map(b => `Day ${b.day}`)));
            // Group by scenario
            const mlRows = benchmarks.filter(b => b.scenario === 'mostlikely');

            chartInstances.benchmarkOtr = new Chart(ctxOtr, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Greedy Baseline (% On-Time)',
                            data: mlRows.map(r => r.greedy_on_time_rate_pct),
                            backgroundColor: '#64748b'
                        },
                        {
                            label: 'Decomposed MILP (% On-Time)',
                            data: mlRows.map(r => r.decomp_on_time_rate_pct),
                            backgroundColor: '#6366f1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        y: { min: 80, max: 102, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Scatter Chart: Distance vs Late Deliveries
        const ctxScatter = document.getElementById('chartBenchmarkScatter');
        if (ctxScatter) {
            const scatterData = benchmarks.map(b => ({
                x: b.decomp_distance_km,
                y: b.decomp_late_deliveries,
                day: b.day,
                scenario: b.scenario
            }));

            chartInstances.benchmarkScatter = new Chart(ctxScatter, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Decomposed Solutions',
                        data: scatterData,
                        backgroundColor: '#38bdf8',
                        borderColor: '#0284c7',
                        pointRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `Day ${ctx.raw.day} (${ctx.raw.scenario}): ${ctx.raw.x}km, ${ctx.raw.y} late`
                            }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Total Distance (km)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                        y: { title: { display: true, text: 'Late Deliveries', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Populate 27-row Table
        const tbody = document.getElementById('benchmarkTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            benchmarks.forEach(b => {
                const diffOtr = b.decomp_on_time_rate_pct - b.greedy_on_time_rate_pct;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>Day ${b.day}</td>
                    <td><span class="status-tag ${b.scenario === 'pessimistic' ? 'tag-late' : 'tag-ontime'}">${b.scenario}</span></td>
                    <td>${b.num_orders}</td>
                    <td>${b.greedy_distance_km.toFixed(1)} km</td>
                    <td><b>${b.decomp_distance_km.toFixed(1)} km</b></td>
                    <td>${b.greedy_late_deliveries}</td>
                    <td><b style="color: ${b.decomp_late_deliveries === 0 ? '#34d399' : '#f87171'}">${b.decomp_late_deliveries}</b></td>
                    <td>${b.greedy_on_time_rate_pct.toFixed(1)}%</td>
                    <td><b style="color: #34d399;">${b.decomp_on_time_rate_pct.toFixed(1)}%</b></td>
                    <td style="color: ${diffOtr >= 0 ? '#34d399' : '#f87171'}; font-weight: 700;">${diffOtr >= 0 ? '+' : ''}${diffOtr.toFixed(1)}%</td>
                    <td>${b.decomp_runtime_sec.toFixed(1)}s</td>
                `;
                tbody.appendChild(row);
            });
        }
    }

    // ---------------------------------------------------------------------------
    // TAB 3: Multi-Objective Pareto Frontier Chart & Table
    // ---------------------------------------------------------------------------
    function initMultiObjTab() {
        const multi = data.multiobjective || [];
        if (!multi.length) return;

        const ctxPareto = document.getElementById('chartPareto');
        if (ctxPareto) {
            const paretoPoints = multi.map(m => ({
                x: m.total_distance_km,
                y: m.total_lateness_min,
                name: m.profile_name,
                alpha: m.alpha_distance,
                gamma: m.gamma_lateness
            }));

            chartInstances.pareto = new Chart(ctxPareto, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Weight Profiles',
                        data: paretoPoints,
                        backgroundColor: '#c084fc',
                        borderColor: '#a855f7',
                        pointRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${ctx.raw.name}: ${ctx.raw.x} km | ${ctx.raw.y} min lateness (α=${ctx.raw.alpha}, γ=${ctx.raw.gamma})`
                            }
                        }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Fleet Distance (km)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                        y: { title: { display: true, text: 'Total Customer Lateness (min)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Table
        const tbody = document.getElementById('multiObjTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            multi.forEach(m => {
                const isBest = m.profile_name.includes('Profile 7');
                const row = document.createElement('tr');
                if (isBest) row.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
                row.innerHTML = `
                    <td><b>${m.profile_name}</b> ${isBest ? '⭐' : ''}</td>
                    <td>${m.alpha_distance.toFixed(2)}</td>
                    <td>${m.beta_time.toFixed(2)}</td>
                    <td>${m.gamma_lateness.toFixed(2)}</td>
                    <td>${m.total_distance_km.toFixed(1)} km</td>
                    <td>${m.total_travel_time_min.toFixed(0)} min</td>
                    <td>${m.late_deliveries}</td>
                    <td>${m.total_lateness_min.toFixed(1)} min</td>
                    <td><b>${m.on_time_rate_pct.toFixed(1)}%</b></td>
                    <td>${m.mip_gap_pct ? m.mip_gap_pct.toFixed(2) + '%' : 'Optimal'}</td>
                `;
                tbody.appendChild(row);
            });
        }
    }

    // ---------------------------------------------------------------------------
    // TAB 4: Traffic Robustness Stress Test Charts & Table
    // ---------------------------------------------------------------------------
    function initRobustnessTab() {
        const robust = data.robustness || [];
        if (!robust.length) return;

        // Resilience Bar Chart
        const ctxRobOtr = document.getElementById('chartRobustOtr');
        if (ctxRobOtr) {
            const labels = robust.map(r => `Day ${r.day}`);
            chartInstances.robustOtr = new Chart(ctxRobOtr, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Greedy Stressed (% On-Time)',
                            data: robust.map(r => r.greedy_stress_otr_pct),
                            backgroundColor: '#ef4444'
                        },
                        {
                            label: 'Decomposed MILP Stressed (% On-Time)',
                            data: robust.map(r => r.decomp_stress_otr_pct),
                            backgroundColor: '#8b5cf6'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        y: { min: 50, max: 105, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Delay Surge Line Chart
        const ctxSurge = document.getElementById('chartRobustSurge');
        if (ctxSurge) {
            const labels = robust.map(r => `Day ${r.day}`);
            chartInstances.robustSurge = new Chart(ctxSurge, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Greedy Delay Surge (min)',
                            data: robust.map(r => r.greedy_stress_lateness_min),
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            fill: true,
                            tension: 0.3
                        },
                        {
                            label: 'Decomposed Delay Surge (min)',
                            data: robust.map(r => r.decomp_stress_lateness_min),
                            borderColor: '#10b981',
                            backgroundColor: 'transparent',
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        y: { title: { display: true, text: 'Total Delay (min)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Table
        const tbody = document.getElementById('robustTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            robust.forEach(r => {
                const avoidedMin = r.greedy_stress_lateness_min - r.decomp_stress_lateness_min;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>Day ${r.day}</td>
                    <td>${r.num_orders}</td>
                    <td>${r.greedy_plan_otr_pct.toFixed(1)}%</td>
                    <td style="color: #f87171; font-weight: 700;">${r.greedy_stress_otr_pct.toFixed(1)}%</td>
                    <td style="color: #f87171;">-${r.greedy_otr_drop_pct.toFixed(1)}%</td>
                    <td>${r.decomp_plan_otr_pct.toFixed(1)}%</td>
                    <td style="color: #a78bfa; font-weight: 700;">${r.decomp_stress_otr_pct.toFixed(1)}%</td>
                    <td style="color: #a78bfa;">-${r.decomp_otr_drop_pct.toFixed(1)}%</td>
                    <td style="color: #34d399; font-weight: 700;">+${avoidedMin.toFixed(0)} min</td>
                `;
                tbody.appendChild(row);
            });
        }
    }

    // ---------------------------------------------------------------------------
    // TAB 5: Scalability Chart & Table
    // ---------------------------------------------------------------------------
    function initScalabilityTab() {
        const scale = data.scalability || [];
        if (!scale.length) return;

        const monoRows = scale.filter(s => s.method && s.method.includes('Monolithic'));
        const ctxScale = document.getElementById('chartScalability');

        if (ctxScale && monoRows.length) {
            const labels = monoRows.map(m => `n=${m.n_customers}`);
            chartInstances.scalability = new Chart(ctxScale, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Relative MIP Gap (%)',
                            data: monoRows.map(m => m.mip_gap_pct),
                            borderColor: '#f43f5e',
                            backgroundColor: 'rgba(244, 63, 94, 0.1)',
                            yAxisID: 'y1',
                            tension: 0.2
                        },
                        {
                            label: 'Solver Runtime (s)',
                            data: monoRows.map(m => m.runtime_sec),
                            borderColor: '#818cf8',
                            backgroundColor: 'transparent',
                            borderDash: [5, 5],
                            yAxisID: 'y2',
                            tension: 0.2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        y1: { type: 'linear', position: 'left', title: { display: true, text: 'MIP Gap (%)', color: '#f43f5e' }, ticks: { color: '#f43f5e' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y2: { type: 'linear', position: 'right', title: { display: true, text: 'Runtime (s)', color: '#818cf8' }, ticks: { color: '#818cf8' }, grid: { display: false } },
                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                    }
                }
            });
        }

        // Table
        const tbody = document.getElementById('scaleTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            scale.forEach(s => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><b>n = ${s.n_customers}</b></td>
                    <td>${s.method}</td>
                    <td><span class="status-tag ${s.solver_status.includes('Optimal') ? 'tag-ontime' : 'tag-late'}">${s.solver_status}</span></td>
                    <td>${s.primal_bound_km ? s.primal_bound_km.toFixed(1) + ' km' : '--'}</td>
                    <td>${s.dual_bound_km ? s.dual_bound_km.toFixed(1) + ' km' : '--'}</td>
                    <td><b>${s.mip_gap_pct ? s.mip_gap_pct.toFixed(2) + '%' : '0.00%'}</b></td>
                    <td>${s.runtime_sec.toFixed(3)}s</td>
                    <td>${s.total_distance_km ? s.total_distance_km.toFixed(1) + ' km' : '--'}</td>
                    <td>${s.late_deliveries !== undefined ? s.late_deliveries : '--'}</td>
                `;
                tbody.appendChild(row);
            });
        }
    }

    // ---------------------------------------------------------------------------
    // Export CSV Utility
    // ---------------------------------------------------------------------------
    function exportBenchmarkCsv() {
        const benchmarks = data.benchmarks || [];
        if (!benchmarks.length) return;

        const headers = Object.keys(benchmarks[0]);
        let csvContent = headers.join(',') + '\n';
        benchmarks.forEach(row => {
            csvContent += headers.map(h => row[h]).join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'pharmaroute_27_benchmark.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Run on DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
