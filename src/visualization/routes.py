from typing import List, Dict, Any
import numpy as np


class RouteVisualizer:
    """Provides formatting and textual visualization of delivery routes."""

    @staticmethod
    def format_route_string(route: List[int]) -> str:
        """Formats a route stop sequence into a human-readable arrow sequence."""
        return " -> ".join(str(node) for node in route)

    @staticmethod
    def print_solution_summary(solution_name: str, routes: List[List[int]], metrics_dict: Dict[str, Any]) -> str:
        """Builds a formatted text report of the routing solution."""
        lines = [
            "=" * 60,
            f" SOLUTION REPORT: {solution_name.upper()}",
            "=" * 60,
            f"Vehicles Deployed: {len(routes)}",
        ]
        for idx, route in enumerate(routes, 1):
            lines.append(f"  Vehicle {idx}: {RouteVisualizer.format_route_string(route)} ({len(route)-2} stops)")

        lines.append("-" * 60)
        lines.append("Operational Metrics:")
        for k, v in metrics_dict.items():
            k_fmt = k.replace("_", " ").title()
            lines.append(f"  • {k_fmt}: {v}")
        lines.append("=" * 60)
        return "\n".join(lines)
