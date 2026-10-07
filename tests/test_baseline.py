import pytest

from src.data.loader import DataLoader
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW


def test_baseline_day_1():
    loader = DataLoader()
    inst = loader.load_day(1)
    solver = NearestNeighborCVRPTW()
    
    sol = solver.solve(inst, scenario="mostlikely")
    
    assert sol.day == 1
    assert sol.scenario == "mostlikely"
    assert sol.vehicles_used > 0
    assert sol.total_distance_km > 0
    assert sol.total_travel_time_min > 0
    assert len(sol.unserved_orders) == 0
    
    # Check that each vehicle starts and ends at depot (node 0)
    for route in sol.routes:
        assert route.stops[0] == 0
        assert route.stops[-1] == 0
