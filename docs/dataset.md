# Dataset Documentation & Data Dictionary

## 1. Overview & Provenance
* **Title:** Delivering Data: A Real-World Dataset for Last-Mile Delivery Optimization
* **Authors:** Anna Vrani, Savvas D. Apostolidis, Athanasios Ch. Kapoutsis, Elias B. Kosmatopoulos (2025)
* **Journal:** *Data in Brief*, Volume 61, 2025, 111762. [PMC12206052](https://pmc.ncbi.nlm.nih.gov/articles/PMC12206052/)
* **Repository / Zenodo DOI:** [10.5281/zenodo.15310106](https://doi.org/10.5281/zenodo.15310106)
* **Domain:** Pharmaceutical Last-Mile Delivery in the metropolitan region of Athens, Greece.
* **Problem Classification:** Rich Capacitated Vehicle Routing Problem with Time Windows (CVRPTW) under traffic uncertainty.

---

## 2. Dataset Architecture

```text
data/raw/
├── orders/
│   └── orders.xlsx                           # 9 sheets (Day 1 through Day 9)
├── time_and_distance_matrices/
│   ├── day_1/ ... day_9/
│   │   ├── distance_matrix_d.xlsx            # Pairwise distance (km)
│   │   ├── time_matrix_mostlikely_d.xlsx     # Expected travel time (min)
│   │   ├── time_matrix_optimistic_d.xlsx     # Free-flow travel time (min)
│   │   └── time_matrix_pessimistic_d.xlsx    # Peak-congestion travel time (min)
├── sectors_grouping/                         # Geographic sector maps (Central, West, North, East)
└── heatmaps_sd_beta/                         # PERT Beta travel-time standard deviation heatmaps
```

---

## 3. Orders Data Dictionary (`orders.xlsx`)

All 9 sheets represent distinct operational days with real deliveries to pharmacies.

| Field Name | Type | Unit | Operational Meaning | Value Range in Dataset |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ID` | Integer | ID | Unique identifier for delivery customer stop. (Depot is `0`). | $1 \dots 84$ |
| `WEIGHT` | Float | kg | Total weight of pharmaceutical parcel consignment. | $0.023 \dots 453.15$ kg |
| `VOLUME` | Float | $\text{m}^3$ | Total volume of pharmaceutical packaging. | $0.0002 \dots 1.952$ $\text{m}^3$ |
| `SERVICE_TIME`| Float | min | Unloading, verification, and handover time at pharmacy. | $\{4, 8, 12\}$ min |
| `EAT` | Float | min | Earliest Allowed Arrival Time relative to 08:00 AM. | $0$ min (all orders) |
| `LAT` | Float | min | Latest Allowed Arrival Time relative to 08:00 AM. | $\{180, 300, 360\}$ min |
| `TIME WINDOW` | Formula | string | Excel representation: `(EAT, LAT)`. | e.g. `(0, 300)` |

### Operational Time Window Interpretation
* **Reference Start:** 08:00 AM ($t = 0$).
* **LAT = 180 min:** 11:00 AM morning delivery deadline (urgent / early pharmacies).
* **LAT = 300 min:** 01:00 PM afternoon delivery deadline (standard shift).
* **LAT = 360 min:** 02:00 PM final shift deadline (6-hour maximum operational shift).

---

## 4. Multi-Day Instance Summary

| Day | Customer Orders | Matrix Dim ($N \times N$) | Total Weight (kg) | Total Volume ($\text{m}^3$) | Avg Service (min) | LAT $\le 180$ (Urgent) | LAT $\le 300$ | LAT $\le 360$ |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Day 1** | 78 | $79 \times 79$ | 1,880.50 | 9.020 | 6.36 | 15 | 62 | 1 |
| **Day 2** | 63 | $64 \times 64$ | 1,394.55 | 5.228 | 6.48 | 15 | 47 | 1 |
| **Day 3** | 67 | $68 \times 68$ | 687.63 | 4.054 | 5.73 | 11 | 55 | 1 |
| **Day 4** | 69 | $70 \times 70$ | 1,689.37 | 4.758 | 6.20 | 18 | 50 | 1 |
| **Day 5** | 75 | $76 \times 76$ | 1,270.17 | 4.449 | 6.35 | 17 | 57 | 1 |
| **Day 6** | 77 | $78 \times 78$ | 1,301.43 | 4.592 | 6.03 | 16 | 60 | 1 |
| **Day 7** | 66 | $67 \times 67$ | 1,034.56 | 3.693 | 5.94 | 14 | 51 | 1 |
| **Day 8** | 74 | $75 \times 75$ | 1,095.37 | 3.213 | 5.89 | 15 | 58 | 1 |
| **Day 9** | 84 | $85 \times 85$ | 1,301.54 | 5.316 | 6.86 | 25 | 58 | 1 |

---

## 5. Matrix Properties & Observations

1. **Depot Representation:**
   * Node `0` is consistently the central distribution depot.
   * Nodes `1` through $N-1$ are delivery stops.
   * Matrix diagonals $d_{ii} = 0$ and $t_{ii} = 0$.
2. **Asymmetry:**
   * Distances and travel times are asymmetric ($d_{ij} \ne d_{ji}$) due to one-way streets, turn restrictions, and urban Athens topography.
3. **Traffic Scenarios:**
   * Generated using commercial routing APIs across three traffic conditions:
     * **Optimistic:** Free-flow travel times (night / off-peak conditions).
     * **Most-Likely:** Expected typical daytime metropolitan traffic.
     * **Pessimistic:** High-congestion peak hours.
4. **Empirical Anomaly Observation:**
   * In Day 1, 468 out of 6,241 pairs exhibit slightly higher optimistic time than most-likely (mean difference $2.28$ minutes). This is an empirical artifact of routing engines selecting highway/arterial bypasses with higher speed limits under free-flow traffic versus direct surface streets during congested hours.
