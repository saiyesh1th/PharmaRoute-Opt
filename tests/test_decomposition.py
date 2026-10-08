import pytest
from src.data.loader import DataLoader
from src.data.schema import VehicleConfig
from src.optimization.decomposition import FeasibilityAwareDecomposition


def test_decomposition_partition_and_solve():
    loader = DataLoader()
    inst = loader.load_day(1)
    config = VehicleConfig()

    subset = list(range(1, 16))
    decomposer = FeasibilityAwareDecomposition(
        vehicle_config=config,
        max_cluster_size=8,
        time_limit_per_cluster=15
    )

    clusters = decomposer.partition_customers(inst, subset_nodes=subset)
    assert len(clusters) >= 2

    # Check capacity constraints on every cluster
    for c in clusters:
        assert c.total_weight_kg <= config.capacity_weight_kg
        assert c.total_volume_m3 <= config.capacity_volume_m3
        assert len(c.customer_nodes) <= 8

    # Ensure all nodes in subset are partitioned without loss
    partitioned_nodes = []
    for c in clusters:
        partitioned_nodes.extend(c.customer_nodes)
    assert sorted(partitioned_nodes) == sorted(subset)

    # Solve decomposed problem
    sol = decomposer.solve(inst, scenario="mostlikely", subset_nodes=subset)
    assert sol.total_distance_km > 0
    assert sol.vehicles_used >= 1
    assert len(sol.routes) >= 1
    assert sol.on_time_rate_pct >= 0.0
