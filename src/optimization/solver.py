from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
import os
import re
import tempfile
import time
import pulp
import numpy as np

from src.optimization.model import CVRPTWModelBuilder


@dataclass
class OptimizationSolution:
    """Encapsulates the complete output and computational metrics of the MILP solver."""
    day: int
    scenario: str
    status: str
    is_feasible: bool
    objective_value: Optional[float]
    primal_bound: Optional[float]
    dual_bound: Optional[float]
    mip_gap_pct: Optional[float]
    nodes_explored: Optional[int]
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
    Orchestrates solver execution via HiGHS, captures low-level solver statistics
    (lower bounds, primal bounds, MIP gap, branch-and-bound nodes), extracts active routes,
    and produces stop-level arrival/departure schedules.
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
        """Solves the MILP problem and extracts active routes, bounds, and timelines."""
        if builder.problem is None:
            builder.build()

        prob = builder.problem
        solver = pulp.HiGHS(
            timeLimit=self.time_limit_sec,
            gapRel=self.mip_gap,
            msg=True  # Required to capture C++ solver statistics
        )

        # Redirect OS-level file descriptor 1 to capture HiGHS C++ console output
        with tempfile.NamedTemporaryFile(delete=False, mode="w+") as tmp:
            tmp_path = tmp.name

        t_start = time.perf_counter()
        captured_output = ""
        saved_fd = os.dup(1)
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                os.dup2(f.fileno(), 1)
                stats = prob.solve(solver)
        finally:
            os.dup2(saved_fd, 1)
            os.close(saved_fd)

        t_duration = time.perf_counter() - t_start

        if os.path.exists(tmp_path):
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                captured_output = f.read()
            try:
                os.remove(tmp_path)
            except OSError:
                pass

        if self.verbose:
            print(captured_output)

        # Parse detailed HiGHS solving report from log
        parsed = self._parse_highs_report(captured_output)

        has_sol = getattr(stats, "has_solution", False) or parsed["has_solution"] or (parsed["primal_bound"] is not None)
        status_str = parsed["status"] if parsed["status"] != "Unknown" else str(getattr(stats, "status", "Unknown"))

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

        obj_val = parsed["primal_bound"]
        if obj_val is None and prob.objective is not None:
            try:
                obj_val = float(prob.objective.value())
            except Exception:
                obj_val = getattr(stats, "objective", None)

        # If optimal, dual bound equals primal bound and gap is 0.0%
        dual_val = parsed["dual_bound"]
        gap_val = parsed["gap_pct"]
        if "optimal" in status_str.lower() and obj_val is not None:
            if dual_val is None:
                dual_val = obj_val
            if gap_val is None:
                gap_val = 0.0

        return OptimizationSolution(
            day=builder.instance.day,
            scenario=builder.scenario,
            status=status_str,
            is_feasible=has_sol,
            objective_value=round(obj_val, 2) if obj_val is not None else None,
            primal_bound=round(obj_val, 2) if obj_val is not None else None,
            dual_bound=round(dual_val, 2) if dual_val is not None else None,
            mip_gap_pct=round(gap_val, 2) if gap_val is not None else None,
            nodes_explored=parsed["nodes"],
            solve_duration_sec=round(t_duration, 3),
            routes=routes,
            vehicles_used=len(routes),
            total_distance_km=round(tot_dist, 2),
            total_travel_time_min=round(tot_trav_time, 2),
            total_lateness_min=round(tot_lateness, 2),
            late_deliveries=late_stops,
            per_vehicle_schedules=schedules
        )

    def _parse_highs_report(self, log_text: str) -> Dict[str, Any]:
        """Parses primal bound, dual bound, gap, and status from HiGHS execution log."""
        data = {
            "status": "Unknown",
            "primal_bound": None,
            "dual_bound": None,
            "gap_pct": None,
            "nodes": None,
            "has_solution": False
        }

        # Status check
        if "Model   status      : Optimal" in log_text or "Status            Optimal" in log_text:
            data["status"] = "Optimal"
            data["has_solution"] = True
        elif "Time limit reached" in log_text:
            data["status"] = "Time limit reached"
        elif "Infeasible" in log_text:
            data["status"] = "Infeasible"

        # Primal bound
        m_primal = re.search(r"Primal bound\s+([0-9eE\.\+\-]+)", log_text)
        if m_primal:
            try:
                data["primal_bound"] = float(m_primal.group(1))
                data["has_solution"] = True
            except ValueError:
                pass

        # Dual bound
        m_dual = re.search(r"Dual bound\s+([0-9eE\.\+\-]+)", log_text)
        if m_dual:
            try:
                data["dual_bound"] = float(m_dual.group(1))
            except ValueError:
                pass

        # Gap
        m_gap = re.search(r"Gap\s+([0-9\.]+)%", log_text)
        if m_gap:
            try:
                data["gap_pct"] = float(m_gap.group(1))
            except ValueError:
                pass

        # Nodes
        m_nodes = re.search(r"Nodes\s+([0-9]+)", log_text)
        if m_nodes:
            try:
                data["nodes"] = int(m_nodes.group(1))
            except ValueError:
                pass

        return data
