from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple
import numpy as np

from src.data.schema import DeliveryInstance, VehicleConfig


@dataclass
class VehicleRoute:
    """Represents the sequence of stops and operational timeline for one vehicle."""
    vehicle_id: int
    stops: List[int] = field(default_factory=list)  # [0, stop1, stop2, ..., 0]
    arrival_times: List[float] = field(default_factory=list)
    departure_times: List[float] = field(default_factory=list)
    cumulative_distance_km: float = 0.0
    cumulative_travel_time_min: float = 0.0
    total_weight_kg: float = 0.0
    total_volume_m3: float = 0.0
    late_deliveries: int = 0
    total_lateness_min: float = 0.0


@dataclass
class BaselineSolution:
    """Encapsulates the complete heuristic solution for an instance."""
    day: int
    scenario: str
    routes: List[VehicleRoute]
    unserved_orders: List[int]
    total_distance_km: float
    total_travel_time_min: float
    total_service_time_min: float
    vehicles_used: int
    total_late_deliveries: int
    total_lateness_min: float
    on_time_rate_pct: float
    weight_utilization_pct: float
    volume_utilization_pct: float


class NearestNeighborCVRPTW:
    """
    Greedy Nearest Neighbor heuristic for Capacitated Vehicle Routing Problem
    with Time Windows (CVRPTW) and service times.
    """

    def __init__(self, vehicle_config: VehicleConfig = None, allow_soft_tw: bool = True):
        self.config = vehicle_config if vehicle_config is not None else VehicleConfig()
        self.allow_soft_tw = allow_soft_tw

    def solve(self, instance: DeliveryInstance, scenario: str = "mostlikely") -> BaselineSolution:
        """Solves the CVRPTW instance using sequential nearest-neighbor route construction."""
        time_mat = instance.get_time_matrix(scenario)
        dist_mat = instance.distance_matrix

        unvisited = set(instance.orders.keys())
        routes: List[VehicleRoute] = []
        vehicle_idx = 1

        total_cap_weight = 0.0
        total_cap_vol = 0.0

        while unvisited:
            route = VehicleRoute(vehicle_id=vehicle_idx)
            route.stops.append(0)
            route.arrival_times.append(0.0)
            route.departure_times.append(0.0)

            curr_node = 0
            curr_time = 0.0
            curr_weight = 0.0
            curr_volume = 0.0

            while unvisited:
                # Find all feasible candidates
                feasible_candidates = []
                for candidate in unvisited:
                    order = instance.orders[candidate]

                    # 1. Capacity check
                    if curr_weight + order.weight_kg > self.config.capacity_weight_kg:
                        continue
                    if curr_volume + order.volume_m3 > self.config.capacity_volume_m3:
                        continue

                    # 2. Travel & Time check
                    trav_time = time_mat[curr_node, candidate]
                    arr_time = max(curr_time + trav_time, order.eat_min)
                    dep_time = arr_time + order.service_time_min
                    return_depot_time = dep_time + time_mat[candidate, 0]

                    # Check max shift limit
                    if return_depot_time > self.config.max_route_duration_min:
                        continue

                    # Hard vs Soft time window check
                    lateness = max(0.0, arr_time - order.lat_min)
                    if not self.allow_soft_tw and lateness > 0.0:
                        continue

                    distance = dist_mat[curr_node, candidate]
                    feasible_candidates.append({
                        "node": candidate,
                        "distance": distance,
                        "travel_time": trav_time,
                        "arr_time": arr_time,
                        "dep_time": dep_time,
                        "lateness": lateness,
                        "weight": order.weight_kg,
                        "volume": order.volume_m3
                    })

                if not feasible_candidates:
                    # No more feasible nodes can be added to this vehicle route
                    break

                # Greedy selection: prioritize minimum distance, with penalty for lateness
                feasible_candidates.sort(key=lambda x: (x["lateness"] * 2.0 + x["distance"]))
                chosen = feasible_candidates[0]

                # Advance to chosen node
                node_id = chosen["node"]
                route.stops.append(node_id)
                route.arrival_times.append(chosen["arr_time"])
                route.departure_times.append(chosen["dep_time"])
                route.cumulative_distance_km += chosen["distance"]
                route.cumulative_travel_time_min += chosen["travel_time"]
                route.total_weight_kg += chosen["weight"]
                route.total_volume_m3 += chosen["volume"]

                if chosen["lateness"] > 0:
                    route.late_deliveries += 1
                    route.total_lateness_min += chosen["lateness"]

                curr_node = node_id
                curr_time = chosen["dep_time"]
                curr_weight += chosen["weight"]
                curr_volume += chosen["volume"]
                unvisited.remove(node_id)

            # Return to depot
            return_dist = dist_mat[curr_node, 0]
            return_time = time_mat[curr_node, 0]
            final_depot_arrival = curr_time + return_time

            route.stops.append(0)
            route.arrival_times.append(final_depot_arrival)
            route.departure_times.append(final_depot_arrival)
            route.cumulative_distance_km += return_dist
            route.cumulative_travel_time_min += return_time

            routes.append(route)
            total_cap_weight += self.config.capacity_weight_kg
            total_cap_vol += self.config.capacity_volume_m3
            vehicle_idx += 1

            # Safety fallback: if no nodes were visited, break to avoid infinite loop
            if len(route.stops) <= 2:
                break

        # Aggregate metrics
        total_dist = sum(r.cumulative_distance_km for r in routes)
        total_trav_time = sum(r.cumulative_travel_time_min for r in routes)
        total_late = sum(r.late_deliveries for r in routes)
        total_lateness = sum(r.total_lateness_min for r in routes)
        total_weight_served = sum(r.total_weight_kg for r in routes)
        total_volume_served = sum(r.total_volume_m3 for r in routes)
        total_serv_time = sum(instance.orders[n].service_time_min for r in routes for n in r.stops if n != 0)

        served_count = instance.num_orders - len(unvisited)
        on_time_pct = ((served_count - total_late) / served_count * 100.0) if served_count > 0 else 0.0

        weight_util = (total_weight_served / total_cap_weight * 100.0) if total_cap_weight > 0 else 0.0
        vol_util = (total_volume_served / total_cap_vol * 100.0) if total_cap_vol > 0 else 0.0

        return BaselineSolution(
            day=instance.day,
            scenario=scenario,
            routes=routes,
            unserved_orders=list(unvisited),
            total_distance_km=round(total_dist, 2),
            total_travel_time_min=round(total_trav_time, 2),
            total_service_time_min=round(total_serv_time, 2),
            vehicles_used=len(routes),
            total_late_deliveries=total_late,
            total_lateness_min=round(total_lateness, 2),
            on_time_rate_pct=round(on_time_pct, 2),
            weight_utilization_pct=round(weight_util, 2),
            volume_utilization_pct=round(vol_util, 2)
        )
