import argparse
import sys
from pathlib import Path

# Add project root to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.data.loader import DataLoader
from src.data.schema import VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver
from src.scenarios.traffic import TrafficScenarioManager
from src.visualization.routes import RouteVisualizer


def main():
    parser = argparse.ArgumentParser(description="PharmaRoute-Opt Experiment Runner")
    parser.add_argument("--day", type=int, default=1, help="Operational day instance (1-9)")
    parser.add_argument("--scenario", type=str, default="mostlikely", choices=["optimistic", "mostlikely", "pessimistic"], help="Traffic scenario")
    parser.add_argument("--mode", type=str, default="baseline", choices=["baseline", "milp", "scenarios"], help="Execution mode")
    parser.add_argument("--nodes", type=int, default=10, help="Number of customer nodes for MILP benchmark (default: 10)")
    parser.add_argument("--time-limit", type=int, default=30, help="Solver time limit in seconds")
    parser.add_argument("--capacity-weight", type=float, default=600.0, help="Vehicle payload capacity in kg")
    parser.add_argument("--capacity-volume", type=float, default=3.0, help="Vehicle volume capacity in m³")
    args = parser.parse_args()

    print(f"\n========================================================")
    print(f" PharmaRoute-Opt: Operations Research Decision Support")
    print(f" Day: {args.day} | Mode: {args.mode} | Scenario: {args.scenario}")
    print(f"========================================================\n")

    loader = DataLoader()
    instance = loader.load_day(args.day)
    config = VehicleConfig(capacity_weight_kg=args.capacity_weight, capacity_volume_m3=args.capacity_volume)

    if args.mode == "baseline":
        solver = NearestNeighborCVRPTW(config)
        sol = solver.solve(instance, scenario=args.scenario)
        routes = [r.stops for r in sol.routes]
        metrics = {
            "Total Distance (km)": sol.total_distance_km,
            "Total Travel Time (min)": sol.total_travel_time_min,
            "Vehicles Used": sol.vehicles_used,
            "On-Time Rate (%)": f"{sol.on_time_rate_pct}%",
            "Late Deliveries": sol.total_late_deliveries,
            "Total Lateness (min)": sol.total_lateness_min,
            "Weight Utilization (%)": f"{sol.weight_utilization_pct}%",
            "Volume Utilization (%)": f"{sol.volume_utilization_pct}%",
        }
        report = RouteVisualizer.print_solution_summary(f"Day {args.day} - {args.scenario} (Heuristic Baseline)", routes, metrics)
        print(report)

    elif args.mode == "milp":
        subset = list(range(1, min(args.nodes + 1, instance.num_nodes)))
        print(f"Building MILP for {len(subset)} customer nodes (Depot 0 + Customers {subset[0]}..{subset[-1]})...")
        builder = CVRPTWModelBuilder(instance, scenario=args.scenario, vehicle_config=config, subset_nodes=subset)
        solver = CVRPTWSolver(time_limit_sec=args.time_limit, verbose=False)
        sol = solver.solve(builder)
        
        metrics = {
            "Status": sol.status,
            "Objective Value": sol.objective_value,
            "Solve Time (sec)": sol.solve_duration_sec,
            "Total Distance (km)": sol.total_distance_km,
            "Total Travel Time (min)": sol.total_travel_time_min,
            "Vehicles Used": sol.vehicles_used,
            "Late Deliveries": sol.late_deliveries,
            "Total Lateness (min)": sol.total_lateness_min,
        }
        report = RouteVisualizer.print_solution_summary(f"Day {args.day} - {args.scenario} (Exact MILP HiGHS)", sol.routes, metrics)
        print(report)
        print("\nPer-Vehicle Schedules:")
        for v_sched in sol.per_vehicle_schedules:
            print(f"  Vehicle {v_sched['vehicle_id']}: {v_sched['stops']}")
            for stop_info in v_sched["timeline"]:
                lat_note = f" [LATE: +{stop_info['lateness']} min]" if stop_info['lateness'] > 0 else ""
                print(f"    Stop {stop_info['stop']}: Arrival={stop_info['arrival']}m, Depart={stop_info['departure']}m{lat_note}")

    elif args.mode == "scenarios":
        mgr = TrafficScenarioManager(config)
        results = mgr.run_scenario_suite(instance)
        print("--- Traffic Scenario Summary Table ---")
        print(results["summary_table"].to_string(index=False))
        print("\n--- Travel Time Degradation ---")
        print(f"Optimistic -> Pessimistic Delay Growth: {results['travel_time_degradation_pct']}%")
        print("\n--- Plan Stability (Optimistic vs Pessimistic) ---")
        for k, v in results["arc_stability_opt_vs_pess"].items():
            print(f"  • {k}: {v}")
        print("\n--- Stress Test (Executing Most-Likely Plan in Pessimistic Traffic) ---")
        stress = results["ml_in_pessimistic_stress_test"]
        print(f"  • Travel Time in Congestion: {stress.total_travel_time_min} min")
        print(f"  • Resulting Late Deliveries: {stress.late_deliveries}")
        print(f"  • Resulting On-Time Rate: {stress.on_time_rate_pct}%")


if __name__ == "__main__":
    main()
