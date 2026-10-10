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
│   │   ├── model.py                    # CVRPTW-S formulation (Dual knapsack, MTZ subtours)
│   │   ├── solver.py                   # Solver interface (HiGHS wrapper)
│   │   └── decomposition.py            # Feasibility-aware cluster-first decomposition
│   ├── scenarios/                      # Multi-scenario traffic manager
│   │   └── traffic.py
│   ├── evaluation/                     # Metric calculations and robustness stress tests
│   │   ├── metrics.py
│   │   └── robustness.py
│   └── visualization/                  # Route sequence visualizers
│       └── routes.py
├── frontend/                           # Production React + Leaflet GIS Command Center
│   ├── src/
│   │   ├── App.jsx                     # Interactive GIS map, Gantt timeline, RQs tabs
│   │   ├── App.css                     # High-grade dark cartography stylesheet
│   │   └── data/pharmaData.json        # Precomputed benchmark database (all 27 runs)
│   └── package.json
├── web/                                # Standalone zero-dependency web dashboard
│   ├── index.html                      # Native HTML5 / Chart.js dashboard
│   ├── index.css                       # Responsive glassmorphic styles
│   ├── index.js                        # Client routing and spatial canvas
│   └── data/pharma_data.js             # Embedded JSON data bundle
├── experiments/                        # Benchmark & research experiment scripts
│   ├── run_scalability_study.py        # Monolithic MILP tractability vs problem size
│   ├── run_multiobjective_sweep.py     # Parametric weights (alpha, beta, gamma)
│   ├── run_decomposition_benchmark.py  # 25-node and 78-node decomposition tests
│   ├── run_nine_day_benchmark.py       # Full 27-instance evaluation across all 9 days
│   └── run_robustness_stress_test.py   # Traffic gridlock shock simulation
├── results/                            # Benchmark CSV summaries and figures
│   ├── benchmarks/                     # CSV tables for all 27 runs and stress tests
│   └── figures/                        # Matplotlib / Seaborn comparison charts
├── tests/                              # Pytest test suite (100% passing)
└── docs/                               # Detailed mathematical & dataset documentation
    ├── dataset.md
    └── mathematical_model.md
```

---

## 3. Quick Start & Execution

### 3.1 Installation (Python Environment)
```bash
py -m pip install -r requirements.txt
```

### 3.2 Run Unit Tests
```bash
py -m pytest tests/
```

### 3.3 Run Optimization Benchmarks via CLI
```bash
# Run baseline heuristic for Day 1
py run_experiment.py --day 1 --scenario mostlikely

# Run multi-scenario traffic comparison & stress test
py run_experiment.py --day 1 --mode scenarios

# Run full 9-day x 3-scenario benchmark (27 instances)
py experiments/run_nine_day_benchmark.py

# Run multi-objective weight sweep (RQ4)
py experiments/run_multiobjective_sweep.py

# Run severe traffic stress test (RQ6)
py experiments/run_robustness_stress_test.py
```

### 3.4 Launch Decision Support Web Interfaces

#### Option A: Production React + Leaflet GIS Dashboard (Recommended)
```bash
cd frontend
npm install
npm run dev
# Opens live at http://localhost:5173/
```

#### Option B: Standalone Web Dashboard (Zero Node.js Dependencies)
```bash
# Serve locally via Python
py -m http.server 3000 --directory web
# Opens live at http://localhost:3000/
# Or simply double-click web/index.html directly in any browser
```

---

## 4. Key Empirical Findings

### 4.1 27-Instance Academic Benchmark (9 Days × 3 Traffic Regimes)
* **On-Time Advantage:** Cluster-first Decomposed MILP achieves **97.58% Average On-Time Rate** vs. **94.07%** for Greedy (+3.51% punctuality advantage).
* **Lateness Reduction:** Reduces total delayed hospital deliveries by **58.9%** (48 late deliveries vs. 117 for Greedy across all 1,938 clinic orders).
* **Computational Efficiency:** Solves full 63–84 customer instances in **46.17 seconds** average total runtime.

### 4.2 Multi-Objective Trade-Off (RQ4)
* The weighted objective $Z = \alpha D + \beta T + \gamma L$ ($\alpha+\beta+\gamma=1$) reveals a sharp trade-off:
  * **Profile 7 ($\alpha=0.20, \beta=0.20, \gamma=0.60$):** Best observed non-dominated trade-off, achieving **100% on-time delivery (0 lateness)** at **86.0 km**.
  * **Profile 8 ($\gamma=1.00$):** Optimizing purely for lateness without mileage penalties inflates route distance by **+159% (222.8 km)**.

### 4.3 Traffic Robustness Under Severe Gridlock (RQ6)
* When route plans optimized under normal traffic are deployed under severe gridlock (+50% travel times):
  * **Greedy Punctuality:** Collapses by **-20.3%** down to **72.71%**.
  * **Decomposed MILP:** Maintains an **80.02% resilience buffer (+7.31% higher)**, avoiding **5,171 minutes** of fleet delay and preventing **49 delayed hospital deliveries**.

### 4.4 Monolithic MILP Scalability Limits (RQ3)
* Monolithic CVRPTW-S MILP solves instances up to $n=20$ within 30s (with 25–50% optimality gaps).
* At $n \ge 25$ and the full 78-node Day 1 problem, monolithic MILP fails to find an integer feasible solution within 120s, empirically establishing the necessity for **cluster-first decomposition**.

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
