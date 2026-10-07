from typing import List, Set, Tuple, Dict, Any
import numpy as np

from src.evaluation.metrics import MetricsCalculator, SolutionMetrics


class RobustnessAnalyzer:
    """Analyzes plan sensitivity, route stability, and degradation across traffic scenarios."""

    @staticmethod
    def extract_arcs(routes: List[List[int]]) -> Set[Tuple[int, int]]:
        """Extracts directed arcs (u, v) from a collection of vehicle routes."""
        arcs: Set[Tuple[int, int]] = set()
        for route in routes:
            for i in range(len(route) - 1):
                arcs.add((route[i], route[i+1]))
        return arcs

    @staticmethod
    def calculate_arc_stability(routes_a: List[List[int]], routes_b: List[List[int]]) -> Dict[str, float]:
        """Calculates Jaccard arc similarity and route change ratio between two solutions."""
        arcs_a = RobustnessAnalyzer.extract_arcs(routes_a)
        arcs_b = RobustnessAnalyzer.extract_arcs(routes_b)

        intersection = len(arcs_a.intersection(arcs_b))
        union = len(arcs_a.union(arcs_b))

        jaccard_similarity = (intersection / union) if union > 0 else 1.0
        route_change_ratio = 1.0 - jaccard_similarity

        return {
            "common_arcs": intersection,
            "total_unique_arcs": union,
            "arc_similarity": round(jaccard_similarity, 4),
            "route_change_ratio": round(route_change_ratio, 4)
        }

    @staticmethod
    def calculate_scenario_degradation(metric_opt: float, metric_pess: float) -> float:
        """Computes percentage degradation from optimistic to pessimistic scenario."""
        if abs(metric_opt) < 1e-6:
            return 0.0
        return round(((metric_pess - metric_opt) / metric_opt) * 100.0, 2)

    @staticmethod
    def cross_evaluate_plan(
        routes: List[List[int]],
        dist_matrix: np.ndarray,
        target_time_matrix: np.ndarray,
        orders: Dict[int, Any],
        capacity_weight: float = 600.0,
        capacity_volume: float = 3.0
    ) -> SolutionMetrics:
        """
        Cross-evaluates a plan formed under one scenario against another scenario's travel times
        (e.g., execute Most-Likely route in Pessimistic traffic conditions).
        """
        return MetricsCalculator.evaluate_routes(
            routes=routes,
            dist_matrix=dist_matrix,
            time_matrix=target_time_matrix,
            orders=orders,
            capacity_weight=capacity_weight,
            capacity_volume=capacity_volume
        )
