import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from src.data.loader import DataLoader
from src.data.schema import VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.decomposition import FeasibilityAwareDecomposition


def test_custom_volume_and_weight_constraints():
    loader = DataLoader()
    inst = loader.load_day(1)

    # Test smaller vans: 1.5 m3 volume, 400 kg weight
    custom_cfg = VehicleConfig(
        capacity_weight_kg=400.0,
        capacity_volume_m3=1.5,
        max_route_duration_min=360.0
    )

    solver = NearestNeighborCVRPTW(custom_cfg)
    sol = solver.solve(inst, scenario="mostlikely")

    assert sol.vehicles_used > 0
    # Every vehicle route must strictly respect the custom volume (1.5 m3) and weight (400 kg)
    for route in sol.routes:
        assert route.total_volume_m3 <= 1.5 + 1e-4
        assert route.total_weight_kg <= 400.0 + 1e-4


def test_custom_fleet_size_limit():
    loader = DataLoader()
    inst = loader.load_day(1)

    # Capped fleet limit: maximum 3 trucks
    custom_cfg = VehicleConfig(
        capacity_weight_kg=600.0,
        capacity_volume_m3=3.0,
        fleet_size=3
    )

    solver = NearestNeighborCVRPTW(custom_cfg)
    sol = solver.solve(inst, scenario="mostlikely")

    # Dispatched vehicles must not exceed the capped fleet size limit
    assert sol.vehicles_used <= 3


def test_custom_shift_duration_limit():
    loader = DataLoader()
    inst = loader.load_day(1)

    # Short shift limit: 240 minutes (4 hours)
    custom_cfg = VehicleConfig(
        max_route_duration_min=240.0
    )

    solver = NearestNeighborCVRPTW(custom_cfg)
    sol = solver.solve(inst, scenario="mostlikely")

    # Shift return times must not exceed 240 minutes
    for route in sol.routes:
        assert route.departure_times[-1] <= 240.0 + 1e-4
