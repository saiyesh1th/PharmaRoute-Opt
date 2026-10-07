# PharmaRoute-Opt

**An Operations Research Decision-Support System for Pharmaceutical Last-Mile Delivery Optimization**

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Optimization PuLP + HiGHS](https://img.shields.io/badge/solver-PuLP%20%2B%20HiGHS-orange.svg)](https://highs.dev/)
[![Dataset Zenodo](https://img.shields.io/badge/dataset-10.5281%2Fzenodo.15310106-green.svg)](https://doi.org/10.5281/zenodo.15310106)
[![Tests Passing](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

---

## 1. Project Overview
**PharmaRoute-Opt** is an Operations Research decision-support framework designed to solve real-world pharmaceutical vehicle routing problems under multi-scenario traffic uncertainty.

Built on empirical delivery data from Athens, Greece (*Delivering Data*, Data in Brief 2025 / PMC12206052), the system models the logistics network as a **Capacitated Vehicle Routing Problem with Time Windows and Service Times (CVRPTW-S)**.

### Core Capabilities
* **Rigorous Mathematical Formulation:** Integrates Assignment, Subtour Elimination (MTZ), Dual Knapsack Capacity (Weight & Volume), and Time Windows into a Mixed-Integer Linear Program (MILP).
* **Multi-Scenario Traffic Modeling:** Incorporates empirical API-derived travel-time matrices under **Optimistic**, **Most-Likely**, and **Pessimistic** traffic regimes.
* **Fast Heuristic Baseline:** High-speed greedy nearest-neighbor solver for operational scale (0.05s).
* **Stress Testing & Robustness Analysis:** Measures schedule degradation ($\Delta P$) and route stability (Jaccard arc distance) when real-world congestion occurs.
* **Decision Support Interface:** Exposes model trade-offs for pharmaceutical dispatchers.

---

## 2. Repository Architecture

```text
PharmaRoute-Opt/
├── README.md                           # Project documentation & quickstart
├── requirements.txt                    # Python dependencies
├── run_experiment.py                   # Unified CLI runner
├── data/
│   ├── raw/                            # Immutable raw dataset (orders.xlsx & matrices)
│   ├── interim/                        # Cleaned / standardized tables
│   └── processed/                      # Preprocessed solver instances
├── src/
│   ├── data/                           # Data loading, schemas, validation, preprocessing
│   │   ├── schema.py
│   │   ├── loader.py
│   │   ├── validator.py
│   │   └── preprocessing.py
│   ├── analysis/                       # Descriptive EDA and distribution analysis
│   │   └── descriptive.py
│   ├── baseline/                       # Greedy nearest-neighbor CVRPTW heuristic
│   │   ├── nearest_neighbor.py
│   │   └── evaluation.py
│   ├── optimization/                   # MILP model with PuLP & HiGHS
│   │   ├── model.py
│   │   └── solver.py
│   ├── scenarios/                      # Multi-scenario traffic manager
│   │   └── traffic.py
│   ├── evaluation/                     # Metric calculations and robustness stress tests
│   │   ├── metrics.py
│   │   └── robustness.py
│   └── visualization/                  # Route sequence visualizers
│       └── routes.py
├── experiments/
│   └── configs/                        # YAML experiment parameter files
├── results/                            # Output CSV tables, metrics, and comparisons
├── tests/                              # Pytest test suite
└── docs/                               # Detailed mathematical & dataset documentation
    ├── dataset.md
    └── mathematical_model.md
```

---

## 3. Quick Start & Execution

### 3.1 Installation
```bash
py -m pip install -r requirements.txt
```

### 3.2 Run Unit Tests
```bash
py -m pytest tests/
```

### 3.3 Run Heuristic Baseline for Day 1
```bash
py run_experiment.py --day 1 --scenario mostlikely
```

### 3.4 Run Multi-Scenario Traffic & Robustness Stress Test
```bash
py run_experiment.py --day 1 --mode scenarios
```

---

## 4. Key Empirical Findings (Day 1)

1. **Travel Time Degradation:**
   * Under peak congestion (Pessimistic), total travel duration increases by **+158.5%** over free-flow (Optimistic).
2. **Vehicle Shift Limit Saturation:**
   * With a 360-minute maximum vehicle shift, the system requires **4 vehicles** under normal traffic, but must deploy **6 vehicles** under heavy traffic to prevent shift overtime.
3. **Plan Brittleness (Stress Test):**
   * If a route plan generated under Most-Likely traffic is deployed during heavy traffic, on-time delivery rate plummets from **96.2% to 65.4%**, and late deliveries surge from **3 to 27**.

---

## 5. Academic Citation
```bibtex
@article{vrani2025delivering,
  title={Delivering data: A real-world dataset for last-mile delivery optimization},
  author={Vrani, Anna and Apostolidis, Savvas D. and Kapoutsis, Athanasios Ch. and Kosmatopoulos, Elias B.},
  journal={Data in Brief},
  volume={61},
  pages={111762},
  year={2025},
  publisher={Elsevier},
  doi={10.1016/j.dib.2025.111762}
}
```
