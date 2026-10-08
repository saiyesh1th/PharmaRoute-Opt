import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.loader import DataLoader
from src.data.schema import VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.decomposition import FeasibilityAwareDecomposition


def run_nine_day_benchmark(
    start_day: int = 1,
    end_day: int = 9,
    scenarios: List[str] = None,
    time_limit_cluster: int = 12,
    output_csv: str = "results/benchmarks/nine_day_benchmark.csv",
    routes_json: str = "results/benchmarks/nine_day_routes.json"
) -> pd.DataFrame:
    """
    Executes the comprehensive 9-day x 3-traffic-scenario benchmark (27 instances),
    evaluating Greedy Heuristic vs. Feasibility-Aware Decomposed MILP.
    """
    if scenarios is None:
        scenarios = ["optimistic", "mostlikely", "pessimistic"]

    print("\n" + "=" * 105)
    print(f" PHARMAROUTE-OPT: FULL 9-DAY x 3-SCENARIO BENCHMARK (DAYS {start_day}-{end_day})")
    print(f" Scenarios: {', '.join(scenarios)} | Per-Cluster MILP Limit: {time_limit_cluster}s")
    print("=" * 105)

    loader = DataLoader()
    config = VehicleConfig()
    decomposer = FeasibilityAwareDecomposition(
        vehicle_config=config,
        max_cluster_size=16,
        time_limit_per_cluster=time_limit_cluster,
        alpha=1.0,
        beta=0.2,
        gamma=0.5
    )
    baseline_solver = NearestNeighborCVRPTW(config)

    records = []
    routes_data: Dict[str, Any] = {}

    csv_path = Path(output_csv)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    json_path = Path(routes_json)
    json_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing if available to support resumption
    existing_keys = set()
    if csv_path.exists():
        try:
            df_prev = pd.read_csv(csv_path)
            records = df_prev.to_dict("records")
            existing_keys = set(zip(df_prev["day"], df_prev["scenario"]))
        except Exception:
            records = []
            existing_keys = set()

    if json_path.exists():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                routes_data = json.load(f)
        except Exception:
            routes_data = {}

    total_runs = (end_day - start_day + 1) * len(scenarios)
    current_run = 0

    for day in range(start_day, end_day + 1):
        print(f"\n>>> Loading Day {day} Dataset...")
        instance = loader.load_day(day)
        n_orders = instance.num_orders

        for scenario in scenarios:
            current_run += 1
            run_key = f"day_{day}_{scenario}"

            if (day, scenario) in existing_keys and run_key in routes_data:
                print(f"[{current_run}/{total_runs}] Skipping Day {day} | Scenario: {scenario.upper()} (Already computed in checkpoint).")
                continue

            print(f"[{current_run}/{total_runs}] Running Day {day} | Scenario: {scenario.upper()} ({n_orders} orders)...")

            # 1. Greedy Baseline
            t_base_start = time.perf_counter()
            b_sol = baseline_solver.solve(instance, scenario=scenario)
            t_base = time.perf_counter() - t_base_start

            # 2. Decomposed MILP
            t_decomp_start = time.perf_counter()
            d_sol = decomposer.solve(instance, scenario=scenario)
            t_decomp = time.perf_counter() - t_decomp_start

            # Comparative Deltas
            delta_dist = round(d_sol.total_distance_km - b_sol.total_distance_km, 2)
            delta_late = d_sol.late_deliveries - b_sol.total_late_deliveries
            delta_otr = round(d_sol.on_time_rate_pct - b_sol.on_time_rate_pct, 2)

            rec = {
                "day": day,
                "scenario": scenario,
                "num_orders": n_orders,
                # Greedy Metrics
                "greedy_distance_km": b_sol.total_distance_km,
                "greedy_travel_time_min": b_sol.total_travel_time_min,
                "greedy_late_deliveries": b_sol.total_late_deliveries,
                "greedy_total_lateness_min": b_sol.total_lateness_min,
                "greedy_on_time_rate_pct": b_sol.on_time_rate_pct,
                "greedy_vehicles": b_sol.vehicles_used,
                "greedy_runtime_sec": round(t_base, 4),
                # Decomposed MILP Metrics
                "decomp_distance_km": d_sol.total_distance_km,
                "decomp_travel_time_min": d_sol.total_travel_time_min,
                "decomp_late_deliveries": d_sol.late_deliveries,
                "decomp_total_lateness_min": d_sol.total_lateness_min,
                "decomp_on_time_rate_pct": d_sol.on_time_rate_pct,
                "decomp_vehicles": d_sol.vehicles_used,
                "decomp_clusters": d_sol.num_clusters,
                "decomp_runtime_sec": round(t_decomp, 2),
                # Comparison
                "delta_distance_km": delta_dist,
                "delta_late_deliveries": delta_late,
                "delta_on_time_rate_pct": delta_otr
            }
            records.append(rec)

            # Store full route definitions for UI and robustness evaluation
            run_key = f"day_{day}_{scenario}"
            routes_data[run_key] = {
                "day": day,
                "scenario": scenario,
                "num_orders": n_orders,
                "greedy": {
                    "distance_km": b_sol.total_distance_km,
                    "travel_time_min": b_sol.total_travel_time_min,
                    "late_deliveries": b_sol.total_late_deliveries,
                    "total_lateness_min": b_sol.total_lateness_min,
                    "on_time_rate_pct": b_sol.on_time_rate_pct,
                    "vehicles": b_sol.vehicles_used,
                    "routes": [r.stops for r in b_sol.routes]
                },
                "decomposed": {
                    "distance_km": d_sol.total_distance_km,
                    "travel_time_min": d_sol.total_travel_time_min,
                    "late_deliveries": d_sol.late_deliveries,
                    "total_lateness_min": d_sol.total_lateness_min,
                    "on_time_rate_pct": d_sol.on_time_rate_pct,
                    "vehicles": d_sol.vehicles_used,
                    "clusters": d_sol.num_clusters,
                    "routes": d_sol.routes
                }
            }

            # Periodic saving
            df_current = pd.DataFrame(records)
            df_current.to_csv(csv_path, index=False)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(routes_data, f, indent=2)

            print(
                f"   [Greedy] Dist: {b_sol.total_distance_km:5.1f}km | Time: {b_sol.total_travel_time_min:5.1f}min | "
                f"Late: {b_sol.total_late_deliveries:2d} | OTR: {b_sol.on_time_rate_pct:5.1f}% | Veh: {b_sol.vehicles_used} | CPU: {t_base:.3f}s"
            )
            print(
                f"   [Decomp] Dist: {d_sol.total_distance_km:5.1f}km | Time: {d_sol.total_travel_time_min:5.1f}min | "
                f"Late: {d_sol.late_deliveries:2d} | OTR: {d_sol.on_time_rate_pct:5.1f}% | Veh: {d_sol.vehicles_used} | CPU: {t_decomp:.1f}s"
            )
            print(f"   --> Delta OTR: {delta_otr:+5.2f}% | Delta Late: {delta_late:+2d} | Delta Dist: {delta_dist:+6.1f}km\n")

    df_final = pd.DataFrame(records)
    print("\n" + "=" * 105)
    print(" 9-DAY BENCHMARK COMPLETE! SUMMARY:")
    print("=" * 105)
    summary_cols = ["day", "scenario", "num_orders", "greedy_distance_km", "decomp_distance_km", "greedy_late_deliveries", "decomp_late_deliveries", "greedy_on_time_rate_pct", "decomp_on_time_rate_pct", "decomp_runtime_sec"]
    print(df_final[summary_cols].to_string(index=False))

    print(f"\nSummary table saved to: {csv_path}")
    print(f"Full route schedules saved to: {json_path}")
    return df_final


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="9-Day x 3-Scenario Benchmark Runner")
    parser.add_argument("--start-day", type=int, default=1, help="Starting day index (1-9)")
    parser.add_argument("--end-day", type=int, default=9, help="Ending day index (1-9)")
    parser.add_argument("--time-limit-cluster", type=int, default=12, help="MILP solve time limit per cluster in seconds")
    parser.add_argument("--output-csv", type=str, default="results/benchmarks/nine_day_benchmark.csv")
    parser.add_argument("--routes-json", type=str, default="results/benchmarks/nine_day_routes.json")
    args = parser.parse_args()

    run_nine_day_benchmark(
        start_day=args.start_day,
        end_day=args.end_day,
        time_limit_cluster=args.time_limit_cluster,
        output_csv=args.output_csv,
        routes_json=args.routes_json
    )
