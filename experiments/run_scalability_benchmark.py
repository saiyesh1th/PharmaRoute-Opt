import argparse
import sys
import time
from pathlib import Path
import pandas as pd
import numpy as np

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loader import DataLoader
from src.data.schema import VehicleConfig, DeliveryInstance
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver


def run_scalability_benchmark(
    day: int = 1,
    scenario: str = "mostlikely",
    sizes: list = None,
    time_limit_sec: int = 60,
    output_csv: str = None
):
    if sizes is None:
        sizes = [25, 30, 40, 50, 78]

    loader = DataLoader()
    instance = loader.load_day(day)
    config = VehicleConfig()

    out_p = Path(output_csv) if output_csv else None
    existing_df = None
    if out_p and out_p.exists():
        try:
            existing_df = pd.read_csv(out_p)
            print(f"Loaded {len(existing_df)} existing records from: {out_p}")
        except Exception:
            existing_df = None

    records = []
    print("\n" + "=" * 95)
    print(f" PHARMAROUTE-OPT: MONOLITHIC MILP SCALABILITY EXPERIMENT (DAY {day}, {scenario.upper()})")
    print(f" Target Sizes: {sizes} | Time Limit: {time_limit_sec}s per run")
    print("=" * 95)

    for n in sizes:
        n_actual = min(n, instance.num_orders)
        subset_nodes = list(range(1, n_actual + 1))
        print(f"\n>>> Benchmarking Instance Size: n = {n_actual} customers (Nodes 1..{n_actual}) <<<")

        # 1. Baseline Heuristic
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
        baseline_solver = NearestNeighborCVRPTW(config)
        b_sol = baseline_solver.solve(sub_inst, scenario=scenario)
        t_base = time.perf_counter() - t0

        base_rec = {
            "n_customers": n_actual,
            "method": "Greedy Baseline",
            "time_limit_sec": None,
            "solver_status": "Heuristic Complete",
            "primal_bound_km": b_sol.total_distance_km,
            "dual_bound_km": None,
            "mip_gap_pct": None,
            "improvement_pct": 0.0,
            "nodes_explored": None,
            "runtime_sec": round(t_base, 4),
            "vehicles": b_sol.vehicles_used,
            "total_distance_km": b_sol.total_distance_km,
            "total_travel_time_min": b_sol.total_travel_time_min,
            "late_deliveries": b_sol.total_late_deliveries,
            "total_lateness_min": b_sol.total_lateness_min
        }
        records.append(base_rec)
        print(f"  [Baseline] Dist: {b_sol.total_distance_km} km | Time: {b_sol.total_travel_time_min} min | Veh: {b_sol.vehicles_used} | Late: {b_sol.total_late_deliveries} | CPU: {t_base:.4f}s")

        # 2. Monolithic MILP with HiGHS
        print(f"  [MILP HiGHS] Formulating & solving with {time_limit_sec}s time limit...")
        builder = CVRPTWModelBuilder(instance, scenario=scenario, vehicle_config=config, subset_nodes=subset_nodes)
        solver = CVRPTWSolver(time_limit_sec=time_limit_sec, verbose=False)
        m_sol = solver.solve(builder)

        # Compute improvement over baseline if a feasible solution was found
        imp_pct = None
        if m_sol.total_distance_km is not None and m_sol.total_distance_km > 0 and b_sol.total_distance_km > 0:
            imp_pct = round(((b_sol.total_distance_km - m_sol.total_distance_km) / b_sol.total_distance_km) * 100.0, 2)

        gap_str = f"{m_sol.mip_gap_pct}%" if m_sol.mip_gap_pct is not None else "N/A"
        sol_dist = m_sol.total_distance_km if m_sol.is_feasible else "Infeasible/NoSol"
        print(f"  [MILP HiGHS] Status: {m_sol.status} | Dist: {sol_dist} km | Lower Bound: {m_sol.dual_bound} km | Gap: {gap_str} | Imp: {imp_pct}% | CPU: {m_sol.solve_duration_sec}s")

        milp_rec = {
            "n_customers": n_actual,
            "method": "Monolithic MILP (HiGHS)",
            "time_limit_sec": time_limit_sec,
            "solver_status": m_sol.status,
            "primal_bound_km": m_sol.primal_bound,
            "dual_bound_km": m_sol.dual_bound,
            "mip_gap_pct": m_sol.mip_gap_pct,
            "improvement_pct": imp_pct,
            "nodes_explored": m_sol.nodes_explored,
            "runtime_sec": m_sol.solve_duration_sec,
            "vehicles": m_sol.vehicles_used,
            "total_distance_km": m_sol.total_distance_km,
            "total_travel_time_min": m_sol.total_travel_time_min,
            "late_deliveries": m_sol.late_deliveries,
            "total_lateness_min": m_sol.total_lateness_min
        }
        records.append(milp_rec)

    new_df = pd.DataFrame(records)

    # Merge with existing df if present
    if existing_df is not None:
        # Match columns
        common_cols = [c for c in new_df.columns if c in existing_df.columns]
        # Remove old rows matching the new sizes and methods to avoid duplicates
        filtered_old = existing_df[~((existing_df["n_customers"].isin(sizes)))]
        merged_df = pd.concat([filtered_old, new_df], ignore_index=True)
        # Sort by n_customers and method
        merged_df = merged_df.sort_values(by=["n_customers", "method"], ascending=[True, False])
    else:
        merged_df = new_df

    print("\n" + "=" * 95)
    print(" CONSOLIDATED SCALABILITY BENCHMARK SUMMARY TABLE")
    print("=" * 95)
    print(merged_df.to_string(index=False))

    if out_p:
        out_p.parent.mkdir(parents=True, exist_ok=True)
        merged_df.to_csv(out_p, index=False)
        print(f"\nAll results saved to: {out_p}")

    return merged_df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monolithic MILP Scalability Benchmark")
    parser.add_argument("--day", type=int, default=1, help="Day index (1-9)")
    parser.add_argument("--scenario", type=str, default="mostlikely", help="Traffic scenario")
    parser.add_argument("--time-limit", type=int, default=60, help="Per-run time limit in seconds")
    parser.add_argument("--sizes", type=int, nargs="+", default=[25, 30, 40, 50, 78], help="List of customer counts")
    parser.add_argument("--output", type=str, default="results/benchmarks/scalability_day_01.csv", help="Output CSV path")
    args = parser.parse_args()

    run_scalability_benchmark(
        day=args.day,
        scenario=args.scenario,
        sizes=args.sizes,
        time_limit_sec=args.time_limit,
        output_csv=args.output
    )
