from typing import Dict, Any, List
import pandas as pd

from src.data.schema import DeliveryInstance, VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW, BaselineSolution
from src.evaluation.robustness import RobustnessAnalyzer


class TrafficScenarioManager:
    """Coordinates multi-scenario evaluation and comparative robustness experiments."""

    SCENARIOS = ["optimistic", "mostlikely", "pessimistic"]

    def __init__(self, vehicle_config: VehicleConfig = None):
        self.config = vehicle_config if vehicle_config is not None else VehicleConfig()
        self.baseline_solver = NearestNeighborCVRPTW(self.config)

    def run_scenario_suite(self, instance: DeliveryInstance) -> Dict[str, Any]:
        """Runs the baseline solver across all three traffic scenarios for an instance."""
        solutions: Dict[str, BaselineSolution] = {}
        for sc in self.SCENARIOS:
            solutions[sc] = self.baseline_solver.solve(instance, scenario=sc)

        # Cross-evaluation: What if Most-Likely plan is executed in Pessimistic traffic?
        ml_routes = [[s for s in r.stops] for r in solutions["mostlikely"].routes]
        pess_time_mat = instance.get_time_matrix("pessimistic")

        ml_in_pess_eval = RobustnessAnalyzer.cross_evaluate_plan(
            routes=ml_routes,
            dist_matrix=instance.distance_matrix,
            target_time_matrix=pess_time_mat,
            orders=instance.orders,
            capacity_weight=self.config.capacity_weight_kg,
            capacity_volume=self.config.capacity_volume_m3
        )

        # Route stability between optimistic and pessimistic
        opt_routes = [[s for s in r.stops] for r in solutions["optimistic"].routes]
        pess_routes = [[s for s in r.stops] for r in solutions["pessimistic"].routes]
        stability = RobustnessAnalyzer.calculate_arc_stability(opt_routes, pess_routes)

        # Summary comparison table
        summary_rows = []
        for sc in self.SCENARIOS:
            sol = solutions[sc]
            summary_rows.append({
                "scenario": sc,
                "distance_km": sol.total_distance_km,
                "travel_time_min": sol.total_travel_time_min,
                "vehicles_used": sol.vehicles_used,
                "on_time_rate_pct": sol.on_time_rate_pct,
                "late_deliveries": sol.total_late_deliveries,
                "total_lateness_min": sol.total_lateness_min,
                "weight_util_pct": sol.weight_utilization_pct,
                "vol_util_pct": sol.volume_utilization_pct,
            })

        df_summary = pd.DataFrame(summary_rows)

        # Time degradation percentage
        time_degradation = RobustnessAnalyzer.calculate_scenario_degradation(
            solutions["optimistic"].total_travel_time_min,
            solutions["pessimistic"].total_travel_time_min
        )

        return {
            "day": instance.day,
            "solutions": solutions,
            "summary_table": df_summary,
            "ml_in_pessimistic_stress_test": ml_in_pess_eval,
            "arc_stability_opt_vs_pess": stability,
            "travel_time_degradation_pct": time_degradation
        }
