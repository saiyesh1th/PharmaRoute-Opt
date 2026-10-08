import json
import sys
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loader import DataLoader
from src.evaluation.metrics import MetricsCalculator, SolutionMetrics
from src.evaluation.robustness import RobustnessAnalyzer


def run_robustness_stress_test(
    routes_json_path: str = "results/benchmarks/nine_day_routes.json",
    output_csv_path: str = "results/benchmarks/robustness_stress_summary.csv",
    output_json_path: str = "results/benchmarks/robustness_stress_details.json",
    figures_dir: str = "results/figures"
) -> pd.DataFrame:
    """
    Evaluates RQ6 (Traffic Robustness Stress Test):
    Executes Most-Likely optimized delivery routes in Pessimistic traffic conditions.
    Compares resilience between Greedy Baseline and Decomposed MILP across all 9 days.
    """
    print("\n" + "=" * 105)
    print(" PHARMAROUTE-OPT: TRAFFIC ROBUSTNESS STRESS TEST (RQ6)")
    print(" Plan: Most-Likely Traffic  -->  Execution: Pessimistic Traffic Congestion")
    print("=" * 105)

    with open(routes_json_path, "r", encoding="utf-8") as f:
        routes_db = json.load(f)

    loader = DataLoader()
    records = []
    details = {}

    for day in range(1, 10):
        key = f"day_{day}_mostlikely"
        if key not in routes_db:
            print(f"Warning: {key} not found in routes database.")
            continue

        instance = loader.load_day(day)
        entry = routes_db[key]
        n_orders = instance.num_orders

        # Distance and Time matrices
        dist_mat = instance.distance_matrix
        ml_time_mat = instance.time_matrix_mostlikely
        pess_time_mat = instance.time_matrix_pessimistic

        # 1. Greedy Routes
        g_routes = entry["greedy"]["routes"]
        g_norm = MetricsCalculator.evaluate_routes(g_routes, dist_mat, ml_time_mat, instance.orders)
        g_stress = RobustnessAnalyzer.cross_evaluate_plan(g_routes, dist_mat, pess_time_mat, instance.orders)

        # 2. Decomposed Routes
        d_routes = entry["decomposed"]["routes"]
        d_norm = MetricsCalculator.evaluate_routes(d_routes, dist_mat, ml_time_mat, instance.orders)
        d_stress = RobustnessAnalyzer.cross_evaluate_plan(d_routes, dist_mat, pess_time_mat, instance.orders)

        # Detailed Vehicle Shift Durations under stress
        g_overrun_veh = 0
        g_max_dur = 0.0
        for r in g_routes:
            dur = sum(pess_time_mat[r[k], r[k+1]] for k in range(len(r)-1))
            dur += sum(instance.orders[node].service_time_min for node in r if node != 0)
            g_max_dur = max(g_max_dur, dur)
            if dur > 360.0:
                g_overrun_veh += 1

        d_overrun_veh = 0
        d_max_dur = 0.0
        for r in d_routes:
            dur = sum(pess_time_mat[r[k], r[k+1]] for k in range(len(r)-1))
            dur += sum(instance.orders[node].service_time_min for node in r if node != 0)
            d_max_dur = max(d_max_dur, dur)
            if dur > 360.0:
                d_overrun_veh += 1

        # Calculate Deltas
        g_time_surge_pct = round(((g_stress.total_travel_time_min - g_norm.total_travel_time_min) / g_norm.total_travel_time_min) * 100.0, 2)
        d_time_surge_pct = round(((d_stress.total_travel_time_min - d_norm.total_travel_time_min) / d_norm.total_travel_time_min) * 100.0, 2)

        g_otr_drop_pct = round(g_norm.on_time_rate_pct - g_stress.on_time_rate_pct, 2)
        d_otr_drop_pct = round(d_norm.on_time_rate_pct - d_stress.on_time_rate_pct, 2)

        rec = {
            "day": day,
            "num_orders": n_orders,
            # Greedy Planned vs Stressed
            "greedy_plan_time_min": g_norm.total_travel_time_min,
            "greedy_stress_time_min": g_stress.total_travel_time_min,
            "greedy_time_surge_pct": g_time_surge_pct,
            "greedy_plan_late": g_norm.late_deliveries,
            "greedy_stress_late": g_stress.late_deliveries,
            "greedy_late_surge": g_stress.late_deliveries - g_norm.late_deliveries,
            "greedy_plan_lateness_min": g_norm.total_lateness_min,
            "greedy_stress_lateness_min": g_stress.total_lateness_min,
            "greedy_plan_otr_pct": g_norm.on_time_rate_pct,
            "greedy_stress_otr_pct": g_stress.on_time_rate_pct,
            "greedy_otr_drop_pct": g_otr_drop_pct,
            "greedy_shift_overrun_vehicles": g_overrun_veh,
            "greedy_max_shift_duration_min": round(g_max_dur, 1),
            # Decomposed Planned vs Stressed
            "decomp_plan_time_min": d_norm.total_travel_time_min,
            "decomp_stress_time_min": d_stress.total_travel_time_min,
            "decomp_time_surge_pct": d_time_surge_pct,
            "decomp_plan_late": d_norm.late_deliveries,
            "decomp_stress_late": d_stress.late_deliveries,
            "decomp_late_surge": d_stress.late_deliveries - d_norm.late_deliveries,
            "decomp_plan_lateness_min": d_norm.total_lateness_min,
            "decomp_stress_lateness_min": d_stress.total_lateness_min,
            "decomp_plan_otr_pct": d_norm.on_time_rate_pct,
            "decomp_stress_otr_pct": d_stress.on_time_rate_pct,
            "decomp_otr_drop_pct": d_otr_drop_pct,
            "decomp_shift_overrun_vehicles": d_overrun_veh,
            "decomp_max_shift_duration_min": round(d_max_dur, 1),
        }
        records.append(rec)

        print(
            f"Day {day:2d} ({n_orders} orders) | "
            f"Greedy OTR: {g_norm.on_time_rate_pct:5.1f}% -> {g_stress.on_time_rate_pct:5.1f}% (Drop: {g_otr_drop_pct:5.1f}%, +{rec['greedy_late_surge']} late) | "
            f"Decomp OTR: {d_norm.on_time_rate_pct:5.1f}% -> {d_stress.on_time_rate_pct:5.1f}% (Drop: {d_otr_drop_pct:5.1f}%, +{rec['decomp_late_surge']} late)"
        )

    df_out = pd.DataFrame(records)
    out_csv = Path(output_csv_path)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(out_csv, index=False)
    print(f"\nSummary saved to: {out_csv}")

    # Generate Publication-Quality Figures
    fig_path = Path(figures_dir)
    fig_path.mkdir(parents=True, exist_ok=True)
    generate_robustness_figures(df_out, fig_path)

    return df_out


def generate_robustness_figures(df: pd.DataFrame, fig_dir: Path):
    """Creates publication-ready visualizations of traffic stress degradation."""
    sns.set_theme(style="whitegrid", font="sans-serif")

    # Figure 1: On-Time Delivery Rate: Planned vs Stressed
    plt.figure(figsize=(12, 6))
    x = np.arange(len(df["day"]))
    width = 0.2

    plt.bar(x - 1.5 * width, df["greedy_plan_otr_pct"], width, label="Greedy (Most-Likely Plan)", color="#64748b", alpha=0.85)
    plt.bar(x - 0.5 * width, df["greedy_stress_otr_pct"], width, label="Greedy (Pessimistic Traffic)", color="#ef4444", alpha=0.85)
    plt.bar(x + 0.5 * width, df["decomp_plan_otr_pct"], width, label="Decomposed MILP (Most-Likely Plan)", color="#0ea5e9", alpha=0.85)
    plt.bar(x + 1.5 * width, df["decomp_stress_otr_pct"], width, label="Decomposed MILP (Pessimistic Traffic)", color="#8b5cf6", alpha=0.85)

    plt.xlabel("Delivery Day", fontsize=12, fontweight="bold", labelpad=10)
    plt.ylabel("On-Time Delivery Rate (%)", fontsize=12, fontweight="bold", labelpad=10)
    plt.title("Traffic Robustness Stress Test: Punctuality Degradation under Congestion", fontsize=14, fontweight="bold", pad=15)
    plt.xticks(x, [f"Day {d}" for d in df["day"]], fontsize=10)
    plt.ylim(50, 105)
    plt.legend(frameon=True, facecolor="white", framealpha=0.9, loc="lower left")
    plt.tight_layout()

    otr_fig_path = fig_dir / "robustness_otr_degradation.png"
    plt.savefig(otr_fig_path, dpi=300)
    plt.close()
    print(f"Saved figure: {otr_fig_path}")

    # Figure 2: Total Lateness Surge (Minutes)
    plt.figure(figsize=(10, 5))
    plt.plot(df["day"], df["greedy_stress_lateness_min"], marker="o", linewidth=2.5, color="#ef4444", label="Greedy Lateness Surge (min)")
    plt.plot(df["day"], df["decomp_stress_lateness_min"], marker="s", linewidth=2.5, color="#8b5cf6", label="Decomposed MILP Lateness Surge (min)")
    plt.fill_between(df["day"], df["decomp_stress_lateness_min"], df["greedy_stress_lateness_min"], color="#ef4444", alpha=0.15, label="Excess Delay Avoided")

    plt.xlabel("Delivery Day", fontsize=12, fontweight="bold", labelpad=10)
    plt.ylabel("Total Fleet Lateness (Minutes)", fontsize=12, fontweight="bold", labelpad=10)
    plt.title("Delay Amplification under Severe Traffic Congestion across 9 Days", fontsize=13, fontweight="bold", pad=15)
    plt.xticks(df["day"], [f"Day {d}" for d in df["day"]])
    plt.legend(frameon=True, facecolor="white", framealpha=0.9)
    plt.tight_layout()

    lateness_fig_path = fig_dir / "robustness_lateness_surge.png"
    plt.savefig(lateness_fig_path, dpi=300)
    plt.close()
    print(f"Saved figure: {lateness_fig_path}")


if __name__ == "__main__":
    run_robustness_stress_test()
