import json
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go

# ---------------------------------------------------------------------------
# Page Configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="PharmaRoute-Opt | Operations Research DSS",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ---------------------------------------------------------------------------
# Ultra-Sleek Modern Styling (Glassmorphism, Minimal Dark Luxury, Plus Jakarta Sans)
# ---------------------------------------------------------------------------
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Main Background */
    .stApp {
        background-color: #080c14;
        color: #f1f5f9;
    }

    /* Sleek Scrollbars */
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track {
        background: #0b0f19;
    }
    ::-webkit-scrollbar-thumb {
        background: #1e293b;
        border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #334155;
    }

    /* Top Navigation / Hero Banner */
    .hero-banner {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.7) 100%);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 26px 34px;
        margin-bottom: 24px;
        box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6);
        position: relative;
        overflow: hidden;
    }
    .hero-banner::after {
        content: '';
        position: absolute;
        top: 0; right: 0; width: 300px; height: 100%;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
        pointer-events: none;
    }
    .hero-title {
        font-size: 2.2rem;
        font-weight: 800;
        background: linear-gradient(90deg, #38bdf8 0%, #818cf8 45%, #c084fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0 0 6px 0;
        letter-spacing: -0.6px;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .hero-subtitle {
        font-size: 0.98rem;
        color: #94a3b8;
        margin: 0 0 14px 0;
        font-weight: 400;
        max-width: 850px;
        line-height: 1.5;
    }

    /* Badge Pills */
    .badge-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.74rem;
        font-weight: 600;
        margin-right: 8px;
        letter-spacing: 0.02em;
    }
    .badge-cyan { background: rgba(6, 182, 212, 0.12); color: #38bdf8; border: 1px solid rgba(6, 182, 212, 0.25); }
    .badge-indigo { background: rgba(99, 102, 241, 0.12); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.25); }
    .badge-emerald { background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
    .badge-amber { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25); }
    .badge-rose { background: rgba(244, 63, 94, 0.12); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.25); }

    /* KPI Metric Cards */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 14px;
        margin-bottom: 22px;
    }
    .kpi-box {
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 14px;
        padding: 18px 20px;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        overflow: hidden;
    }
    .kpi-box:hover {
        transform: translateY(-2px);
        border-color: rgba(99, 102, 241, 0.35);
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .kpi-title {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .kpi-number {
        font-size: 1.85rem;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.15;
    }
    .kpi-unit {
        font-size: 0.95rem;
        color: #64748b;
        font-weight: 500;
    }
    .kpi-sub {
        font-size: 0.78rem;
        margin-top: 6px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    /* Glass Panels */
    .glass-card {
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 22px;
        margin-bottom: 20px;
    }

    /* Explanation Callout */
    .guide-box {
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-left: 4px solid #6366f1;
        border-radius: 10px;
        padding: 14px 18px;
        margin-bottom: 18px;
        font-size: 0.88rem;
        color: #cbd5e1;
        line-height: 1.55;
    }

    /* Clean Streamlit tab styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 10px;
        padding: 8px 16px;
        font-weight: 600;
        font-size: 0.88rem;
        color: #94a3b8;
        background-color: transparent;
        transition: all 0.2s ease;
    }
    .stTabs [aria-selected="true"] {
        background-color: rgba(99, 102, 241, 0.16) !important;
        color: #818cf8 !important;
        border: 1px solid rgba(99, 102, 241, 0.3) !important;
    }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Data Loading & Precomputed Caching
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

@st.cache_data
def load_all_datasets():
    benchmarks_p = PROJECT_ROOT / "results" / "benchmarks" / "nine_day_benchmark.csv"
    routes_p = PROJECT_ROOT / "results" / "benchmarks" / "nine_day_routes.json"
    multi_p = PROJECT_ROOT / "results" / "benchmarks" / "multiobjective_sweep_day_01.csv"
    scale_p = PROJECT_ROOT / "results" / "benchmarks" / "scalability_day_01.csv"
    robust_p = PROJECT_ROOT / "results" / "benchmarks" / "robustness_stress_summary.csv"
    mds_p = PROJECT_ROOT / "results" / "benchmarks" / "mds_coordinates_all_days.json"

    df_b = pd.read_csv(benchmarks_p) if benchmarks_p.exists() else pd.DataFrame()
    with open(routes_p, "r", encoding="utf-8") as f:
        routes_db = json.load(f) if routes_p.exists() else {}
    df_m = pd.read_csv(multi_p) if multi_p.exists() else pd.DataFrame()
    df_s = pd.read_csv(scale_p) if scale_p.exists() else pd.DataFrame()
    df_r = pd.read_csv(robust_p) if robust_p.exists() else pd.DataFrame()
    with open(mds_p, "r", encoding="utf-8") as f:
        mds_coords = json.load(f) if mds_p.exists() else {}

    return df_b, routes_db, df_m, df_s, df_r, mds_coords

@st.cache_data
def get_instance_orders(day: int):
    from src.data.loader import DataLoader
    return DataLoader().load_day(day)


df_benchmarks, routes_db, df_multi, df_scale, df_robust, mds_coords = load_all_datasets()


# ---------------------------------------------------------------------------
# Top Hero / Header Section
# ---------------------------------------------------------------------------
st.markdown("""
<div class="hero-banner">
    <div class="hero-title">
        <span>💊</span> PharmaRoute-Opt
    </div>
    <div class="hero-subtitle">
        Decision-Support System for Pharmaceutical Last-Mile Logistics. Optimizes cold-chain and medical shipments under vehicle capacity (weight & volume), strict delivery deadlines, and stochastic Athens traffic congestion.
    </div>
    <div>
        <span class="badge-pill badge-cyan">📍 9 Daily Athens Instances</span>
        <span class="badge-pill badge-indigo">⚙️ Cluster-First Decomposed MILP (HiGHS)</span>
        <span class="badge-pill badge-emerald">🛡️ Traffic Robustness Stress Tested</span>
        <span class="badge-pill badge-amber">⚡ Instant Precomputed Execution</span>
    </div>
</div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Guided Onboarding & Explanation (Interactive Expander)
# ---------------------------------------------------------------------------
with st.expander("ℹ️ How to Understand this System (Quick 60-Second Guide)", expanded=False):
    st.markdown("""
    <div class="guide-box">
        <b>What problem does this solve?</b><br>
        Pharmaceutical supply chains cannot tolerate delayed deliveries—hospitals and pharmacies require life-saving medications within strict time windows. 
        However, urban traffic jams frequently cause routing plans to collapse, leading to missed deadlines.<br><br>
        
        <b>How the two algorithms work:</b><br>
        • <b>🏃 Greedy Baseline Heuristic:</b> Sequentially packs orders into the minimum number of vehicles. It achieves low mileage, but leaves zero buffer, causing severe deadline violations when congestion strikes.<br>
        • <b>⚡ Decomposed MILP (Hybrid OR):</b> Partitions the urban network into balanced, capacity-feasible clusters using empirical road distance dispersion, then solves each subproblem with a Mixed-Integer Linear Program (HiGHS). It achieves near-100% punctuality and stays resilient under severe traffic shocks.<br><br>
        
        <b>Traffic Regimes:</b><br>
        • <b>🟢 Optimistic:</b> Early morning / uncongested free-flow traffic.<br>
        • <b>🟡 Most-Likely:</b> Standard midday urban congestion (the operational baseline).<br>
        • <b>🔴 Pessimistic:</b> Severe peak-hour gridlock (+50% to +150% travel delay surge).
    </div>
    """, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar: Instance Selector & Controls
# ---------------------------------------------------------------------------
st.sidebar.markdown("### 🎛️ Scenario Controls")

day_selected = st.sidebar.selectbox(
    "Delivery Instance (Day)",
    options=list(range(1, 10)),
    format_func=lambda d: f"Day {d} Instance",
    index=0,
    help="Select which day of the 9-day Athens real-world dataset to inspect."
)

scenario_selected = st.sidebar.selectbox(
    "Traffic Condition",
    options=["optimistic", "mostlikely", "pessimistic"],
    format_func=lambda s: {
        "optimistic": "🟢 Optimistic (Free-Flow)",
        "mostlikely": "🟡 Most-Likely (Normal Traffic)",
        "pessimistic": "🔴 Pessimistic (Severe Gridlock)"
    }[s],
    index=1,
    help="Select the traffic condition under which routes are evaluated."
)

method_selected = st.sidebar.radio(
    "Routing Engine",
    options=["decomposed", "greedy"],
    format_func=lambda m: "⚡ Decomposed MILP (Hybrid OR)" if m == "decomposed" else "🏃 Greedy Baseline Heuristic",
    index=0,
    help="Compare the mathematically optimized decomposed solution against the greedy dispatch heuristic."
)

st.sidebar.markdown("---")
st.sidebar.markdown("### 🚚 Vehicle Specifications")
st.sidebar.markdown("""
<div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 14px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6;">
    <div style="font-weight: 700; color: #f8fafc; margin-bottom: 6px;">Delivery Van Constraints</div>
    • <b>Weight Capacity</b>: 600 kg<br>
    • <b>Cargo Volume</b>: 3.0 m³<br>
    • <b>Shift Duration</b>: 360 min (6 hrs)<br>
    • <b>Depot</b>: Central Pharmacy (Node 0)<br>
    • <b>Time Windows</b>: Soft with Lateness Penalty
</div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Load Instance Data & Active Metrics
# ---------------------------------------------------------------------------
instance_data = get_instance_orders(day_selected)
n_orders = instance_data.num_orders

run_key = f"day_{day_selected}_{scenario_selected}"
current_run_data = routes_db.get(run_key, {})

if current_run_data:
    selected_metrics = current_run_data[method_selected]
    comparison_metrics = current_run_data["greedy" if method_selected == "decomposed" else "decomposed"]
    routes = selected_metrics["routes"]
else:
    selected_metrics = {
        "distance_km": 0.0, "travel_time_min": 0.0, "late_deliveries": 0,
        "on_time_rate_pct": 100.0, "vehicles": 0, "routes": []
    }
    comparison_metrics = selected_metrics
    routes = []


# ---------------------------------------------------------------------------
# Main Tabs Organization
# ---------------------------------------------------------------------------
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🗺️ Spatial Route Map & Operations",
    "📊 9-Day Multi-Scenario Benchmark (RQ5)",
    "⚖️ Multi-Objective Trade-Offs (RQ4)",
    "🛡️ Traffic Robustness Stress Test (RQ6)",
    "🔬 Scalability & Monolithic Limits (RQ2/3)"
])


# ===========================================================================
# TAB 1: SPATIAL ROUTE MAP & FLEET OPERATIONS
# ===========================================================================
with tab1:
    st.markdown(f"#### Operations Dashboard: Day {day_selected} • {scenario_selected.capitalize()} Traffic • {n_orders} Pharmacies")

    # 5 Hero KPI Cards
    dist_val = selected_metrics["distance_km"]
    time_val = selected_metrics["travel_time_min"]
    otr_val = selected_metrics["on_time_rate_pct"]
    late_val = selected_metrics["late_deliveries"]
    veh_val = selected_metrics["vehicles"]

    delta_dist = dist_val - comparison_metrics["distance_km"]
    delta_otr = otr_val - comparison_metrics["on_time_rate_pct"]
    delta_late = late_val - comparison_metrics["late_deliveries"]

    alt_name = "Greedy" if method_selected == "decomposed" else "Decomp"

    kpi_cards_html = f"""
    <div class="kpi-grid">
        <div class="kpi-box">
            <div class="kpi-title"><span>Total Fleet Distance</span> <span>📏</span></div>
            <div class="kpi-number">{dist_val:.1f} <span class="kpi-unit">km</span></div>
            <div class="kpi-sub" style="color: {'#f87171' if delta_dist > 0 else '#34d399'};">
                {delta_dist:+.1f} km vs {alt_name}
            </div>
        </div>
        <div class="kpi-box">
            <div class="kpi-title"><span>Fleet Travel Time</span> <span>⏱️</span></div>
            <div class="kpi-number">{time_val:.0f} <span class="kpi-unit">min</span></div>
            <div class="kpi-sub" style="color: #94a3b8;">
                {time_val / 60.0:.1f} total vehicle-hrs
            </div>
        </div>
        <div class="kpi-box">
            <div class="kpi-title"><span>On-Time SLA Delivery</span> <span>🎯</span></div>
            <div class="kpi-number" style="color: {'#34d399' if otr_val >= 98 else ('#fbbf24' if otr_val >= 92 else '#f87171')};">
                {otr_val:.1f}<span class="kpi-unit">%</span>
            </div>
            <div class="kpi-sub" style="color: {'#34d399' if delta_otr >= 0 else '#f87171'};">
                {delta_otr:+.1f}% vs {alt_name}
            </div>
        </div>
        <div class="kpi-box">
            <div class="kpi-title"><span>Late Deliveries</span> <span>⚠️</span></div>
            <div class="kpi-number" style="color: {'#34d399' if late_val == 0 else '#f87171'};">
                {late_val} <span class="kpi-unit">stops</span>
            </div>
            <div class="kpi-sub" style="color: {'#34d399' if delta_late <= 0 else '#f87171'};">
                {delta_late:+d} delayed vs {alt_name}
            </div>
        </div>
        <div class="kpi-box">
            <div class="kpi-title"><span>Active Vehicles</span> <span>🚐</span></div>
            <div class="kpi-number">{veh_val} <span class="kpi-unit">vans</span></div>
            <div class="kpi-sub" style="color: #94a3b8;">
                {round(n_orders / max(veh_val, 1), 1)} stops / vehicle
            </div>
        </div>
    </div>
    """
    st.markdown(kpi_cards_html, unsafe_allow_html=True)

    # 2-Column Operational View
    map_col, inspect_col = st.columns([1.35, 1.0])

    with map_col:
        st.markdown("##### 📍 Interactive 2D Spatial Route Map (Metric MDS Projection)")
        st.caption("Spatial layout computed via classical Multidimensional Scaling directly from empirical road distance matrices.")

        # Interactive Map Controls
        filter_options = ["Show All Vehicles"] + [f"Vehicle {i+1}" for i in range(len(routes))]
        selected_view = st.selectbox("Vehicle Route Filter", options=filter_options, index=0, label_visibility="collapsed")

        # Build Interactive Plotly Spatial Map
        day_coords_raw = mds_coords.get(str(day_selected), [])
        coords_map = {item["node"]: (item["x"], item["y"]) for item in day_coords_raw}

        fig_map = go.Figure()
        palette = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#f97316", "#a855f7"]

        time_mat = instance_data.get_time_matrix(scenario_selected)

        # Plot routes
        for idx, r in enumerate(routes):
            if selected_view != "Show All Vehicles" and selected_view != f"Vehicle {idx+1}":
                continue

            v_color = palette[idx % len(palette)]
            x_line = [coords_map.get(n, (0, 0))[0] for n in r]
            y_line = [coords_map.get(n, (0, 0))[1] for n in r]

            # Route Line
            fig_map.add_trace(go.Scatter(
                x=x_line,
                y=y_line,
                mode="lines",
                line=dict(color=v_color, width=2.5),
                name=f"Van {idx+1}",
                hoverinfo="skip"
            ))

            # Customer Stops
            c_nodes = [n for n in r if n != 0]
            x_cust = [coords_map.get(n, (0, 0))[0] for n in c_nodes]
            y_cust = [coords_map.get(n, (0, 0))[1] for n in c_nodes]

            # Determine lateness for tooltips
            hover_texts = []
            stop_colors = []
            curr_t = 0.0

            for k in range(len(r) - 1):
                u, v = r[k], r[k+1]
                t_tr = time_mat[u, v]
                if v != 0:
                    order = instance_data.orders[v]
                    arr_t = max(curr_t + t_tr, order.eat_min)
                    late_dur = max(0.0, arr_t - order.lat_min)
                    dep_t = arr_t + order.service_time_min

                    status_str = f"⚠️ LATE (+{late_dur:.1f} min)" if late_dur > 0 else "✅ ON-TIME"
                    stop_colors.append("#f43f5e" if late_dur > 0 else v_color)

                    hover_texts.append(
                        f"<b>Stop {v}</b> (Van {idx+1})<br>"
                        f"Status: {status_str}<br>"
                        f"Arrival: {arr_t:.1f} min | Deadline: {order.lat_min:.0f} min<br>"
                        f"Payload: {order.weight_kg:.1f} kg • {order.volume_m3:.2f} m³"
                    )
                    curr_t = dep_t
                else:
                    curr_t += t_tr

            fig_map.add_trace(go.Scatter(
                x=x_cust,
                y=y_cust,
                mode="markers",
                marker=dict(size=8, color=stop_colors, line=dict(width=1, color="#ffffff")),
                name=f"Stops (Van {idx+1})",
                text=hover_texts,
                hoverinfo="text"
            ))

        # Central Pharmacy Depot
        fig_map.add_trace(go.Scatter(
            x=[0],
            y=[0],
            mode="markers+text",
            marker=dict(size=14, color="#fbbf24", symbol="diamond", line=dict(width=2, color="#ffffff")),
            text=["🏥 DEPOT"],
            textposition="top center",
            name="Central Pharmacy Depot",
            hovertext="<b>Central Pharmacy Depot (Node 0)</b><br>All vehicle tours depart and terminate here.",
            hoverinfo="text"
        ))

        fig_map.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.4)",
            xaxis=dict(showgrid=True, gridcolor="rgba(255,255,255,0.05)", zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=True, gridcolor="rgba(255,255,255,0.05)", zeroline=False, showticklabels=False),
            height=430,
            margin=dict(t=20, b=20, l=20, r=20),
            legend=dict(orientation="h", yanchor="bottom", y=-0.18, xanchor="center", x=0.5, font=dict(size=10))
        )
        st.plotly_chart(fig_map, width="stretch")

    with inspect_col:
        st.markdown("##### 🚐 Vehicle Tour & Payload Inspector")
        if routes:
            v_idx = st.selectbox(
                "Select Vehicle Tour for Inspection",
                options=list(range(len(routes))),
                format_func=lambda i: f"Vehicle Van {i+1} ({len(routes[i])-2} stops)"
            )
            v_route = routes[v_idx]
            v_stops = [s for s in v_route if s != 0]

            # Compute route loads
            tot_w = sum(instance_data.orders[s].weight_kg for s in v_stops)
            tot_v = sum(instance_data.orders[s].volume_m3 for s in v_stops)
            dist_mat = instance_data.distance_matrix
            time_mat = instance_data.get_time_matrix(scenario_selected)

            r_dist = sum(dist_mat[v_route[k], v_route[k+1]] for k in range(len(v_route)-1))
            r_trav = sum(time_mat[v_route[k], v_route[k+1]] for k in range(len(v_route)-1))
            r_serv = sum(instance_data.orders[s].service_time_min for s in v_stops)
            r_dur = r_trav + r_serv

            w_pct = tot_w / 600.0 * 100.0
            v_pct = tot_v / 3.0 * 100.0
            dur_pct = r_dur / 360.0 * 100.0

            st.markdown(f"""
            <div class="glass-card" style="padding: 16px; margin-bottom: 14px;">
                <div style="font-size: 0.82rem; color: #94a3b8; font-weight: 600; text-transform: uppercase;">
                    Van {v_idx+1} Route Summary
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 2px;">
                    {len(v_stops)} Customer Stops • {r_dist:.1f} km
                </div>
            </div>
            """, unsafe_allow_html=True)

            # Capacity Progress Bars
            st.caption(f"⚖️ Weight Utilization: **{tot_w:.1f} / 600.0 kg** ({w_pct:.1f}%)")
            st.progress(min(w_pct / 100.0, 1.0))

            st.caption(f"📦 Volume Utilization: **{tot_v:.2f} / 3.00 m³** ({v_pct:.1f}%)")
            st.progress(min(v_pct / 100.0, 1.0))

            st.caption(f"⏱️ Shift Duration: **{r_dur:.1f} / 360.0 min** ({dur_pct:.1f}%)")
            st.progress(min(dur_pct / 100.0, 1.0))

            # Stop Sequence Pill Flow
            seq_str = " ➔ ".join([f"<b>{s}</b>" if s != 0 else "🏥" for s in v_route])
            st.markdown(f"""
            <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px 14px; font-size: 0.78rem; color: #94a3b8; overflow-x: auto; white-space: nowrap; margin-top: 10px;">
                {seq_str}
            </div>
            """, unsafe_allow_html=True)

    # Detailed Stop Timeline Table
    st.markdown("##### 📋 Stop-by-Stop Delivery Schedule & Deadline Compliance")
    if routes:
        sched_rows = []
        curr_t = 0.0
        for k in range(len(v_route) - 1):
            u, v = v_route[k], v_route[k+1]
            t_tr = time_mat[u, v]
            if v != 0:
                ord_item = instance_data.orders[v]
                arr_t = max(curr_t + t_tr, ord_item.eat_min)
                late_dur = max(0.0, arr_t - ord_item.lat_min)
                dep_t = arr_t + ord_item.service_time_min

                sched_rows.append({
                    "Sequence": f"#{k+1}",
                    "Stop ID": f"Pharmacy {v}",
                    "Arrival (min)": f"{arr_t:.1f}",
                    "Time Window [EAT - LAT]": f"[{ord_item.eat_min:.0f} - {ord_item.lat_min:.0f}] min",
                    "Departure (min)": f"{dep_t:.1f}",
                    "Deadline Status": f"⚠️ LATE (+{late_dur:.1f} min)" if late_dur > 0 else "✅ ON-TIME",
                    "Weight": f"{ord_item.weight_kg:.1f} kg",
                    "Volume": f"{ord_item.volume_m3:.3f} m³"
                })
                curr_t = dep_t
            else:
                curr_t += t_tr

        df_sched_table = pd.DataFrame(sched_rows)
        st.dataframe(df_sched_table, width="stretch", hide_index=True)


# ===========================================================================
# TAB 2: 9-DAY MULTI-SCENARIO BENCHMARK (RQ5)
# ===========================================================================
with tab2:
    st.markdown("#### Comprehensive 9-Day Multi-Scenario Benchmark (RQ5)")
    st.markdown("Empirical comparison of **Greedy Baseline** vs. **Cluster-First Decomposed MILP** across all 27 instances.")

    if not df_benchmarks.empty:
        # Overview Aggregate KPIs
        g_otr_avg = df_benchmarks["greedy_on_time_rate_pct"].mean()
        d_otr_avg = df_benchmarks["decomp_on_time_rate_pct"].mean()
        g_late_tot = int(df_benchmarks["greedy_late_deliveries"].sum())
        d_late_tot = int(df_benchmarks["decomp_late_deliveries"].sum())
        d_time_avg = df_benchmarks["decomp_runtime_sec"].mean()

        b1, b2, b3, b4 = st.columns(4)
        b1.metric("Decomposed Avg On-Time Rate", f"{d_otr_avg:.2f}%", f"{d_otr_avg - g_otr_avg:+.2f}% vs Greedy")
        b2.metric("Late Stops Eliminated", f"{g_late_tot - d_late_tot} stops", f"-{(g_late_tot - d_late_tot)/g_late_tot*100:.1f}% reduction")
        b3.metric("Decomposed Total Late Deliveries", f"{d_late_tot} stops", "Across all 27 instances")
        b4.metric("Avg Decomposed Runtime", f"{d_time_avg:.1f} s", "Linear subproblem solve")

        # Visual Chart 1: Grouped Punctuality Comparison
        st.markdown("##### On-Time Delivery Rate (%) across All 9 Days and Traffic Conditions")
        fig_bench_otr = px.bar(
            df_benchmarks,
            x="day",
            y=["greedy_on_time_rate_pct", "decomp_on_time_rate_pct"],
            barmode="group",
            facet_col="scenario",
            color_discrete_map={"greedy_on_time_rate_pct": "#64748b", "decomp_on_time_rate_pct": "#6366f1"},
            labels={"value": "On-Time Rate (%)", "day": "Day", "variable": "Routing Engine"},
            height=400
        )
        fig_bench_otr.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)",
            margin=dict(t=40, b=20, l=20, r=20),
            legend=dict(orientation="h", yanchor="bottom", y=-0.25, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_bench_otr, width="stretch")

        # Visual Chart 2: Distance vs Lateness Trade-Off Scatter
        st.markdown("##### Distance (Cost) vs Late Deliveries Trade-Off")
        fig_bench_scatter = px.scatter(
            df_benchmarks,
            x="decomp_distance_km",
            y="decomp_late_deliveries",
            color="scenario",
            size="num_orders",
            hover_data=["day", "decomp_vehicles", "decomp_on_time_rate_pct"],
            color_discrete_map={"optimistic": "#06b6d4", "mostlikely": "#eab308", "pessimistic": "#f43f5e"},
            labels={"decomp_distance_km": "Total Distance (km)", "decomp_late_deliveries": "Late Deliveries (count)"},
            height=380
        )
        fig_bench_scatter.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)"
        )
        st.plotly_chart(fig_bench_scatter, width="stretch")

        # Full Table View
        st.markdown("##### Complete 27-Instance Benchmark Data Table")
        st.dataframe(df_benchmarks, width="stretch")


# ===========================================================================
# TAB 3: MULTI-OBJECTIVE WEIGHT EXPLORER (RQ4)
# ===========================================================================
with tab3:
    st.markdown("#### Multi-Objective Weighted-Sum Scalarization Sweep (RQ4)")
    st.markdown("""
    **Scalarized Objective Formulation**:
    $$\\min Z = \\alpha \\left(\\frac{D}{D_0}\\right) + \\beta \\left(\\frac{T}{T_0}\\right) + \\gamma \\left(\\frac{L}{L_0}\\right) \\quad \\text{subject to } \\alpha + \\beta + \\gamma = 1$$
    This experiment sweeps 10 structured weight profiles to map the Pareto trade-off between transportation distance ($D$), fleet transit time ($T$), and customer lateness ($L$).
    """)

    if not df_multi.empty:
        # Pareto Scatter Plot
        fig_pareto = px.scatter(
            df_multi,
            x="total_distance_km",
            y="total_lateness_min",
            color="profile_name",
            size="total_travel_time_min",
            hover_data=["alpha_distance", "beta_time", "gamma_lateness", "on_time_rate_pct", "mip_gap_pct"],
            labels={"total_distance_km": "Total Distance (km)", "total_lateness_min": "Total Lateness (min)"},
            title="Pareto Trade-Off Frontier: Routing Distance vs Customer Lateness",
            height=430
        )
        fig_pareto.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)"
        )
        st.plotly_chart(fig_pareto, width="stretch")

        # Best Observed Profile Spotlight Card
        st.markdown("""
        <div class="glass-card" style="border-left: 4px solid #10b981; padding: 18px 22px;">
            <div style="font-weight: 700; color: #34d399; font-size: 1.05rem; margin-bottom: 6px;">
                🌟 Best Observed Non-Dominated Solution: Profile 7 (Service Quality Emphasis)
            </div>
            <div style="font-size: 0.88rem; color: #cbd5e1; line-height: 1.6;">
                • <b>Weight Scalarization</b>: α (Distance) = 0.20, β (Time) = 0.20, γ (Lateness Penalty) = 0.60<br>
                • <b>Operational Outcome</b>: Yielded <b>100.0% On-Time Delivery</b> (0.0 min lateness) at a compact distance of <b>86.0 km</b>.<br>
                • <b>Key OR Insight</b>: Over-prioritizing lateness without routing penalties (γ=1.0) creates a <b>+159% distance explosion</b> (222.8 km). Profile 7 balances medical urgency with fleet efficiency.
            </div>
        </div>
        """, unsafe_allow_html=True)

        st.dataframe(df_multi, width="stretch")


# ===========================================================================
# TAB 4: TRAFFIC ROBUSTNESS STRESS TEST (RQ6)
# ===========================================================================
with tab4:
    st.markdown("#### Traffic Robustness Stress Simulation (RQ6)")
    st.markdown("""
    **Stress Test Protocol**:
    Delivery routes planned under **Most-Likely traffic** are directly executed under severe **Pessimistic traffic congestion** without re-routing.
    This reveals how fragile or resilient mathematical plans are when real-world traffic shocks occur.
    """)

    if not df_robust.empty:
        g_s_otr = df_robust["greedy_stress_otr_pct"].mean()
        d_s_otr = df_robust["decomp_stress_otr_pct"].mean()
        g_drop = df_robust["greedy_otr_drop_pct"].mean()
        d_drop = df_robust["decomp_otr_drop_pct"].mean()
        g_s_late = int(df_robust["greedy_stress_late"].sum())
        d_s_late = int(df_robust["decomp_stress_late"].sum())
        saved_min = df_robust["greedy_stress_lateness_min"].sum() - df_robust["decomp_stress_lateness_min"].sum()

        r1, r2, r3 = st.columns(3)
        r1.metric("Greedy Congested On-Time Rate", f"{g_s_otr:.1f}%", f"-{g_drop:.1f}% drop under gridlock", delta_color="inverse")
        r2.metric("Decomposed Congested On-Time Rate", f"{d_s_otr:.1f}%", f"-{d_drop:.1f}% drop under gridlock", delta_color="inverse")
        r3.metric("Delay Avoided by Decomposed MILP", f"{saved_min:.0f} min", f"{g_s_late - d_s_late} critical shipments saved")

        # Resilience Comparison Chart
        fig_rob_bar = go.Figure()
        fig_rob_bar.add_trace(go.Bar(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["greedy_stress_otr_pct"],
            name="Greedy (Pessimistic Congestion)",
            marker_color="#ef4444"
        ))
        fig_rob_bar.add_trace(go.Bar(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["decomp_stress_otr_pct"],
            name="Decomposed MILP (Pessimistic Congestion)",
            marker_color="#8b5cf6"
        ))
        fig_rob_bar.update_layout(
            barmode="group",
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)",
            title="Punctuality SLA Resilience under Congestion Shock across 9 Days",
            yaxis_title="On-Time Rate (%)",
            height=400,
            margin=dict(t=50, b=20, l=20, r=20),
            legend=dict(orientation="h", yanchor="bottom", y=-0.22, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_rob_bar, width="stretch")

        # Total Delay Surge Plot
        fig_rob_line = go.Figure()
        fig_rob_line.add_trace(go.Scatter(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["greedy_stress_lateness_min"],
            mode="lines+markers",
            name="Greedy Cumulative Delay (min)",
            line=dict(color="#ef4444", width=3)
        ))
        fig_rob_line.add_trace(go.Scatter(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["decomp_stress_lateness_min"],
            mode="lines+markers",
            name="Decomposed Cumulative Delay (min)",
            line=dict(color="#34d399", width=3)
        ))
        fig_rob_line.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)",
            title="Total Fleet Delay Surge under Traffic Congestion (Minutes)",
            yaxis_title="Fleet Lateness (min)",
            height=370,
            legend=dict(orientation="h", yanchor="bottom", y=-0.22, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_rob_line, width="stretch")

        st.dataframe(df_robust, width="stretch")


# ===========================================================================
# TAB 5: SCALABILITY & MONOLITHIC LIMITS (RQ2/3)
# ===========================================================================
with tab5:
    st.markdown("#### Computational Scalability & MIP Optimality Gap (RQ2 & RQ3)")
    st.markdown("""
    **Empirical Findings on Monolithic Formulation**:
    While small CVRPTW instances ($n \\le 20$) are solvable with low MIP gaps within 30s,
    at production scale ($n \\ge 40$), the monolithic MILP is **computationally challenging under standard time limits**,
    failing to find any feasible integer solution within allocated solver budgets. This empirically establishes the requirement for cluster-first decomposition.
    """)

    if not df_scale.empty:
        df_mono = df_scale[df_scale["method"].str.contains("Monolithic", na=False)]
        fig_scale = go.Figure()
        fig_scale.add_trace(go.Scatter(
            x=df_mono["n_customers"],
            y=df_mono["mip_gap_pct"],
            mode="lines+markers",
            name="Relative MIP Gap (%)",
            line=dict(color="#f43f5e", width=3),
            yaxis="y1"
        ))
        fig_scale.add_trace(go.Bar(
            x=df_mono["n_customers"],
            y=df_mono["runtime_sec"],
            name="Solver Runtime (s)",
            marker_color="rgba(99, 102, 241, 0.4)",
            yaxis="y2"
        ))
        fig_scale.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(15, 23, 42, 0.3)",
            title="Combinatorial Explosion: Relative MIP Gap and Solve Times vs Customer Count",
            xaxis_title="Number of Customer Stops (n)",
            yaxis=dict(title="Relative MIP Gap (%)", title_font=dict(color="#f43f5e")),
            yaxis2=dict(title="Solver Runtime (s)", title_font=dict(color="#818cf8"), overlaying="y", side="right"),
            height=430,
            legend=dict(orientation="h", yanchor="bottom", y=-0.22, xanchor="center", x=0.5)
        )
        st.plotly_chart(fig_scale, width="stretch")

        st.dataframe(df_scale, width="stretch")
