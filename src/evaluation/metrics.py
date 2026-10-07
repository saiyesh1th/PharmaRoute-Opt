from dataclasses import dataclass
from typing import Dict, Any, List
import numpy as np


@dataclass
class SolutionMetrics:
    """Standardized evaluation metrics for any routing solution."""
    total_distance_km: float
    total_travel_time_min: float
    total_service_time_min: float
    total_duration_min: float
    vehicles_used: int
    on_time_rate_pct: float
    late_deliveries: int
    total_lateness_min: float
    weight_utilization_pct: float
    volume_utilization_pct: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_distance_km": self.total_distance_km,
            "total_travel_time_min": self.total_travel_time_min,
            "total_service_time_min": self.total_service_time_min,
            "total_duration_min": self.total_duration_min,
            "vehicles_used": self.vehicles_used,
            "on_time_rate_pct": self.on_time_rate_pct,
            "late_deliveries": self.late_deliveries,
            "total_lateness_min": self.total_lateness_min,
            "weight_utilization_pct": self.weight_utilization_pct,
            "volume_utilization_pct": self.volume_utilization_pct,
        }


class MetricsCalculator:
    """Calculates operational and service metrics for routes."""

    @staticmethod
    def evaluate_routes(
        routes: List[List[int]],
        dist_matrix: np.ndarray,
        time_matrix: np.ndarray,
        orders: Dict[int, Any],
        capacity_weight: float = 600.0,
        capacity_volume: float = 3.0
    ) -> SolutionMetrics:
        total_dist = 0.0
        total_travel_time = 0.0
        total_service_time = 0.0
        late_deliveries = 0
        total_lateness = 0.0
        total_weight = 0.0
        total_volume = 0.0
        served_count = 0

        for route in routes:
            curr_time = 0.0
            for k in range(len(route) - 1):
                u, v = route[k], route[k+1]
                total_dist += dist_matrix[u, v]
                t_travel = time_matrix[u, v]
                total_travel_time += t_travel

                if v != 0:
                    order = orders[v]
                    arr_time = max(curr_time + t_travel, order.eat_min)
                    service = order.service_time_min
                    total_service_time += service
                    total_weight += order.weight_kg
                    total_volume += order.volume_m3
                    served_count += 1

                    lateness = max(0.0, arr_time - order.lat_min)
                    if lateness > 0:
                        late_deliveries += 1
                        total_lateness += lateness

                    curr_time = arr_time + service
                else:
                    curr_time += t_travel

        vehicles = len(routes)
        otr = ((served_count - late_deliveries) / served_count * 100.0) if served_count > 0 else 0.0
        tot_cap_w = vehicles * capacity_weight
        tot_cap_v = vehicles * capacity_volume
        w_util = (total_weight / tot_cap_w * 100.0) if tot_cap_w > 0 else 0.0
        v_util = (total_volume / tot_cap_v * 100.0) if tot_cap_v > 0 else 0.0

        return SolutionMetrics(
            total_distance_km=round(total_dist, 2),
            total_travel_time_min=round(total_travel_time, 2),
            total_service_time_min=round(total_service_time, 2),
            total_duration_min=round(total_travel_time + total_service_time, 2),
            vehicles_used=vehicles,
            on_time_rate_pct=round(otr, 2),
            late_deliveries=late_deliveries,
            total_lateness_min=round(total_lateness, 2),
            weight_utilization_pct=round(w_util, 2),
            volume_utilization_pct=round(v_util, 2)
        )
