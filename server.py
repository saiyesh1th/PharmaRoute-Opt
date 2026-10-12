"""
PharmaRoute-Opt: High-Performance FastAPI Optimization Backend
Serves the real Operations Research algorithms (HiGHS MILP Decomposition & Nearest Neighbor CVRPTW)
to the frontend interactive Decision Support System.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from src.data.loader import DataLoader
from src.data.schema import DeliveryInstance, VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.decomposition import FeasibilityAwareDecomposition
from src.evaluation.metrics import MetricsCalculator, SolutionMetrics

# Configure UTF-8 encoding for Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

app = FastAPI(
    title="PharmaRoute-Opt Optimization API",
    description="Operations Research Decision Support Backend for Pharmaceutical Cold-Chain Logistics in Athens",
    version="1.0.0"
)

# Enable CORS for React frontend (Vite default ports 5173, 3000, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory cache of loaded days to ensure zero disk latency
print("[*] Preloading Athens operational datasets into memory...")
DATA_LOADER = DataLoader()
INSTANCES_CACHE: Dict[int, DeliveryInstance] = {}
for d in range(1, 10):
    try:
        INSTANCES_CACHE[d] = DATA_LOADER.load_day(d)
        print(f"  [+] Loaded Day {d}: {INSTANCES_CACHE[d].num_orders} clinic stops")
    except Exception as e:
        print(f"  [-] Failed loading Day {d}: {e}")
print("[+] Preloading complete. Optimization engine ready.")


class OptimizeRequest(BaseModel):
    day: int = Field(1, ge=1, le=9, description="Operational day instance (1-9)")
    scenario: str = Field("mostlikely", description="Traffic regime: optimistic, mostlikely, pessimistic")
    engine: str = Field("decomposed", description="Algorithm engine: greedy or decomposed")
    capacity_weight: float = Field(600.0, ge=100.0, le=2500.0, description="Vehicle payload capacity in kg")
    capacity_volume: float = Field(3.0, ge=0.5, le=12.0, description="Vehicle cargo volume in m³")
    max_shift_duration: float = Field(360.0, ge=120.0, le=720.0, description="Driver shift cutoff limit in minutes")
    traffic_multiplier: float = Field(1.0, ge=0.5, le=3.0, description="Stochastic traffic delay factor")
    alpha_distance: float = Field(0.20, ge=0.0, le=1.0, description="Objective weight for total travel distance")
    beta_time: float = Field(0.20, ge=0.0, le=1.0, description="Objective weight for total transit duration")
    gamma_lateness: float = Field(0.60, ge=0.0, le=1.0, description="Objective weight for SLA lateness penalty")
    time_limit_sec: int = Field(10, ge=1, le=60, description="Solver time limit per cluster in seconds")
    fleet_size: Optional[int] = Field(None, description="Optional hard constraint on number of vehicles")


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "PharmaRoute-Opt OR Engine",
        "loaded_days": list(INSTANCES_CACHE.keys()),
        "supported_engines": ["decomposed", "greedy"],
        "milp_solver": "HiGHS (via PuLP)"
    }


def compute_route_timelines(
    routes: List[List[int]],
    instance: DeliveryInstance,
    time_matrix: np.ndarray,
    dist_matrix: np.ndarray,
    traffic_mult: float = 1.0
) -> List[Dict[str, Any]]:
    """Calculates granular stop-by-stop arrival times, service windows, and lateness."""
    route_details = []
    orders = instance.orders

    for v_idx, route in enumerate(routes):
        curr_time = 0.0
        r_dist = 0.0
        r_transit = 0.0
        r_service = 0.0
        r_weight = 0.0
        r_volume = 0.0
        r_late_stops = 0
        r_total_lateness = 0.0
        timeline = []
        arrival_times = [0.0]

        # Stop 0 (Depot departure at 08:00 AM / 0 min)
        timeline.append({
            "stop_seq": 0,
            "node": 0,
            "is_depot": True,
            "arrival_min": 0.0,
            "departure_min": 0.0,
            "eat": 0.0,
            "lat": 0.0,
            "service_min": 0.0,
            "is_late": False,
            "lateness_min": 0.0
        })

        for i in range(len(route) - 1):
            u = route[i]
            v = route[i + 1]
            seg_dist = float(dist_matrix[u, v])
            seg_transit = float(time_matrix[u, v]) * traffic_mult

            r_dist += seg_dist
            r_transit += seg_transit
            arr_time = curr_time + seg_transit

            if v == 0:
                # Return to depot
                arrival_times.append(round(arr_time, 1))
                timeline.append({
                    "stop_seq": len(timeline),
                    "node": 0,
                    "is_depot": True,
                    "arrival_min": round(arr_time, 1),
                    "departure_min": round(arr_time, 1),
                    "eat": 0.0,
                    "lat": 0.0,
                    "service_min": 0.0,
                    "is_late": False,
                    "lateness_min": 0.0
                })
                curr_time = arr_time
            else:
                ord_v = orders.get(v)
                eat = float(ord_v.eat_min) if ord_v else 0.0
                lat = float(ord_v.lat_min) if ord_v else 360.0
                service = float(ord_v.service_time_min) if ord_v else 6.0
                weight = float(ord_v.weight_kg) if ord_v else 0.0
                vol = float(ord_v.volume_m3) if ord_v else 0.0

                r_weight += weight
                r_volume += vol
                r_service += service

                actual_start = max(arr_time, eat)
                dep_time = actual_start + service
                is_late = arr_time > lat
                late_min = max(0.0, arr_time - lat)

                if is_late:
                    r_late_stops += 1
                    r_total_lateness += late_min

                arrival_times.append(round(arr_time, 1))
                timeline.append({
                    "stop_seq": len(timeline),
                    "node": v,
                    "is_depot": False,
                    "arrival_min": round(arr_time, 1),
                    "departure_min": round(dep_time, 1),
                    "eat": eat,
                    "lat": lat,
                    "service_min": service,
                    "is_late": is_late,
                    "lateness_min": round(late_min, 1)
                })
                curr_time = dep_time

        route_details.append({
            "vehicle_id": v_idx + 1,
            "stops": route,
            "distance_km": round(r_dist, 1),
            "travel_time_min": round(r_transit, 1),
            "service_time_min": round(r_service, 1),
            "shift_time_min": round(r_transit + r_service, 1),
            "weight_kg": round(r_weight, 1),
            "volume_m3": round(r_volume, 2),
            "late_deliveries": r_late_stops,
            "total_lateness_min": round(r_total_lateness, 1),
            "arrival_times": arrival_times,
            "timeline": timeline
        })

    return route_details


@app.post("/api/optimize")
def run_optimization(req: OptimizeRequest):
    """
    Executes real-time Operations Research optimization on the Athens road network.
    Dynamically configures vehicle capacity, driver shifts, traffic conditions, and objective weights.
    """
    t_start = time.perf_counter()

    if req.day not in INSTANCES_CACHE:
        raise HTTPException(status_code=404, detail=f"Day {req.day} dataset not loaded.")

    base_instance = INSTANCES_CACHE[req.day]

    # Create scaled time matrix if traffic multiplier is specified
    scenario = req.scenario.lower()
    raw_time_matrix = base_instance.get_time_matrix(scenario)
    if abs(req.traffic_multiplier - 1.0) > 0.001:
        scaled_time_matrix = raw_time_matrix * req.traffic_multiplier
        instance = DeliveryInstance(
            day=base_instance.day,
            num_orders=base_instance.num_orders,
            num_nodes=base_instance.num_nodes,
            depot_id=base_instance.depot_id,
            orders=base_instance.orders,
            distance_matrix=base_instance.distance_matrix,
            time_matrix_mostlikely=base_instance.time_matrix_mostlikely * req.traffic_multiplier,
            time_matrix_optimistic=base_instance.time_matrix_optimistic * req.traffic_multiplier,
            time_matrix_pessimistic=base_instance.time_matrix_pessimistic * req.traffic_multiplier
        )
    else:
        scaled_time_matrix = raw_time_matrix
        instance = base_instance

    veh_config = VehicleConfig(
        capacity_weight_kg=req.capacity_weight,
        capacity_volume_m3=req.capacity_volume,
        max_route_duration_min=req.max_shift_duration,
        fleet_size=req.fleet_size
    )

    clusters_info = []

    try:
        if req.engine == "greedy":
            solver = NearestNeighborCVRPTW(veh_config)
            sol = solver.solve(instance, scenario=scenario)
            routes = [r.stops for r in sol.routes]
            engine_name = "Python Nearest-Neighbor CVRPTW"
        else:
            decomposer = FeasibilityAwareDecomposition(
                vehicle_config=veh_config,
                time_limit_per_cluster=req.time_limit_sec,
                alpha=req.alpha_distance,
                beta=req.beta_time,
                gamma=req.gamma_lateness
            )
            sol = decomposer.solve(instance, scenario=scenario)
            routes = sol.routes
            clusters_info = [
                {
                    "cluster_id": c.cluster_id,
                    "seed_node": c.seed_node,
                    "customer_nodes": c.customer_nodes,
                    "total_weight_kg": c.total_weight_kg,
                    "total_volume_m3": c.total_volume_m3,
                    "num_urgent_stops": c.num_urgent_stops
                }
                for c in sol.clusters
            ]
            engine_name = "Python HiGHS MILP Decomposition"

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

    t_solve = time.perf_counter() - t_start

    # Compute granular stop arrival timelines
    route_details = compute_route_timelines(
        routes=routes,
        instance=instance,
        time_matrix=scaled_time_matrix,
        dist_matrix=instance.distance_matrix,
        traffic_mult=1.0  # already scaled in time matrix
    )

    # Global Metrics Calculation
    global_metrics: SolutionMetrics = MetricsCalculator.evaluate_routes(
        routes=routes,
        dist_matrix=instance.distance_matrix,
        time_matrix=scaled_time_matrix,
        orders=instance.orders,
        capacity_weight=req.capacity_weight,
        capacity_volume=req.capacity_volume
    )

    # Financial & Carbon Footprint calculations
    total_dist = global_metrics.total_distance_km
    total_transit = global_metrics.total_travel_time_min
    total_service = global_metrics.total_service_time_min
    driver_hours = (total_transit + total_service) / 60.0
    operating_cost = round(total_dist * 0.38 + driver_hours * 22.50, 2)
    co2_electric = round(total_dist * 0.023, 1)

    return {
        "status": "success",
        "day": req.day,
        "scenario": req.scenario,
        "engine": req.engine,
        "solver_engine": engine_name,
        "is_python_backend": True,
        "solve_time_sec": round(t_solve, 3),
        "solve_time_ms": round(t_solve * 1000.0, 1),
        "routes": routes,
        "clusters": clusters_info,
        "route_metrics": route_details,
        "routeMetrics": route_details,
        "metrics": {
            "distance_km": round(global_metrics.total_distance_km, 1),
            "total_distance_km": round(global_metrics.total_distance_km, 1),
            "travel_time_min": round(global_metrics.total_travel_time_min),
            "service_time_min": round(global_metrics.total_service_time_min),
            "vehicles": global_metrics.vehicles_used,
            "vehicles_used": global_metrics.vehicles_used,
            "late_deliveries": global_metrics.late_deliveries,
            "total_lateness_min": round(global_metrics.total_lateness_min),
            "on_time_rate_pct": round(global_metrics.on_time_rate_pct, 1),
            "weight_utilization_pct": round(global_metrics.weight_utilization_pct, 1),
            "volume_utilization_pct": round(global_metrics.volume_utilization_pct, 1),
            "operating_cost_eur": operating_cost,
            "co2_emissions_kg": co2_electric,
            "routes": routes,
            "is_simulated": True,
            "is_python_backend": True
        }
    }


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print(" PharmaRoute-Opt: FastAPI Operations Research Server")
    print(" Starting HTTP API at http://127.0.0.1:8000")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=8000)
