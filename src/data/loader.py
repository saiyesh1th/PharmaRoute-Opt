import os
from pathlib import Path
from typing import Dict, Union
import numpy as np
import pandas as pd

from src.data.schema import Order, DeliveryInstance


class DataLoader:
    """Loads and parses raw Excel matrices and order files for PharmaRoute-Opt."""

    def __init__(self, raw_data_dir: Union[str, Path] = None):
        if raw_data_dir is None:
            # Default to PharmaRoute-Opt/data/raw
            current_dir = Path(__file__).resolve().parent
            self.raw_data_dir = current_dir.parent.parent / "data" / "raw"
        else:
            self.raw_data_dir = Path(raw_data_dir)

        self.orders_path = self.raw_data_dir / "orders" / "orders.xlsx"
        self.matrices_dir = self.raw_data_dir / "time_and_distance_matrices"

    def load_day(self, day: int) -> DeliveryInstance:
        """Loads complete instance data for a specific operational day (1-9)."""
        if not (1 <= day <= 9):
            raise ValueError(f"Day must be between 1 and 9, got: {day}")

        # 1. Load Orders Sheet
        sheet_name = f"Day {day}"
        df_orders = pd.read_excel(self.orders_path, sheet_name=sheet_name)
        df_orders = df_orders.dropna(subset=["NODE_ID"]).copy()
        df_orders["NODE_ID"] = df_orders["NODE_ID"].astype(int)

        orders_dict: Dict[int, Order] = {}
        for _, row in df_orders.iterrows():
            node_id = int(row["NODE_ID"])
            orders_dict[node_id] = Order(
                node_id=node_id,
                weight_kg=float(row["WEIGHT"]),
                volume_m3=float(row["VOLUME"]),
                service_time_min=float(row["SERVICE_TIME"]),
                eat_min=float(row["EAT"]),
                lat_min=float(row["LAT"])
            )

        num_orders = len(orders_dict)
        num_nodes = num_orders + 1  # Including depot (node 0)

        # 2. Load Distance & Time Matrices
        day_dir = self.matrices_dir / f"day_{day}"

        dist_file = day_dir / f"distance_matrix_{day}.xlsx"
        ml_file = day_dir / f"time_matrix_mostlikely_{day}.xlsx"
        opt_file = day_dir / f"time_matrix_optimistic_{day}.xlsx"
        pess_file = day_dir / f"time_matrix_pessimistic_{day}.xlsx"

        dist_matrix = self._read_matrix_excel(dist_file, num_nodes)
        ml_matrix = self._read_matrix_excel(ml_file, num_nodes)
        opt_matrix = self._read_matrix_excel(opt_file, num_nodes)
        pess_matrix = self._read_matrix_excel(pess_file, num_nodes)

        return DeliveryInstance(
            day=day,
            num_orders=num_orders,
            num_nodes=num_nodes,
            depot_id=0,
            orders=orders_dict,
            distance_matrix=dist_matrix,
            time_matrix_mostlikely=ml_matrix,
            time_matrix_optimistic=opt_matrix,
            time_matrix_pessimistic=pess_matrix
        )

    def _read_matrix_excel(self, file_path: Path, expected_size: int) -> np.ndarray:
        """Reads an Excel matrix, drops trailing empty padding, and validates dimensions."""
        if not file_path.exists():
            raise FileNotFoundError(f"Matrix file not found: {file_path}")

        # Index 0 is the row label (0..N-1), cols are node labels
        df = pd.read_excel(file_path, index_col=0)
        df = df.dropna(how="all").dropna(axis=1, how="all")

        # Slice to expected square size (0 .. expected_size - 1)
        matrix = df.iloc[:expected_size, :expected_size].to_numpy(dtype=float)

        if matrix.shape != (expected_size, expected_size):
            raise ValueError(
                f"Matrix shape mismatch in {file_path.name}: expected ({expected_size}, {expected_size}), got {matrix.shape}"
            )

        return matrix
