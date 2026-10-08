import json
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import streamlit as st
import plotly.express as px
import plotly.graph_objects as go

# ---------------------------------------------------------------------------
# Page Configuration & Modern Aesthetics
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="PharmaRoute-Opt | OR Decision Support",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom High-End Modern Styling (Glassmorphism, Inter typography, HSL tokens)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Dark Theme Background */
    .stApp {
        background-color: #0b0f19;
        color: #f3f4f6;
    }

    /* Header Banner */
    .main-header {
        background: linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(31, 41, 55, 0.8) 100%);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 24px 32px;
        margin-bottom: 24px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .main-title {
        font-size: 2.1rem;
        font-weight: 800;
        background: linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #c084fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0 0 6px 0;
        letter-spacing: -0.5px;
    }
    .sub-title {
        font-size: 1.0rem;
        color: #94a3b8;
        margin: 0;
        font-weight: 400;
    }
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-right: 8px;
        margin-top: 10px;
    }
    .badge-primary { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .badge-emerald { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

    /* KPI Cards */
    .kpi-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
    }
    .kpi-card {
        background: rgba(17, 24, 39, 0.7);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 20px;
        transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .kpi-card:hover {
        transform: translateY(-2px);
        border-color: rgba(99, 102, 241, 0.4);
    }
    .kpi-label {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 6px;
    }
    .kpi-value {
        font-size: 1.85rem;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.2;
    }
    .kpi-delta {
        font-size: 0.8rem;
        margin-top: 4px;
        font-weight: 500;
    }
    .delta-pos { color: #34d399; }
    .delta-neg { color: #f87171; }
    .delta-neutral { color: #94a3b8; }

    /* Card Panels */
    .content-panel {
        background: rgba(17, 24, 39, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 22px;
        margin-bottom: 20px;
    }

    /* Custom Tables */
    .dataframe {
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 8px !important;
    }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Data Loading & Caching Utilities
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

@st.cache_data
def load_benchmark_data() -> pd.DataFrame:
    path = PROJECT_ROOT / "results" / "benchmarks" / "nine_day_benchmark.csv"
    if path.exists():
        return pd.read_csv(path)
    return pd.DataFrame()

@st.cache_data
def load_routes_data() -> Dict[str, Any]:
    path = PROJECT_ROOT / "results" / "benchmarks" / "nine_day_routes.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

@st.cache_data
def load_multiobjective_data() -> pd.DataFrame:
    path = PROJECT_ROOT / "results" / "benchmarks" / "multiobjective_sweep_day_01.csv"
    if path.exists():
        return pd.read_csv(path)
    return pd.DataFrame()

@st.cache_data
def load_scalability_data() -> pd.DataFrame:
    path = PROJECT_ROOT / "results" / "benchmarks" / "scalability_day_01.csv"
    if path.exists():
        return pd.read_csv(path)
    return pd.DataFrame()

@st.cache_data
def load_robustness_data() -> pd.DataFrame:
    path = PROJECT_ROOT / "results" / "benchmarks" / "robustness_stress_summary.csv"
    if path.exists():
        return pd.read_csv(path)
    return pd.DataFrame()

@st.cache_data
def load_orders_data(day: int):
    from src.data.loader import DataLoader
    loader = DataLoader()
    return loader.load_day(day)


df_benchmarks = load_benchmark_data()
routes_db = load_routes_data()
df_multi = load_multiobjective_data()
df_scale = load_scalability_data()
df_robust = load_robustness_data()


# ---------------------------------------------------------------------------
# Header Section
# ---------------------------------------------------------------------------
st.markdown("""
<div class="main-header">
    <h1 class="main-title">PHARMAROUTE-OPT</h1>
    <p class="sub-title">Operations Research Decision-Support System for Pharmaceutical Last-Mile Delivery Optimization</p>
    <div>
        <span class="badge badge-primary">CVRPTW-S Formulation</span>
        <span class="badge badge-purple">Cluster-First Decomposed MILP (HiGHS)</span>
        <span class="badge badge-emerald">Real-World Athens Delivery Dataset (Zenodo 10.5281/zenodo.15310106)</span>
    </div>
</div>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Sidebar Controls & Operational Parameters
# ---------------------------------------------------------------------------
st.sidebar.markdown("### 🎛️ Instance Controls")

day_selected = st.sidebar.selectbox(
    "Delivery Day",
    options=list(range(1, 10)),
    format_func=lambda d: f"Day {d} (Athens Instance)",
    index=0
)

scenario_selected = st.sidebar.selectbox(
    "Traffic Scenario",
    options=["optimistic", "mostlikely", "pessimistic"],
    format_func=lambda s: {
        "optimistic": "🟢 Optimistic Traffic (Free Flow)",
        "mostlikely": "🟡 Most-Likely Traffic (Normal Congestion)",
        "pessimistic": "🔴 Pessimistic Traffic (Severe Peak Jam)"
    }[s],
    index=1
)

method_selected = st.sidebar.radio(
    "Routing Engine",
    options=["decomposed", "greedy"],
    format_func=lambda m: "⚡ Decomposed MILP (Hybrid OR)" if m == "decomposed" else "🏃 Greedy Baseline Heuristic",
    index=0
)

st.sidebar.markdown("---")
st.sidebar.markdown("### 📦 Fleet Constraints")
st.sidebar.info("""
- **Depot**: Node 0 (Central Pharmacy)
- **Payload Capacity**: 600 kg / vehicle
- **Volume Capacity**: 3.0 m³ / vehicle
- **Max Shift Duration**: 360 min (6 hrs)
- **Time Windows**: EAT to LAT with soft lateness penalties
""")


# ---------------------------------------------------------------------------
# Load Instance Data & Extract Route Metrics
# ---------------------------------------------------------------------------
instance_data = load_orders_data(day_selected)
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
    "🚚 Operational Route View",
    "📊 9-Day Multi-Scenario Benchmark (RQ5)",
    "⚖️ Multi-Objective Trade-Offs (RQ4)",
    "🛡️ Traffic Robustness Stress Test (RQ6)",
    "🔬 Computational Scalability & MIP Bounds (RQ2/3)"
])


# ===========================================================================
# TAB 1: OPERATIONAL ROUTE VIEW & SCHEDULES
# ===========================================================================
with tab1:
    st.markdown(f"### Operational Execution: Day {day_selected} ({scenario_selected.capitalize()} Traffic)")

    # 5 Key Performance Indicators
    dist_val = selected_metrics["distance_km"]
    time_val = selected_metrics["travel_time_min"]
    otr_val = selected_metrics["on_time_rate_pct"]
    late_val = selected_metrics["late_deliveries"]
    veh_val = selected_metrics["vehicles"]

    # Comparative Deltas against alternate method
    delta_dist = dist_val - comparison_metrics["distance_km"]
    delta_otr = otr_val - comparison_metrics["on_time_rate_pct"]
    delta_late = late_val - comparison_metrics["late_deliveries"]

    kpi_html = f"""
    <div class="kpi-container">
        <div class="kpi-card">
            <div class="kpi-label">Total Distance</div>
            <div class="kpi-value">{dist_val:.1f} <span style="font-size: 1rem; color: #94a3b8;">km</span></div>
            <div class="kpi-delta {'delta-neg' if delta_dist > 0 else 'delta-pos'}">{delta_dist:+.1f} km vs {'Greedy' if method_selected=='decomposed' else 'Decomposed'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Travel Time</div>
            <div class="kpi-value">{time_val:.0f} <span style="font-size: 1rem; color: #94a3b8;">min</span></div>
            <div class="kpi-delta delta-neutral">{time_val / 60.0:.1f} vehicle-hours</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">On-Time Delivery Rate</div>
            <div class="kpi-value" style="color: {'#34d399' if otr_val >= 98 else ('#fbbf24' if otr_val >= 92 else '#f87171')};">{otr_val:.1f}%</div>
            <div class="kpi-delta {'delta-pos' if delta_otr >= 0 else 'delta-neg'}">{delta_otr:+.1f}% vs {'Greedy' if method_selected=='decomposed' else 'Decomposed'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Late Deliveries</div>
            <div class="kpi-value" style="color: {'#34d399' if late_val == 0 else '#f87171'};">{late_val} <span style="font-size: 1rem; color: #94a3b8;">stops</span></div>
            <div class="kpi-delta {'delta-pos' if delta_late <= 0 else 'delta-neg'}">{delta_late:+d} late stops</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Active Fleet Vehicles</div>
            <div class="kpi-value">{veh_val} <span style="font-size: 1rem; color: #94a3b8;">vans</span></div>
            <div class="kpi-delta delta-neutral">{instance_data.num_orders} orders served</div>
        </div>
    </div>
    """
    st.markdown(kpi_html, unsafe_allow_html=True)

    # Vehicle Route Inspector
    col_left, col_right = st.columns([1, 2])

    with col_left:
        st.markdown("#### Vehicle Tour Selection")
        if routes:
            route_idx = st.selectbox(
                "Select Vehicle Tour",
                options=list(range(len(routes))),
                format_func=lambda i: f"Vehicle {i+1} ({len(routes[i])-2} customer stops)"
            )
            selected_route = routes[route_idx]
            customer_stops = [s for s in selected_route if s != 0]

            # Route summary stats
            w_tot = sum(instance_data.orders[s].weight_kg for s in customer_stops)
            v_tot = sum(instance_data.orders[s].volume_m3 for s in customer_stops)
            time_mat = instance_data.get_time_matrix(scenario_selected)
            dist_mat = instance_data.distance_matrix

            r_dist = sum(dist_mat[selected_route[k], selected_route[k+1]] for k in range(len(selected_route)-1))
            r_trav = sum(time_mat[selected_route[k], selected_route[k+1]] for k in range(len(selected_route)-1))
            r_serv = sum(instance_data.orders[s].service_time_min for s in customer_stops)
            r_dur = r_trav + r_serv

            st.markdown(f"""
            <div class="content-panel" style="padding: 16px;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #38bdf8;">Vehicle {route_idx+1} Payload & Schedule:</p>
                <div style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.6;">
                    • <b>Stops</b>: {len(customer_stops)} pharmacies/clinics<br>
                    • <b>Weight</b>: {w_tot:.1f} / 600 kg ({w_tot/600*100:.1f}%)<br>
                    • <b>Volume</b>: {v_tot:.2f} / 3.00 m³ ({v_tot/3.0*100:.1f}%)<br>
                    • <b>Shift Duration</b>: {r_dur:.1f} / 360 min ({r_dur/360*100:.1f}%)<br>
                    • <b>Route Distance</b>: {r_dist:.1f} km
                </div>
            </div>
            """, unsafe_allow_html=True)

            # Route Shift Progress Bar
            shift_pct = min(r_dur / 360.0, 1.0)
            st.progress(shift_pct, text=f"Shift Time Utilization: {r_dur:.1f} / 360 min")
        else:
            st.warning("No routes available for this instance.")

    with col_right:
        st.markdown("#### Stop-by-Stop Timeline & SLA Compliance")
        if routes:
            # Build timeline table for selected route
            time_mat = instance_data.get_time_matrix(scenario_selected)
            timeline_records = []
            curr_time = 0.0

            for k in range(len(selected_route) - 1):
                u, v = selected_route[k], selected_route[k+1]
                t_tr = time_mat[u, v]

                if v != 0:
                    order = instance_data.orders[v]
                    arr_t = max(curr_time + t_tr, order.eat_min)
                    lateness = max(0.0, arr_t - order.lat_min)
                    dep_t = arr_t + order.service_time_min

                    timeline_records.append({
                        "Seq": k + 1,
                        "Stop ID": v,
                        "Arrival (min)": round(arr_t, 1),
                        "Window [EAT, LAT]": f"[{order.eat_min:.0f}, {order.lat_min:.0f}]",
                        "Departure (min)": round(dep_t, 1),
                        "Lateness": f"⚠️ {lateness:.1f} min" if lateness > 0 else "✅ On-Time",
                        "Weight (kg)": round(order.weight_kg, 1),
                        "Vol (m³)": round(order.volume_m3, 3)
                    })
                    curr_time = dep_t
                else:
                    curr_time += t_tr

            df_sched = pd.DataFrame(timeline_records)
            st.dataframe(df_sched, use_container_width=True, hide_index=True)


# ===========================================================================
# TAB 2: 9-DAY MULTI-SCENARIO BENCHMARK (RQ5)
# ===========================================================================
with tab2:
    st.markdown("### Comprehensive 9-Day Multi-Scenario Benchmark (27 Instances)")
    st.markdown("Evaluating **Greedy Baseline Heuristic** against **Feasibility-Aware Decomposed MILP** across all 9 Athens instances and 3 traffic regimes.")

    if not df_benchmarks.empty:
        # Aggregated comparison cards
        avg_g_otr = df_benchmarks["greedy_on_time_rate_pct"].mean()
        avg_d_otr = df_benchmarks["decomp_on_time_rate_pct"].mean()
        tot_g_late = int(df_benchmarks["greedy_late_deliveries"].sum())
        tot_d_late = int(df_benchmarks["decomp_late_deliveries"].sum())
        avg_d_time = df_benchmarks["decomp_runtime_sec"].mean()

        m_col1, m_col2, m_col3, m_col4 = st.columns(4)
        m_col1.metric("Decomposed Avg On-Time Rate", f"{avg_d_otr:.2f}%", f"{avg_d_otr - avg_g_otr:+.2f}% vs Greedy")
        m_col2.metric("Late Stops Avoided", f"{tot_g_late - tot_d_late} stops", f"-{(tot_g_late - tot_d_late)/tot_g_late*100:.1f}% reduction")
        m_col3.metric("Decomposed Total Late Deliveries", f"{tot_d_late} / {df_benchmarks['num_orders'].sum()}", "Across 27 instances")
        m_col4.metric("Avg Decomposed Solve Time", f"{avg_d_time:.1f} s", "HiGHS Subproblems")

        # Visualization: On-Time Delivery Rate by Day & Scenario
        fig_otr = px.bar(
            df_benchmarks,
            x="day",
            y=["greedy_on_time_rate_pct", "decomp_on_time_rate_pct"],
            color_discrete_map={"greedy_on_time_rate_pct": "#64748b", "decomp_on_time_rate_pct": "#6366f1"},
            barmode="group",
            facet_col="scenario",
            labels={"value": "On-Time Rate (%)", "day": "Day", "variable": "Engine"},
            title="Punctuality SLA Compliance across 9 Days (Optimistic vs Most-Likely vs Pessimistic)",
            height=420
        )
        fig_otr.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            legend_title_text="",
            margin=dict(t=50, b=30, l=30, r=30)
        )
        st.plotly_chart(fig_otr, use_container_width=True)

        # Visualization: Distance vs Late Deliveries
        fig_scatter = px.scatter(
            df_benchmarks,
            x="decomp_distance_km",
            y="decomp_late_deliveries",
            color="scenario",
            size="num_orders",
            hover_data=["day", "decomp_vehicles", "decomp_on_time_rate_pct"],
            title="Decomposed MILP Trade-Off: Fleet Distance vs Late Deliveries across Scenarios",
            color_discrete_map={"optimistic": "#06b6d4", "mostlikely": "#eab308", "pessimistic": "#f43f5e"},
            height=400
        )
        fig_scatter.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig_scatter, use_container_width=True)

        # Full Filterable Table
        st.markdown("#### Complete 27-Instance Benchmark Table")
        st.dataframe(df_benchmarks, use_container_width=True)


# ===========================================================================
# TAB 3: MULTI-OBJECTIVE WEIGHT EXPLORER (RQ4)
# ===========================================================================
with tab3:
    st.markdown("### Multi-Objective Weighted-Sum Scalarization Sweep (RQ4)")
    st.markdown("""
    Mathematical formulation:
    $$\\min Z = \\alpha \\left(\\frac{D}{D_0}\\right) + \\beta \\left(\\frac{T}{T_0}\\right) + \\gamma \\left(\\frac{L}{L_0}\\right) \\quad \\text{subject to } \\alpha + \\beta + \\gamma = 1$$
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
            height=440
        )
        fig_pareto.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
        st.plotly_chart(fig_pareto, use_container_width=True)

        # Best Observed Profile Highlight
        st.markdown("""
        <div class="content-panel" style="border-left: 4px solid #10b981;">
            <h4 style="margin: 0 0 8px 0; color: #34d399;">🌟 Best Observed Non-Dominated Profile: Profile 7 (Service Quality Emphasis)</h4>
            <p style="margin: 0; color: #cbd5e1; font-size: 0.9rem;">
                <b>Weights</b>: α (Distance) = 0.20, β (Travel Time) = 0.20, γ (Lateness Penalty) = 0.60<br>
                <b>Outcome</b>: Achieved <b>100.0% On-Time Delivery</b> (0.0 min lateness) at a compact distance of <b>86.0 km</b>, avoiding the severe distance blowup (+159%) seen when distance is unweighted (γ=1.0).
            </p>
        </div>
        """, unsafe_allow_html=True)

        st.dataframe(df_multi, use_container_width=True)


# ===========================================================================
# TAB 4: TRAFFIC ROBUSTNESS STRESS TEST (RQ6)
# ===========================================================================
with tab4:
    st.markdown("### Traffic Robustness Stress Testing (RQ6)")
    st.markdown("""
    **Experiment Design**:
    Take delivery routes optimized under **Most-Likely traffic** and execute them directly under severe **Pessimistic traffic congestion** without re-routing.
    This quantifies the real-world operational buffer and vulnerability of the mathematical routing plans.
    """)

    if not df_robust.empty:
        r_col1, r_col2, r_col3 = st.columns(3)
        r_col1.metric("Greedy Stressed On-Time Rate", f"{df_robust['greedy_stress_otr_pct'].mean():.1f}%", f"-{df_robust['greedy_otr_drop_pct'].mean():.1f}% drop under traffic")
        r_col2.metric("Decomposed Stressed On-Time Rate", f"{df_robust['decomp_stress_otr_pct'].mean():.1f}%", f"-{df_robust['decomp_otr_drop_pct'].mean():.1f}% drop under traffic")
        r_col3.metric("Punctuality Buffer Advantage", f"+{df_robust['decomp_stress_otr_pct'].mean() - df_robust['greedy_stress_otr_pct'].mean():.2f}%", "Decomposed resilience")

        # Punctuality Drop Comparison Plot
        fig_rob = go.Figure()
        fig_rob.add_trace(go.Bar(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["greedy_stress_otr_pct"],
            name="Greedy (Pessimistic Congestion)",
            marker_color="#ef4444"
        ))
        fig_rob.add_trace(go.Bar(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["decomp_stress_otr_pct"],
            name="Decomposed MILP (Pessimistic Congestion)",
            marker_color="#8b5cf6"
        ))
        fig_rob.update_layout(
            barmode="group",
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            title="Resilience Comparison: On-Time Percentage under Traffic Shock",
            yaxis_title="On-Time Rate (%)",
            height=400
        )
        st.plotly_chart(fig_rob, use_container_width=True)

        # Delay Surge Comparison Plot
        fig_surge = go.Figure()
        fig_surge.add_trace(go.Scatter(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["greedy_stress_lateness_min"],
            mode="lines+markers",
            name="Greedy Lateness Surge (min)",
            line=dict(color="#ef4444", width=3)
        ))
        fig_surge.add_trace(go.Scatter(
            x=[f"Day {d}" for d in df_robust["day"]],
            y=df_robust["decomp_stress_lateness_min"],
            mode="lines+markers",
            name="Decomposed Lateness Surge (min)",
            line=dict(color="#34d399", width=3)
        ))
        fig_surge.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            title="Total Fleet Delay Surge under Traffic Congestion (Minutes of Delay)",
            yaxis_title="Fleet Delay (min)",
            height=380
        )
        st.plotly_chart(fig_surge, use_container_width=True)

        st.dataframe(df_robust, use_container_width=True)


# ===========================================================================
# TAB 5: COMPUTATIONAL SCALABILITY & MIP BOUNDS (RQ2/3)
# ===========================================================================
with tab5:
    st.markdown("### Computational Scalability & Monolithic Intractability Frontier (RQ2 & RQ3)")
    st.markdown("""
    **Academic Finding**:
    Monolithic MILP exhibits exponential combinatorial growth. While small instances ($n \\le 20$) are solvable with low MIP gaps within 30s,
    at production scale ($n \\ge 40$), the monolithic formulation fails to find any feasible integer solution within specified time limits,
    empirically justifying cluster-first decomposition.
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
            name="Solver Duration (s)",
            marker_color="rgba(99, 102, 241, 0.4)",
            yaxis="y2"
        ))
        fig_scale.update_layout(
            template="plotly_dark",
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            title="Combinatorial Explosion: Relative MIP Gap and Solve Times vs Customer Count",
            xaxis_title="Number of Customer Stops (n)",
            yaxis=dict(title="Relative MIP Gap (%)", title_font=dict(color="#f43f5e")),
            yaxis2=dict(title="Solver Duration (s)", title_font=dict(color="#818cf8"), overlaying="y", side="right"),
            height=430
        )
        st.plotly_chart(fig_scale, use_container_width=True)

        st.dataframe(df_scale, use_container_width=True)
