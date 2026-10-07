from dataclasses import dataclass, field
from typing import Dict, List, Optional
import numpy as np


@dataclass
class Order:
    """Represents a single customer delivery request."""
    node_id: int
    weight_kg: float
    volume_m3: float
    service_time_min: float
    eat_min: float  # Earliest arrival time (minutes from 08:00 AM)
    lat_min: float  # Latest arrival time (minutes from 08:00 AM)


@dataclass
class VehicleConfig:
    """Represents vehicle fleet configuration parameters."""
    capacity_weight_kg: float = 600.0   # Default urban van payload capacity (kg)
    capacity_volume_m3: float = 3.0     # Default cargo volume capacity (m³)
    max_route_duration_min: float = 360.0 # Standard shift length (6 hours / 360 min)
    fleet_size: Optional[int] = None    # Number of available vehicles (None = auto-detect)


@dataclass
class DeliveryInstance:
    """Encapsulates all data required for one daily delivery instance."""
    day: int
    num_orders: int
    num_nodes: int
    depot_id: int
    orders: Dict[int, Order]
    distance_matrix: np.ndarray          # Shape (N, N) in kilometers
    time_matrix_mostlikely: np.ndarray   # Shape (N, N) in minutes
    time_matrix_optimistic: np.ndarray   # Shape (N, N) in minutes
    time_matrix_pessimistic: np.ndarray  # Shape (N, N) in minutes

    def get_time_matrix(self, scenario: str = "mostlikely") -> np.ndarray:
        """Retrieve travel-time matrix for a specific traffic scenario."""
        scenario_key = scenario.lower().replace("-", "").replace("_", "")
        if scenario_key in ("mostlikely", "ml", "normal"):
            return self.time_matrix_mostlikely
        elif scenario_key in ("optimistic", "opt", "best"):
            return self.time_matrix_optimistic
        elif scenario_key in ("pessimistic", "pess", "worst"):
            return self.time_matrix_pessimistic
        else:
            raise ValueError(f"Unknown traffic scenario: {scenario}. Choose from: optimistic, mostlikely, pessimistic")
