import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from server import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert 1 in data["loaded_days"]
    assert "decomposed" in data["supported_engines"]
    assert "greedy" in data["supported_engines"]


def test_optimize_greedy_endpoint(client):
    payload = {
        "day": 1,
        "scenario": "mostlikely",
        "engine": "greedy",
        "capacity_weight": 600.0,
        "capacity_volume": 3.0,
        "max_shift_duration": 360.0,
        "traffic_multiplier": 1.0,
    }
    response = client.post("/api/optimize", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["is_python_backend"] is True
    assert "routes" in data
    assert len(data["routes"]) > 0
    assert "metrics" in data
    assert data["metrics"]["vehicles"] > 0
    assert data["metrics"]["distance_km"] > 0.0


def test_optimize_capacity_sensitivity(client):
    # Standard 600kg capacity
    res_std = client.post("/api/optimize", json={
        "day": 1,
        "scenario": "mostlikely",
        "engine": "greedy",
        "capacity_weight": 600.0,
        "capacity_volume": 3.0,
        "max_shift_duration": 360.0,
        "traffic_multiplier": 1.0,
    })
    std_data = res_std.json()
    std_vans = std_data["metrics"]["vehicles"]

    # Tight 350kg capacity should require more vehicles
    res_tight = client.post("/api/optimize", json={
        "day": 1,
        "scenario": "mostlikely",
        "engine": "greedy",
        "capacity_weight": 350.0,
        "capacity_volume": 1.8,
        "max_shift_duration": 360.0,
        "traffic_multiplier": 1.0,
    })
    tight_data = res_tight.json()
    tight_vans = tight_data["metrics"]["vehicles"]

    assert tight_vans >= std_vans
