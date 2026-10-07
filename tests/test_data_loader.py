import pytest
import numpy as np

from src.data.loader import DataLoader
from src.data.validator import DataValidator


def test_load_day_1():
    loader = DataLoader()
    inst = loader.load_day(1)
    
    assert inst.day == 1
    assert inst.num_orders == 78
    assert inst.num_nodes == 79
    assert inst.depot_id == 0
    assert len(inst.orders) == 78
    
    assert inst.distance_matrix.shape == (79, 79)
    assert inst.time_matrix_mostlikely.shape == (79, 79)
    assert inst.time_matrix_optimistic.shape == (79, 79)
    assert inst.time_matrix_pessimistic.shape == (79, 79)
    
    # Check diagonal is zero
    assert np.allclose(np.diagonal(inst.distance_matrix), 0)
    assert np.allclose(np.diagonal(inst.time_matrix_mostlikely), 0)


def test_validator_day_1():
    loader = DataLoader()
    inst = loader.load_day(1)
    
    is_valid, fatal_errors, warnings = DataValidator.validate_instance(inst)
    assert is_valid is True
    assert len(fatal_errors) == 0
    # Warnings for real-world traffic matrix routing anomalies are expected
    assert isinstance(warnings, list)
