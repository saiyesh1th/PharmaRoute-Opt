from pathlib import Path
from typing import Dict, Any
import numpy as np

from src.data.schema import DeliveryInstance, VehicleConfig


class InstancePreprocessor:
    """Preprocesses a raw DeliveryInstance into solver-ready structures."""

    @staticmethod
    def to_solver_dict(instance: DeliveryInstance, vehicle_config: VehicleConfig, scenario: str = "mostlikely") -> Dict[str, Any]:
        """Converts DeliveryInstance into indexed dictionaries and arrays for optimization algorithms."""
        time_matrix = instance.get_time_matrix(scenario)
        N = instance.num_nodes
        customer_nodes = list(range(1, N))

        # Determine fleet size if not set: heuristic estimate based on weight and volume
        total_weight = sum(o.weight_kg for o in instance.orders.values())
        total_vol = sum(o.volume_m3 for o in instance.orders.values())
        min_veh_weight = int(np.ceil(total_weight / vehicle_config.capacity_weight_kg))
        min_veh_vol = int(np.ceil(total_vol / vehicle_config.capacity_volume_m3))
        est_vehicles = max(min_veh_weight, min_veh_vol, 3)

        num_vehicles = vehicle_config.fleet_size if vehicle_config.fleet_size is not None else est_vehicles + 1

        weights = {0: 0.0}
        volumes = {0: 0.0}
        service_times = {0: 0.0}
        eat = {0: 0.0}
        lat = {0: vehicle_config.max_route_duration_min}

        for i in customer_nodes:
            order = instance.orders[i]
            weights[i] = order.weight_kg
            volumes[i] = order.volume_m3
            service_times[i] = order.service_time_min
            eat[i] = order.eat_min
            lat[i] = order.lat_min

        return {
            "day": instance.day,
            "scenario": scenario,
            "num_nodes": N,
            "depot": 0,
            "customer_nodes": customer_nodes,
            "all_nodes": list(range(N)),
            "num_vehicles": num_vehicles,
            "vehicle_capacity_weight": vehicle_config.capacity_weight_kg,
            "vehicle_capacity_volume": vehicle_config.capacity_volume_m3,
            "max_route_duration": vehicle_config.max_route_duration_min,
            "weights": weights,
            "volumes": volumes,
            "service_times": service_times,
            "eat": eat,
            "lat": lat,
            "distance_matrix": instance.distance_matrix,
            "time_matrix": time_matrix,
        }
