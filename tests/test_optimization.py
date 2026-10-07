import pytest

from src.data.loader import DataLoader
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver


def test_milp_model_and_solver():
    loader = DataLoader()
    inst = loader.load_day(1)
    
    # Solve on an 8-customer benchmark cluster
    subset = list(range(1, 9))
    builder = CVRPTWModelBuilder(inst, scenario="mostlikely", subset_nodes=subset)
    solver = CVRPTWSolver(time_limit_sec=20, verbose=False)
    
    sol = solver.solve(builder)
    
    assert sol.is_feasible is True
    assert sol.vehicles_used >= 1
    assert sol.total_distance_km > 0
    assert len(sol.routes) >= 1
    
    # Verify depot start and end
    for r in sol.routes:
        assert r[0] == 0
        assert r[-1] == 0
        # No subtour: all internal stops are customer nodes
        for node in r[1:-1]:
            assert node in subset
