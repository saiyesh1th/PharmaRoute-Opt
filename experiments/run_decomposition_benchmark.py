import argparse
import sys
import time
from pathlib import Path
import pandas as pd

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loader import DataLoader
from src.data.schema import VehicleConfig, DeliveryInstance
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver
from src.optimization.decomposition import FeasibilityAwareDecomposition


def run_decomposition_benchmark(
    day: int = 1,
    scenario: str = "mostlikely",
    size: int = 25,
    time_limit_mono: int = 60,
    time_limit_cluster: int = 20,
    output_csv: str = "results/benchmarks/decomposition_comparison_day_01.csv"
):
    print("\n" + "=" * 95)
    print(f" PHARMAROUTE-OPT: DECOMPOSITION VS MONOLITHIC BENCHMARK (DAY {day}, n={size}, {scenario.upper()})")
    print(f" Monolithic Limit: {time_limit_mono}s | Cluster MILP Limit: {time_limit_cluster}s")
    print("=" * 95)

    loader = DataLoader()
    instance = loader.load_day(day)
    config = VehicleConfig()

    subset_nodes = list(range(1, min(size + 1, instance.num_nodes)))
    n_actual = len(subset_nodes)

    records = []

    # 1. Greedy Baseline Heuristic
    print(f"\n[1/3] Running Greedy Baseline on {n_actual} customers...")
    t0 = time.perf_counter()
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
    t_base = time.perf_counter() - t0

    records.append({
        "instance_size": n_actual,
        "method": "Greedy Baseline",
        "solver_status": "Heuristic Complete",
        "total_distance_km": b_sol.total_distance_km,
        "total_travel_time_min": b_sol.total_travel_time_min,
        "vehicles_used": b_sol.vehicles_used,
        "late_deliveries": b_sol.total_late_deliveries,
        "total_lateness_min": b_sol.total_lateness_min,
        "on_time_rate_pct": b_sol.on_time_rate_pct,
        "runtime_sec": round(t_base, 4),
        "notes": "Greedy sequential construction"
    })
    print(f"  -> Dist: {b_sol.total_distance_km} km | Time: {b_sol.total_travel_time_min} min | Veh: {b_sol.vehicles_used} | Late: {b_sol.total_late_deliveries} | CPU: {t_base:.4f}s")

    # 2. Monolithic MILP
    print(f"\n[2/3] Running Monolithic MILP on {n_actual} customers (Time limit: {time_limit_mono}s)...")
    builder = CVRPTWModelBuilder(instance, scenario=scenario, vehicle_config=config, subset_nodes=subset_nodes)
    solver = CVRPTWSolver(time_limit_sec=time_limit_mono, verbose=False)
    m_sol = solver.solve(builder)

    mono_dist = m_sol.total_distance_km if m_sol.is_feasible and m_sol.total_distance_km > 0 else None
    mono_time = m_sol.total_travel_time_min if m_sol.is_feasible and m_sol.total_travel_time_min > 0 else None
    mono_late = m_sol.late_deliveries if m_sol.is_feasible else None
    mono_lateness = m_sol.total_lateness_min if m_sol.is_feasible else None
    mono_otr = round(((n_actual - m_sol.late_deliveries) / n_actual * 100.0), 2) if m_sol.is_feasible and mono_late is not None else None

    records.append({
        "instance_size": n_actual,
        "method": "Monolithic MILP (HiGHS)",
        "solver_status": m_sol.status,
        "total_distance_km": mono_dist,
        "total_travel_time_min": mono_time,
        "vehicles_used": m_sol.vehicles_used if m_sol.is_feasible else 0,
        "late_deliveries": mono_late,
        "total_lateness_min": mono_lateness,
        "on_time_rate_pct": mono_otr,
        "runtime_sec": m_sol.solve_duration_sec,
        "notes": f"MIP Gap: {m_sol.mip_gap_pct}%" if m_sol.mip_gap_pct is not None else "No feasible solution within limit"
    })
    print(f"  -> Status: {m_sol.status} | Dist: {mono_dist} km | Veh: {m_sol.vehicles_used} | Late: {mono_late} | CPU: {m_sol.solve_duration_sec:.2f}s")

    # 3. Decomposed MILP
    print(f"\n[3/3] Running Feasibility-Aware Decomposed MILP on {n_actual} customers...")
    decomposer = FeasibilityAwareDecomposition(
        vehicle_config=config,
        max_cluster_size=15,
        time_limit_per_cluster=time_limit_cluster
    )
    d_sol = decomposer.solve(instance, scenario=scenario, subset_nodes=subset_nodes)

    records.append({
        "instance_size": n_actual,
        "method": "Decomposed MILP (Hybrid)",
        "solver_status": f"{d_sol.num_clusters} Clusters Solved",
        "total_distance_km": d_sol.total_distance_km,
        "total_travel_time_min": d_sol.total_travel_time_min,
        "vehicles_used": d_sol.vehicles_used,
        "late_deliveries": d_sol.late_deliveries,
        "total_lateness_min": d_sol.total_lateness_min,
        "on_time_rate_pct": d_sol.on_time_rate_pct,
        "runtime_sec": d_sol.total_runtime_sec,
        "notes": f"Cluster solve times: {d_sol.cluster_solve_times}"
    })
    print(f"  -> Dist: {d_sol.total_distance_km} km | Time: {d_sol.total_travel_time_min} min | Veh: {d_sol.vehicles_used} | Late: {d_sol.late_deliveries} | OTR: {d_sol.on_time_rate_pct}% | CPU: {d_sol.total_runtime_sec:.2f}s")

    df_out = pd.DataFrame(records)
    print("\n" + "=" * 95)
    print(f" THREE-METHOD COMPARATIVE SUMMARY TABLE (n={n_actual})")
    print("=" * 95)
    cols = ["method", "solver_status", "total_distance_km", "total_travel_time_min", "vehicles_used", "late_deliveries", "on_time_rate_pct", "runtime_sec"]
    print(df_out[cols].to_string(index=False))

    out_p = Path(output_csv)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    # Append or write
    if out_p.exists():
        existing = pd.read_csv(out_p)
        filtered = existing[~((existing["instance_size"] == n_actual))]
        combined = pd.concat([filtered, df_out], ignore_index=True)
        combined.to_csv(out_p, index=False)
    else:
        df_out.to_csv(out_p, index=False)
    print(f"\nResults saved to: {out_p}")

    return df_out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Decomposition Benchmark Runner")
    parser.add_argument("--day", type=int, default=1, help="Day index")
    parser.add_argument("--scenario", type=str, default="mostlikely", help="Traffic scenario")
    parser.add_argument("--size", type=int, default=25, help="Number of customers (e.g. 25 or 78)")
    parser.add_argument("--time-limit-mono", type=int, default=60, help="Monolithic time limit in seconds")
    parser.add_argument("--time-limit-cluster", type=int, default=20, help="Per-cluster time limit in seconds")
    parser.add_argument("--output-csv", type=str, default="results/benchmarks/decomposition_comparison_day_01.csv")
    args = parser.parse_args()

    run_decomposition_benchmark(
        day=args.day,
        scenario=args.scenario,
        size=args.size,
        time_limit_mono=args.time_limit_mono,
        time_limit_cluster=args.time_limit_cluster,
        output_csv=args.output_csv
    )
