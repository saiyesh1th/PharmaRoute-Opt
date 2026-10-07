from pathlib import Path
from typing import Dict, List, Any
import numpy as np
import pandas as pd

from src.data.loader import DataLoader


class DescriptiveAnalyzer:
    """Produces exploratory data analysis (EDA) and summary statistics across all 9 delivery days."""

    def __init__(self, raw_data_dir=None):
        self.loader = DataLoader(raw_data_dir)

    def analyze_all_days(self) -> pd.DataFrame:
        """Analyzes order distributions and matrix parameters for all 9 operational days."""
        records = []
        for day in range(1, 10):
            inst = self.loader.load_day(day)
            weights = [o.weight_kg for o in inst.orders.values()]
            volumes = [o.volume_m3 for o in inst.orders.values()]
            services = [o.service_time_min for o in inst.orders.values()]
            lats = [o.lat_min for o in inst.orders.values()]

            # Off-diagonal matrix statistics (excluding self-loops)
            n = inst.num_nodes
            mask = ~np.eye(n, dtype=bool)

            avg_dist = float(np.mean(inst.distance_matrix[mask]))
            avg_t_opt = float(np.mean(inst.time_matrix_optimistic[mask]))
            avg_t_ml = float(np.mean(inst.time_matrix_mostlikely[mask]))
            avg_t_pess = float(np.mean(inst.time_matrix_pessimistic[mask]))

            records.append({
                "day": f"Day {day}",
                "num_orders": inst.num_orders,
                "total_weight_kg": round(sum(weights), 2),
                "avg_weight_kg": round(float(np.mean(weights)), 2),
                "total_volume_m3": round(sum(volumes), 3),
                "avg_volume_m3": round(float(np.mean(volumes)), 4),
                "avg_service_min": round(float(np.mean(services)), 2),
                "lat_180_count": sum(1 for l in lats if l <= 180),
                "lat_300_count": sum(1 for l in lats if 180 < l <= 300),
                "lat_360_count": sum(1 for l in lats if l > 300),
                "mean_distance_km": round(avg_dist, 2),
                "mean_time_opt_min": round(avg_t_opt, 2),
                "mean_time_ml_min": round(avg_t_ml, 2),
                "mean_time_pess_min": round(avg_t_pess, 2),
            })

        return pd.DataFrame(records)
