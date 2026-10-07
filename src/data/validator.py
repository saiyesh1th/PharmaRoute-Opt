from typing import List, Tuple, Dict
import numpy as np

from src.data.schema import DeliveryInstance


class DataValidator:
    """Performs sanity, integrity, and anomaly validation on a DeliveryInstance."""

    @staticmethod
    def validate_instance(instance: DeliveryInstance) -> Tuple[bool, List[str], List[str]]:
        """
        Validates instance properties.
        Returns:
            is_valid (bool): True if no fatal errors exist.
            fatal_errors (List[str]): Critical integrity violations.
            warnings (List[str]): Empirical anomalies (e.g. API routing discrepancies).
        """
        fatal_errors: List[str] = []
        warnings: List[str] = []

        # 1. Node count consistency
        expected_nodes = instance.num_orders + 1
        if instance.num_nodes != expected_nodes:
            fatal_errors.append(f"Node count mismatch: num_nodes={instance.num_nodes}, expected={expected_nodes}")

        # 2. Orders validation
        for node_id, order in instance.orders.items():
            if order.weight_kg < 0:
                fatal_errors.append(f"Node {node_id}: Negative weight ({order.weight_kg} kg)")
            if order.volume_m3 < 0:
                fatal_errors.append(f"Node {node_id}: Negative volume ({order.volume_m3} m³)")
            if order.service_time_min < 0:
                fatal_errors.append(f"Node {node_id}: Negative service time ({order.service_time_min} min)")
            if order.eat_min > order.lat_min:
                fatal_errors.append(f"Node {node_id}: Inverted time window (EAT {order.eat_min} > LAT {order.lat_min})")

        # 3. Matrix dimension and NaN checks
        matrices = {
            "distance": instance.distance_matrix,
            "time_mostlikely": instance.time_matrix_mostlikely,
            "time_optimistic": instance.time_matrix_optimistic,
            "time_pessimistic": instance.time_matrix_pessimistic,
        }

        for name, mat in matrices.items():
            if mat.shape != (instance.num_nodes, instance.num_nodes):
                fatal_errors.append(f"Matrix {name} shape {mat.shape} != ({instance.num_nodes}, {instance.num_nodes})")
            if np.isnan(mat).any():
                fatal_errors.append(f"Matrix {name} contains NaN values")
            if np.isinf(mat).any():
                fatal_errors.append(f"Matrix {name} contains Inf values")
            if (mat < 0).any():
                fatal_errors.append(f"Matrix {name} contains negative values")

            # Diagonal check (cost from node to itself should be 0)
            diag = np.diagonal(mat)
            if not np.allclose(diag, 0, atol=1e-5):
                fatal_errors.append(f"Matrix {name} has non-zero diagonal elements")

        # 4. Traffic relationship consistency warnings
        opt = instance.time_matrix_optimistic
        ml = instance.time_matrix_mostlikely
        pess = instance.time_matrix_pessimistic

        diff_opt_ml = opt - ml
        count_opt_gt_ml = int(np.sum(diff_opt_ml > 0.05))
        if count_opt_gt_ml > 0:
            warnings.append(
                f"Traffic anomaly: {count_opt_gt_ml} node pairs have optimistic > most_likely "
                f"(max excess: {np.max(diff_opt_ml):.1f} min). Likely caused by API routing path shifts."
            )

        diff_ml_pess = ml - pess
        count_ml_gt_pess = int(np.sum(diff_ml_pess > 0.05))
        if count_ml_gt_pess > 0:
            warnings.append(
                f"Traffic anomaly: {count_ml_gt_pess} node pairs have most_likely > pessimistic "
                f"(max excess: {np.max(diff_ml_pess):.1f} min)."
            )

        is_valid = len(fatal_errors) == 0
        return is_valid, fatal_errors, warnings
