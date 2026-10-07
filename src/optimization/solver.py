from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
import time
import pulp
import numpy as np

from src.optimization.model import CVRPTWModelBuilder


@dataclass
class OptimizationSolution:
    """Encapsulates the output of the mathematical MILP solver."""
    day: int
    scenario: str
    status: str
    is_feasible: bool
    objective_value: Optional[float]
    solve_duration_sec: float
    routes: List[List[int]]
    vehicles_used: int
    total_distance_km: float
    total_travel_time_min: float
    total_lateness_min: float
    late_deliveries: int
    per_vehicle_schedules: List[Dict[str, Any]] = field(default_factory=list)


class CVRPTWSolver:
    """
    Orchestrates solver execution (HiGHS / CBC), solution status verification,
    route path extraction, and operational scheduling.
    """

    def __init__(
        self,
        time_limit_sec: int = 60,
        mip_gap: Optional[float] = 0.05,
        verbose: bool = False
    ):
        self.time_limit_sec = time_limit_sec
        self.mip_gap = mip_gap
        self.verbose = verbose

    def solve(self, builder: CVRPTWModelBuilder) -> OptimizationSolution:
        """Solves the MILP problem and extracts active routes and timelines."""
        if builder.problem is None:
            builder.build()

        prob = builder.problem
        solver = pulp.HiGHS(
            timeLimit=self.time_limit_sec,
            gapRel=self.mip_gap,
            msg=self.verbose
        )

        t_start = time.perf_counter()
        stats = prob.solve(solver)
        t_duration = time.perf_counter() - t_start

        has_sol = getattr(stats, "has_solution", False) or (stats and "Optimal" in str(stats.status))
        status_str = str(stats.status) if stats else "Unknown"

        routes: List[List[int]] = []
        schedules: List[Dict[str, Any]] = []
        tot_dist = 0.0
        tot_trav_time = 0.0
        tot_lateness = 0.0
        late_stops = 0

        if has_sol:
            for k in builder.vehicles:
                succ = {}
                for (i, j, veh), var in builder.x_vars.items():
                    if veh == k and var.varValue is not None and var.varValue > 0.5:
                        succ[i] = j

                if 0 in succ:
                    route = [0]
                    curr = succ[0]
                    visited = {0}
                    while curr != 0 and curr not in visited:
                        route.append(curr)
                        visited.add(curr)
                        curr = succ.get(curr, 0)
                    route.append(0)

                    if len(route) > 2:
                        routes.append(route)
                        # Extract schedule timeline for this vehicle
                        veh_sched = {"vehicle_id": k, "stops": route, "timeline": []}
                        curr_t = 0.0
                        for idx in range(len(route) - 1):
                            u, v = route[idx], route[idx+1]
                            d = builder.dist_mat[u, v]
                            t_tr = builder.time_mat[u, v]
                            tot_dist += d
                            tot_trav_time += t_tr

                            if v != 0:
                                order = builder.instance.orders[v]
                                arr_t = max(curr_t + t_tr, order.eat_min)
                                lateness = max(0.0, arr_t - order.lat_min)
                                if lateness > 0.0:
                                    late_stops += 1
                                    tot_lateness += lateness
                                dep_t = arr_t + order.service_time_min
                                veh_sched["timeline"].append({
                                    "stop": v,
                                    "arrival": round(arr_t, 2),
                                    "departure": round(dep_t, 2),
                                    "lateness": round(lateness, 2),
                                })
                                curr_t = dep_t
                            else:
                                curr_t += t_tr

                        schedules.append(veh_sched)

        obj_val = None
        if prob.objective is not None:
            try:
                obj_val = float(prob.objective.value())
            except Exception:
                obj_val = getattr(stats, "objective", None)

        return OptimizationSolution(
            day=builder.instance.day,
            scenario=builder.scenario,
            status=status_str,
            is_feasible=has_sol,
            objective_value=round(obj_val, 2) if obj_val is not None else None,
            solve_duration_sec=round(t_duration, 3),
            routes=routes,
            vehicles_used=len(routes),
            total_distance_km=round(tot_dist, 2),
            total_travel_time_min=round(tot_trav_time, 2),
            total_lateness_min=round(tot_lateness, 2),
            late_deliveries=late_stops,
            per_vehicle_schedules=schedules
        )
