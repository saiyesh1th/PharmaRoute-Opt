from typing import Dict, List, Any, Optional, Tuple
import pulp
import numpy as np

from src.data.schema import DeliveryInstance, VehicleConfig


class CVRPTWModelBuilder:
    """
    Mixed-Integer Linear Programming (MILP) formulation for Capacitated
    Vehicle Routing Problem with Time Windows (CVRPTW) and service times.
    
    This class is strictly responsible for OR mathematical formulation:
      - Variable declarations (x_ijk, y_ik, T_ik, L_i)
      - Objective function (normalized weighted sum or single-criterion)
      - Operational constraints (Assignment, Flow, Capacity, MTZ Time Propagation, Deadlines)
    """

    def __init__(
        self,
        instance: DeliveryInstance,
        scenario: str = "mostlikely",
        vehicle_config: VehicleConfig = None,
        subset_nodes: Optional[List[int]] = None,
        alpha: float = 1.0,     # Weight for total distance
        beta: float = 0.0,      # Weight for total travel time
        gamma: float = 0.0,     # Weight for lateness penalty
        norm_distance: float = 1.0,   # Normalization scalar D0
        norm_time: float = 1.0,       # Normalization scalar T0
        norm_lateness: float = 1.0,   # Normalization scalar L0
    ):
        self.instance = instance
        self.scenario = scenario
        self.config = vehicle_config if vehicle_config is not None else VehicleConfig()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.norm_d = max(norm_distance, 1.0)
        self.norm_t = max(norm_time, 1.0)
        self.norm_l = max(norm_lateness, 1.0)

        # Allow solving on a subset of nodes (e.g. benchmark cluster or first N stops)
        if subset_nodes is None:
            self.customer_nodes = sorted(list(instance.orders.keys()))
        else:
            self.customer_nodes = sorted([n for n in subset_nodes if n in instance.orders])

        self.all_nodes = [0] + self.customer_nodes
        self.time_mat = instance.get_time_matrix(scenario)
        self.dist_mat = instance.distance_matrix

        # Estimate required fleet size if not explicitly set
        tot_w = sum(instance.orders[n].weight_kg for n in self.customer_nodes)
        tot_v = sum(instance.orders[n].volume_m3 for n in self.customer_nodes)
        min_k_w = int(np.ceil(tot_w / self.config.capacity_weight_kg))
        min_k_v = int(np.ceil(tot_v / self.config.capacity_volume_m3))
        k_est = max(min_k_w, min_k_v, 1)
        self.num_vehicles = self.config.fleet_size if self.config.fleet_size is not None else k_est
        self.vehicles = list(range(1, self.num_vehicles + 1))

        self.problem: Optional[pulp.LpProblem] = None
        self.x_vars: Dict[Tuple[int, int, int], pulp.LpVariable] = {}
        self.y_vars: Dict[Tuple[int, int], pulp.LpVariable] = {}
        self.t_vars: Dict[Tuple[int, int], pulp.LpVariable] = {}
        self.lateness_vars: Dict[int, pulp.LpVariable] = {}

    def build(self) -> pulp.LpProblem:
        """Constructs variables, objective function, and operational constraints."""
        prob = pulp.LpProblem(f"CVRPTW_Day_{self.instance.day}_{self.scenario}", pulp.LpMinimize)
        V = self.all_nodes
        Vc = self.customer_nodes
        K = self.vehicles
        M = self.config.max_route_duration_min + 500.0  # Big-M constant

        # 1. Decision Variables
        # x[i, j, k]: 1 if vehicle k traverses arc (i, j)
        for i in V:
            for j in V:
                if i != j:
                    for k in K:
                        self.x_vars[(i, j, k)] = prob.add_variable(
                            f"x_{i}_{j}_{k}", cat="Binary"
                        )

        # y[i, k]: 1 if customer i is served by vehicle k
        for i in Vc:
            for k in K:
                self.y_vars[(i, k)] = prob.add_variable(
                    f"y_{i}_{k}", cat="Binary"
                )

        # T[i, k]: Arrival time of vehicle k at customer i
        for i in Vc:
            for k in K:
                self.t_vars[(i, k)] = prob.add_variable(
                    f"T_{i}_{k}", lowBound=0.0, upBound=self.config.max_route_duration_min, cat="Continuous"
                )

        # L[i]: Lateness at customer i (soft deadline violation)
        for i in Vc:
            self.lateness_vars[i] = prob.add_variable(
                f"L_{i}", lowBound=0.0, cat="Continuous"
            )

        # 2. Objective Function (Normalized Goal Programming Formulation)
        obj_distance = pulp.lpSum(
            self.dist_mat[i, j] * self.x_vars[(i, j, k)]
            for i in V for j in V if i != j for k in K
        )
        obj_time = pulp.lpSum(
            self.time_mat[i, j] * self.x_vars[(i, j, k)]
            for i in V for j in V if i != j for k in K
        )
        obj_lateness = pulp.lpSum(self.lateness_vars[i] for i in Vc)

        prob += (
            self.alpha * (obj_distance / self.norm_d) +
            self.beta * (obj_time / self.norm_t) +
            self.gamma * (obj_lateness / self.norm_l)
        )

        # 3. Operational Constraints
        # (C1) Customer Assignment: each customer served exactly once
        for i in Vc:
            prob += pulp.lpSum(self.y_vars[(i, k)] for k in K) == 1

        # (C2) Conservation of Flow: degree coupling between x and y
        for i in Vc:
            for k in K:
                prob += pulp.lpSum(self.x_vars[(i, j, k)] for j in V if j != i) == self.y_vars[(i, k)]
                prob += pulp.lpSum(self.x_vars[(j, i, k)] for j in V if j != i) == self.y_vars[(i, k)]

        # (C3) Depot Start and Finish: vehicle departs at most once from depot
        for k in K:
            prob += pulp.lpSum(self.x_vars[(0, j, k)] for j in Vc) <= 1
            prob += pulp.lpSum(self.x_vars[(0, j, k)] for j in Vc) == pulp.lpSum(self.x_vars[(j, 0, k)] for j in Vc)

        # (C4) Dual Knapsack Vehicle Capacity Limits (Weight and Volume)
        for k in K:
            prob += (
                pulp.lpSum(self.instance.orders[i].weight_kg * self.y_vars[(i, k)] for i in Vc)
                <= self.config.capacity_weight_kg
            )
            prob += (
                pulp.lpSum(self.instance.orders[i].volume_m3 * self.y_vars[(i, k)] for i in Vc)
                <= self.config.capacity_volume_m3
            )

        # (C5) Time Propagation and MTZ Subtour Elimination
        for k in K:
            # From depot to first customer j
            for j in Vc:
                prob += self.t_vars[(j, k)] >= self.time_mat[0, j] - M * (1 - self.x_vars[(0, j, k)])

            # Between customer i and customer j
            for i in Vc:
                for j in Vc:
                    if i != j:
                        s_i = self.instance.orders[i].service_time_min
                        t_ij = self.time_mat[i, j]
                        prob += (
                            self.t_vars[(j, k)] >= self.t_vars[(i, k)] + s_i + t_ij - M * (1 - self.x_vars[(i, j, k)])
                        )

            # Return to depot before shift end
            for i in Vc:
                s_i = self.instance.orders[i].service_time_min
                t_i0 = self.time_mat[i, 0]
                prob += (
                    self.t_vars[(i, k)] + s_i + t_i0 <= self.config.max_route_duration_min + M * (1 - self.x_vars[(i, 0, k)])
                )

        # (C6) Time Window Bounds and Lateness
        for i in Vc:
            eat_i = self.instance.orders[i].eat_min
            lat_i = self.instance.orders[i].lat_min
            for k in K:
                prob += self.t_vars[(i, k)] >= eat_i * self.y_vars[(i, k)]
                prob += self.t_vars[(i, k)] <= lat_i + self.lateness_vars[i] + M * (1 - self.y_vars[(i, k)])

        self.problem = prob
        return prob
