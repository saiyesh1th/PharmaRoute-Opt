import argparse
import sys
import time
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Ensure UTF-8 output on Windows consoles
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from src.data.loader import DataLoader
from src.data.schema import VehicleConfig, DeliveryInstance
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver


DEFAULT_WEIGHT_CONFIGS = [
    {"name": "Pure Distance", "alpha": 1.0, "beta": 0.0, "gamma": 0.0},
    {"name": "Pure Travel Time", "alpha": 0.0, "beta": 1.0, "gamma": 0.0},
    {"name": "Pure Punctuality", "alpha": 0.0, "beta": 0.0, "gamma": 1.0},
    {"name": "Distance Priority", "alpha": 0.7, "beta": 0.2, "gamma": 0.1},
    {"name": "Distance Emphasis", "alpha": 0.6, "beta": 0.2, "gamma": 0.2},
    {"name": "Balanced Compromise", "alpha": 0.4, "beta": 0.3, "gamma": 0.3},
    {"name": "Uniform Balanced", "alpha": 0.33, "beta": 0.33, "gamma": 0.34},
    {"name": "Time Priority", "alpha": 0.2, "beta": 0.6, "gamma": 0.2},
    {"name": "Service Quality Emphasis", "alpha": 0.2, "beta": 0.2, "gamma": 0.6},
    {"name": "Strict Service Priority", "alpha": 0.1, "beta": 0.1, "gamma": 0.8},
]


def identify_pareto_frontier(df: pd.DataFrame) -> pd.Series:
    """
    Identifies non-dominated Pareto-optimal solutions across (Distance, Travel Time, Lateness).
    A solution i dominates j if:
        D_i <= D_j, T_i <= T_j, L_i <= L_j and at least one is strictly less (<).
    """
    is_pareto = []
    points = df[["total_distance_km", "total_travel_time_min", "total_lateness_min"]].to_numpy()
    n_points = len(points)

    for i in range(n_points):
        dominated = False
        p_i = points[i]
        for j in range(n_points):
            if i == j:
                continue
            p_j = points[j]
            # Does point j dominate point i?
            if np.all(p_j <= p_i) and np.any(p_j < p_i):
                dominated = True
                break
        is_pareto.append(not dominated)

    return pd.Series(is_pareto, index=df.index)


def plot_pareto_analysis(df: pd.DataFrame, output_fig_path: Path):
    """Generates a publication-quality 2x2 multi-objective trade-off dashboard."""
    output_fig_path.parent.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", palette="deep")
    fig, axes = plt.subplots(2, 2, figsize=(14, 11))

    df_plot = df.copy()
    df_plot["label"] = df_plot["profile_name"]

    # 1. Distance vs. Total Lateness
    ax1 = axes[0, 0]
    sns.scatterplot(
        data=df_plot,
        x="total_distance_km",
        y="total_lateness_min",
        hue="is_pareto",
        style="is_pareto",
        s=120,
        markers={True: "*", False: "o"},
        palette={True: "#d95f02", False: "#7570b3"},
        ax=ax1,
        legend=False
    )
    for _, row in df_plot.iterrows():
        ax1.annotate(
            row["profile_name"],
            (row["total_distance_km"], row["total_lateness_min"]),
            textcoords="offset points",
            xytext=(5, 5),
            fontsize=8,
            alpha=0.85
        )
    ax1.set_title("Pareto Trade-Off: Total Distance vs. Lateness", fontsize=12, fontweight="bold")
    ax1.set_xlabel("Total Travel Distance (km)", fontsize=10)
    ax1.set_ylabel("Total Lateness (minutes)", fontsize=10)

    # 2. Travel Time vs. Total Lateness
    ax2 = axes[0, 1]
    sns.scatterplot(
        data=df_plot,
        x="total_travel_time_min",
        y="total_lateness_min",
        hue="is_pareto",
        style="is_pareto",
        s=120,
        markers={True: "*", False: "o"},
        palette={True: "#d95f02", False: "#7570b3"},
        ax=ax2,
        legend=False
    )
    for _, row in df_plot.iterrows():
        ax2.annotate(
            row["profile_name"],
            (row["total_travel_time_min"], row["total_lateness_min"]),
            textcoords="offset points",
            xytext=(5, 5),
            fontsize=8,
            alpha=0.85
        )
    ax2.set_title("Pareto Trade-Off: Travel Time vs. Lateness", fontsize=12, fontweight="bold")
    ax2.set_xlabel("Total Travel Time (minutes)", fontsize=10)
    ax2.set_ylabel("Total Lateness (minutes)", fontsize=10)

    # 3. Distance vs. Travel Time
    ax3 = axes[1, 0]
    sns.scatterplot(
        data=df_plot,
        x="total_distance_km",
        y="total_travel_time_min",
        hue="is_pareto",
        style="is_pareto",
        s=120,
        markers={True: "*", False: "o"},
        palette={True: "#d95f02", False: "#7570b3"},
        ax=ax3,
        legend=False
    )
    for _, row in df_plot.iterrows():
        ax3.annotate(
            row["profile_name"],
            (row["total_distance_km"], row["total_travel_time_min"]),
            textcoords="offset points",
            xytext=(5, 5),
            fontsize=8,
            alpha=0.85
        )
    ax3.set_title("Distance vs. Travel Time", fontsize=12, fontweight="bold")
    ax3.set_xlabel("Total Travel Distance (km)", fontsize=10)
    ax3.set_ylabel("Total Travel Time (minutes)", fontsize=10)

    # 4. Sensitivity of Objectives Across Weight Profiles
    ax4 = axes[1, 1]
    df_norm = df_plot.copy()
    # Normalize metrics to [0, 1] range for visual comparison
    for col in ["total_distance_km", "total_travel_time_min", "total_lateness_min"]:
        c_min, c_max = df_norm[col].min(), df_norm[col].max()
        df_norm[f"norm_{col}"] = (df_norm[col] - c_min) / (c_max - c_min) if (c_max > c_min) else 0.0

    df_melted = df_norm.melt(
        id_vars=["profile_name"],
        value_vars=["norm_total_distance_km", "norm_total_travel_time_min", "norm_total_lateness_min"],
        var_name="Objective",
        value_name="Normalized_Value"
    )
    df_melted["Objective"] = df_melted["Objective"].map({
        "norm_total_distance_km": "Distance",
        "norm_total_travel_time_min": "Travel Time",
        "norm_total_lateness_min": "Lateness"
    })
    sns.barplot(
        data=df_melted,
        x="profile_name",
        y="Normalized_Value",
        hue="Objective",
        ax=ax4,
        palette="Set2"
    )
    ax4.set_title("Objective Metric Sensitivity by Profile", fontsize=12, fontweight="bold")
    ax4.set_xlabel("Weight Profile", fontsize=10)
    ax4.set_ylabel("Normalized Metric [0 = Min, 1 = Max]", fontsize=10)
    ax4.tick_params(axis="x", rotation=45)
    ax4.legend(loc="upper right", fontsize=9)

    plt.suptitle("PharmaRoute-Opt: Multi-Objective Trade-Off & Pareto Analysis (Day 1)", fontsize=15, fontweight="bold")
    plt.tight_layout()
    plt.savefig(output_fig_path, dpi=300)
    plt.close()
    print(f"Pareto analysis figure saved to: {output_fig_path}")


def run_multiobjective_sweep(
    day: int = 1,
    n_customers: int = 15,
    scenario: str = "mostlikely",
    time_limit_sec: int = 25,
    output_csv: str = "results/benchmarks/multiobjective_sweep_day_01.csv",
    output_fig: str = "results/figures/pareto_frontier_day_01.png"
):
    print("\n" + "=" * 95)
    print(f" PHARMAROUTE-OPT: MULTI-OBJECTIVE WEIGHT SWEEP EXPERIMENT (DAY {day}, n={n_customers})")
    print(f" Formulation: min a*(D/D0) + b*(T/T0) + c*(L/L0) | Time limit: {time_limit_sec}s/run")
    print("=" * 95)

    loader = DataLoader()
    instance = loader.load_day(day)
    config = VehicleConfig()
    subset_nodes = list(range(1, min(n_customers + 1, instance.num_nodes)))

    # Step 1: Calibrate Normalization Scalars (D0, T0, L0) via baseline
    sub_orders = {node: instance.orders[node] for node in subset_nodes}
    sub_inst = DeliveryInstance(
        day=instance.day,
        num_orders=len(sub_orders),
        num_nodes=len(sub_orders) + 1,
        depot_id=0,
        orders=sub_orders,
        distance_matrix=instance.distance_matrix,
        time_matrix_mostlikely=instance.time_matrix_mostlikely,
        time_matrix_optimistic=instance.time_matrix_optimistic,
        time_matrix_pessimistic=instance.time_matrix_pessimistic
    )
    b_sol = NearestNeighborCVRPTW(config).solve(sub_inst, scenario=scenario)
    norm_d = max(b_sol.total_distance_km, 1.0)
    norm_t = max(b_sol.total_travel_time_min, 1.0)
    norm_l = max(b_sol.total_lateness_min, 30.0)  # Use 30 min as standard baseline reference

    print(f"\nNormalization Baseline Scalars Calibrated:")
    print(f"  - Distance Normalizer D0: {norm_d:.1f} km")
    print(f"  - Travel Time Normalizer T0: {norm_t:.1f} min")
    print(f"  - Lateness Normalizer L0: {norm_l:.1f} min")

    records = []

    for cfg in DEFAULT_WEIGHT_CONFIGS:
        p_name = cfg["name"]
        alpha = cfg["alpha"]
        beta = cfg["beta"]
        gamma = cfg["gamma"]

        print(f"\n>>> Running Profile: {p_name} [a={alpha:.2f}, b={beta:.2f}, c={gamma:.2f}] <<<")
        builder = CVRPTWModelBuilder(
            instance=instance,
            scenario=scenario,
            vehicle_config=config,
            subset_nodes=subset_nodes,
            alpha=alpha,
            beta=beta,
            gamma=gamma,
            norm_distance=norm_d,
            norm_time=norm_t,
            norm_lateness=norm_l
        )
        solver = CVRPTWSolver(time_limit_sec=time_limit_sec, verbose=False)
        sol = solver.solve(builder)

        # Calculate on-time rate
        served = len(subset_nodes)
        on_time_pct = round(((served - sol.late_deliveries) / served * 100.0), 2) if served > 0 else 100.0

        records.append({
            "profile_name": p_name,
            "alpha_distance": alpha,
            "beta_time": beta,
            "gamma_lateness": gamma,
            "solver_status": sol.status,
            "is_feasible": sol.is_feasible,
            "objective_value": sol.objective_value,
            "primal_bound": sol.primal_bound,
            "dual_bound": sol.dual_bound,
            "mip_gap_pct": sol.mip_gap_pct,
            "runtime_sec": sol.solve_duration_sec,
            "vehicles_used": sol.vehicles_used,
            "total_distance_km": sol.total_distance_km,
            "total_travel_time_min": sol.total_travel_time_min,
            "late_deliveries": sol.late_deliveries,
            "total_lateness_min": sol.total_lateness_min,
            "on_time_rate_pct": on_time_pct,
            "routes": str(sol.routes)
        })

        gap_str = f"{sol.mip_gap_pct}%" if sol.mip_gap_pct is not None else "0.0%"
        print(f"  Result: Dist={sol.total_distance_km} km | Time={sol.total_travel_time_min} min | Late={sol.late_deliveries} ({sol.total_lateness_min}m) | OTR={on_time_pct}% | Gap={gap_str} | CPU={sol.solve_duration_sec}s")

    df_results = pd.DataFrame(records)

    # Compute Pareto efficiency
    df_results["is_pareto"] = identify_pareto_frontier(df_results)

    print("\n" + "=" * 95)
    print(" MULTI-OBJECTIVE WEIGHT SWEEP SUMMARY TABLE")
    print("=" * 95)
    cols_display = [
        "profile_name", "alpha_distance", "beta_time", "gamma_lateness",
        "total_distance_km", "total_travel_time_min", "late_deliveries",
        "total_lateness_min", "on_time_rate_pct", "is_pareto"
    ]
    print(df_results[cols_display].to_string(index=False))

    # Save CSV
    out_csv = Path(output_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    df_results.to_csv(out_csv, index=False)
    print(f"\nResults saved to CSV: {out_csv}")

    # Plot Pareto dashboard
    out_fig = Path(output_fig)
    plot_pareto_analysis(df_results, out_fig)

    return df_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-Objective Weight Sweep Experiment")
    parser.add_argument("--day", type=int, default=1, help="Day instance")
    parser.add_argument("--size", type=int, default=15, help="Number of customer nodes")
    parser.add_argument("--scenario", type=str, default="mostlikely", help="Traffic scenario")
    parser.add_argument("--time-limit", type=int, default=20, help="Per-configuration time limit in seconds")
    parser.add_argument("--output-csv", type=str, default="results/benchmarks/multiobjective_sweep_day_01.csv")
    parser.add_argument("--output-fig", type=str, default="results/figures/pareto_frontier_day_01.png")
    args = parser.parse_args()

    run_multiobjective_sweep(
        day=args.day,
        n_customers=args.size,
        scenario=args.scenario,
        time_limit_sec=args.time_limit,
        output_csv=args.output_csv,
        output_fig=args.output_fig
    )
