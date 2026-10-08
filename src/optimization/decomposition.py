from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple, Set
import time
import numpy as np

from src.data.schema import DeliveryInstance, VehicleConfig
from src.baseline.nearest_neighbor import NearestNeighborCVRPTW
from src.optimization.model import CVRPTWModelBuilder
from src.optimization.solver import CVRPTWSolver, OptimizationSolution
from src.evaluation.metrics import MetricsCalculator, SolutionMetrics


@dataclass
class ClusterInfo:
    """Metadata for an individual decomposed customer cluster."""
    cluster_id: int
    seed_node: int
    customer_nodes: List[int]
    total_weight_kg: float
    total_volume_m3: float
    num_urgent_stops: int  # LAT <= 180 min


@dataclass
class DecompositionSolution:
    """Encapsulates the complete global solution produced by cluster-first MILP-second decomposition."""
    day: int
    scenario: str
    num_clusters: int
    clusters: List[ClusterInfo]
    routes: List[List[int]]
    vehicles_used: int
    total_distance_km: float
    total_travel_time_min: float
    total_service_time_min: float
    late_deliveries: int
    total_lateness_min: float
    on_time_rate_pct: float
    weight_utilization_pct: float
    volume_utilization_pct: float
    cluster_solve_times: List[float]
    total_runtime_sec: float
    cluster_solutions: List[OptimizationSolution] = field(default_factory=list)


class FeasibilityAwareDecomposition:
    """
    Cluster-First Route-Second Decomposition for large-scale CVRPTW instances.
    
    Because coordinates are anonymized, clustering operates directly on the
    empirical pairwise distance matrix while enforcing vehicle payload capacity (kg),
    cargo volume (m³), and time-window compatibility constraints.
    """

    def __init__(
        self,
        vehicle_config: Optional[VehicleConfig] = None,
        max_cluster_size: int = 18,
        time_limit_per_cluster: int = 30,
        alpha: float = 1.0,
        beta: float = 0.2,
        gamma: float = 0.5
    ):
        self.config = vehicle_config if vehicle_config is not None else VehicleConfig()
        self.max_cluster_size = max_cluster_size
        self.time_limit_per_cluster = time_limit_per_cluster
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma

    def partition_customers(
        self,
        instance: DeliveryInstance,
        subset_nodes: Optional[List[int]] = None
    ) -> List[ClusterInfo]:
        """
        Partitions customer nodes into geographically coherent, capacity-feasible clusters
        using distance-matrix medoids and knapsack packing.
        """
        if subset_nodes is None:
            customers = sorted(list(instance.orders.keys()))
        else:
            customers = sorted([n for n in subset_nodes if n in instance.orders])

        if not customers:
            return []

        dist_mat = instance.distance_matrix
        cap_w = self.config.capacity_weight_kg
        cap_v = self.config.capacity_volume_m3

        tot_weight = sum(instance.orders[n].weight_kg for n in customers)
        tot_vol = sum(instance.orders[n].volume_m3 for n in customers)

        # Estimate number of clusters required based on weight, volume, and target cluster size
        min_k_w = int(np.ceil(tot_weight / (cap_w * 0.95)))
        min_k_v = int(np.ceil(tot_vol / (cap_v * 0.95)))
        min_k_size = int(np.ceil(len(customers) / self.max_cluster_size))
        K = max(min_k_w, min_k_v, min_k_size, 1)

        # Step 1: Select K seed medoids using Max-Min Dispersion from depot
        seeds: List[int] = []
        # First seed: customer furthest from depot
        first_seed = max(customers, key=lambda n: dist_mat[0, n])
        seeds.append(first_seed)

        # Subsequent seeds: customer that maximizes minimum distance to existing seeds
        for _ in range(1, K):
            best_cand = None
            max_min_d = -1.0
            for cand in customers:
                if cand in seeds:
                    continue
                min_d = min(dist_mat[cand, s] for s in seeds)
                if min_d > max_min_d:
                    max_min_d = min_d
                    best_cand = cand
            if best_cand is not None:
                seeds.append(best_cand)

        # Step 2: Initialize clusters around seeds
        cluster_nodes: Dict[int, List[int]] = {s: [s] for s in seeds}
        cluster_w: Dict[int, float] = {s: instance.orders[s].weight_kg for s in seeds}
        cluster_v: Dict[int, float] = {s: instance.orders[s].volume_m3 for s in seeds}

        unassigned = [c for c in customers if c not in seeds]
        # Sort unassigned by urgency (earliest deadline first) and distance to depot
        unassigned.sort(key=lambda n: (instance.orders[n].lat_min, dist_mat[0, n]))

        # Step 3: Feasibility-aware assignment of remaining customers
        for cust in unassigned:
            order = instance.orders[cust]
            w = order.weight_kg
            v = order.volume_m3

            # Rank candidate seed clusters by proximity and capacity headroom
            ranked_seeds = []
            for s in seeds:
                can_fit = (
                    (cluster_w[s] + w <= cap_w) and
                    (cluster_v[s] + v <= cap_v) and
                    (len(cluster_nodes[s]) < self.max_cluster_size)
                )
                if can_fit:
                    proximity = dist_mat[cust, s]
                    lat_diff = abs(order.lat_min - instance.orders[s].lat_min) / 60.0
                    cost = proximity + 1.5 * lat_diff
                    ranked_seeds.append((cost, s))

            # Pick best feasible cluster; if none can fit, dynamically instantiate new seed
            if ranked_seeds:
                ranked_seeds.sort(key=lambda x: x[0])
                chosen_seed = ranked_seeds[0][1]
                cluster_nodes[chosen_seed].append(cust)
                cluster_w[chosen_seed] += w
                cluster_v[chosen_seed] += v
            else:
                seeds.append(cust)
                cluster_nodes[cust] = [cust]
                cluster_w[cust] = w
                cluster_v[cust] = v

        # Convert into ClusterInfo objects
        result_clusters: List[ClusterInfo] = []
        for idx, s in enumerate(seeds, 1):
            nodes = cluster_nodes[s]
            urgent_cnt = sum(1 for n in nodes if instance.orders[n].lat_min <= 180)
            result_clusters.append(ClusterInfo(
                cluster_id=idx,
                seed_node=s,
                customer_nodes=sorted(nodes),
                total_weight_kg=round(cluster_w[s], 2),
                total_volume_m3=round(cluster_v[s], 4),
                num_urgent_stops=urgent_cnt
            ))

        return result_clusters

    def solve(
        self,
        instance: DeliveryInstance,
        scenario: str = "mostlikely",
        subset_nodes: Optional[List[int]] = None
    ) -> DecompositionSolution:
        """
        Executes Cluster-First Route-Second Decomposition:
          1. Partitions instance into clusters.
          2. Solves each cluster as an independent CVRPTW MILP with HiGHS.
          3. Combines routes and evaluates global metrics.
        """
        t_global_start = time.perf_counter()

        clusters = self.partition_customers(instance, subset_nodes=subset_nodes)
        all_routes: List[List[int]] = []
        cluster_sol_times: List[float] = []
        cluster_sols: List[OptimizationSolution] = []

        for c in clusters:
            # Capacity-required vehicles + flexibility buffer (up to 2) to ensure shift feasibility
            k_cluster = int(np.ceil(max(c.total_weight_kg / self.config.capacity_weight_kg, c.total_volume_m3 / self.config.capacity_volume_m3)))
            k_cluster = max(k_cluster, 1)
            fleet_available = min(len(c.customer_nodes), max(k_cluster, 2))
            cluster_veh_cfg = VehicleConfig(
                capacity_weight_kg=self.config.capacity_weight_kg,
                capacity_volume_m3=self.config.capacity_volume_m3,
                max_route_duration_min=self.config.max_route_duration_min,
                fleet_size=fleet_available
            )

            builder = CVRPTWModelBuilder(
                instance=instance,
                scenario=scenario,
                vehicle_config=cluster_veh_cfg,
                subset_nodes=c.customer_nodes,
                alpha=self.alpha,
                beta=self.beta,
                gamma=self.gamma
            )
            solver = CVRPTWSolver(time_limit_sec=self.time_limit_per_cluster, verbose=False)
            sol = solver.solve(builder)

            cluster_sol_times.append(sol.solve_duration_sec)
            cluster_sols.append(sol)

            if sol.is_feasible and sol.routes:
                for r in sol.routes:
                    all_routes.append(r)
            else:
                # Fallback: if MILP failed to find feasible integer tour within limit,
                # use nearest-neighbor heuristic for this specific cluster as fallback
                sub_orders = {n: instance.orders[n] for n in c.customer_nodes}
                sub_inst = DeliveryInstance(
                    day=instance.day,
                    num_orders=len(sub_orders),
                    num_nodes=len(sub_orders) + 1,
                    depot_id=0,
                    orders=sub_orders,
                    distance_matrix=instance.distance_matrix,
                    time_matrix_mostlikely=instance.time_matrix_mostlikely,
                    time_matrix_optimistic=instance.time_matrix_optimistic,
                    time_matrix_pessimistic=instance.time_matrix_pessimistic
                )
                fb_sol = NearestNeighborCVRPTW(cluster_veh_cfg).solve(sub_inst, scenario=scenario)
                for r in fb_sol.routes:
                    all_routes.append(r.stops)

        t_total = time.perf_counter() - t_global_start

        # Evaluate combined global routes
        time_mat = instance.get_time_matrix(scenario)
        global_metrics: SolutionMetrics = MetricsCalculator.evaluate_routes(
            routes=all_routes,
            dist_matrix=instance.distance_matrix,
            time_matrix=time_mat,
            orders=instance.orders,
            capacity_weight=self.config.capacity_weight_kg,
            capacity_volume=self.config.capacity_volume_m3
        )

        return DecompositionSolution(
            day=instance.day,
            scenario=scenario,
            num_clusters=len(clusters),
            clusters=clusters,
            routes=all_routes,
            vehicles_used=global_metrics.vehicles_used,
            total_distance_km=global_metrics.total_distance_km,
            total_travel_time_min=global_metrics.total_travel_time_min,
            total_service_time_min=global_metrics.total_service_time_min,
            late_deliveries=global_metrics.late_deliveries,
            total_lateness_min=global_metrics.total_lateness_min,
            on_time_rate_pct=global_metrics.on_time_rate_pct,
            weight_utilization_pct=global_metrics.weight_utilization_pct,
            volume_utilization_pct=global_metrics.volume_utilization_pct,
            cluster_solve_times=cluster_sol_times,
            total_runtime_sec=round(t_total, 3),
            cluster_solutions=cluster_sols
        )
