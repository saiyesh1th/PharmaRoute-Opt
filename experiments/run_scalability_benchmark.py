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


def run_scalability_benchmark(
    day: int = 1,
    scenario: str = "mostlikely",
    sizes: list = None,
    time_limit_sec: int = 60,
    output_csv: str = None
):
    if sizes is None:
        sizes = [10, 15, 20, 25, 30, 40, 50, 60, 78]

    loader = DataLoader()
    instance = loader.load_day(day)
    config = VehicleConfig()

    records = []
    print("\n" + "=" * 90)
    print(f" PHARMAROUTE-OPT: MONOLITHIC MILP SCALABILITY EXPERIMENT (DAY {day}, {scenario.upper()})")
    print(f" Solver: HiGHS | Time Limit per run: {time_limit_sec}s")
    print("=" * 90)

    for n in sizes:
        n_actual = min(n, instance.num_orders)
        subset_nodes = list(range(1, n_actual + 1))
        print(f"\n>>> Benchmarking Instance Size: n = {n_actual} customers (Nodes 1..{n_actual}) <<<")

        # 1. Baseline Heuristic
        t0 = time.perf_counter()
        # Build sub-instance for fair comparison
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

        records.append({
            "n_customers": n_actual,
            "method": "Greedy Baseline",
            "solver_status": "Heuristic Complete",
            "primal_bound_km": b_sol.total_distance_km,
            "dual_bound_km": None,
            "mip_gap_pct": None,
            "runtime_sec": round(t_base, 4),
            "vehicles": b_sol.vehicles_used,
            "total_distance_km": b_sol.total_distance_km,
            "total_travel_time_min": b_sol.total_travel_time_min,
            "late_deliveries": b_sol.total_late_deliveries,
            "total_lateness_min": b_sol.total_lateness_min
        })
        print(f"  [Baseline] Dist: {b_sol.total_distance_km} km | Time: {b_sol.total_travel_time_min} min | Veh: {b_sol.vehicles_used} | Late: {b_sol.total_late_deliveries} | CPU: {t_base:.3f}s")

        # 2. Monolithic MILP with HiGHS
        print(f"  [MILP HiGHS] Formulating & solving with {time_limit_sec}s time limit...")
        builder = CVRPTWModelBuilder(instance, scenario=scenario, vehicle_config=config, subset_nodes=subset_nodes)
        solver = CVRPTWSolver(time_limit_sec=time_limit_sec, verbose=False)
        m_sol = solver.solve(builder)

        gap_str = f"{m_sol.mip_gap_pct}%" if m_sol.mip_gap_pct is not None else "0.0%"
        print(f"  [MILP HiGHS] Status: {m_sol.status} | Best Sol: {m_sol.primal_bound} km | Lower Bound: {m_sol.dual_bound} km | Gap: {gap_str} | CPU: {m_sol.solve_duration_sec}s")

        records.append({
            "n_customers": n_actual,
            "method": "Monolithic MILP (HiGHS)",
            "solver_status": m_sol.status,
            "primal_bound_km": m_sol.primal_bound,
            "dual_bound_km": m_sol.dual_bound,
            "mip_gap_pct": m_sol.mip_gap_pct,
            "runtime_sec": m_sol.solve_duration_sec,
            "vehicles": m_sol.vehicles_used,
            "total_distance_km": m_sol.total_distance_km,
            "total_travel_time_min": m_sol.total_travel_time_min,
            "late_deliveries": m_sol.late_deliveries,
            "total_lateness_min": m_sol.total_lateness_min
        })

    df_results = pd.DataFrame(records)
    print("\n" + "=" * 90)
    print(" SCALABILITY BENCHMARK SUMMARY TABLE")
    print("=" * 90)
    print(df_results.to_string(index=False))

    if output_csv:
        out_p = Path(output_csv)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        df_results.to_csv(out_p, index=False)
        print(f"\nResults saved to: {out_p}")

    return df_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monolithic MILP Scalability Benchmark")
    parser.add_argument("--day", type=int, default=1, help="Day index (1-9)")
    parser.add_argument("--scenario", type=str, default="mostlikely", help="Traffic scenario")
    parser.add_argument("--time-limit", type=int, default=60, help="Per-run time limit in seconds")
    parser.add_argument("--sizes", type=int, nargs="+", default=[10, 15, 20, 25, 30], help="List of customer counts")
    parser.add_argument("--output", type=str, default="results/benchmarks/scalability_day_01.csv", help="Output CSV path")
    args = parser.parse_args()

    run_scalability_benchmark(
        day=args.day,
        scenario=args.scenario,
        sizes=args.sizes,
        time_limit_sec=args.time_limit,
        output_csv=args.output
    )
