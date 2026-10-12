# PharmaRoute-Opt

**An Operations Research Decision-Support System for Pharmaceutical Last-Mile Delivery Optimization under Multi-Scenario Traffic Uncertainty**

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Optimization PuLP + HiGHS](https://img.shields.io/badge/solver-PuLP%20%2B%20HiGHS-orange.svg)](https://highs.dev/)
[![Dataset Zenodo](https://img.shields.io/badge/dataset-10.5281%2Fzenodo.15310106-green.svg)](https://doi.org/10.5281/zenodo.15310106)
[![Tests Passing](https://img.shields.io/badge/tests-8%20passed-brightgreen.svg)]()
[![Documentation](https://img.shields.io/badge/docs-PROJECT__DOCUMENTATION.md-purple.svg)](PROJECT_DOCUMENTATION.md)

---

> 📖 **Comprehensive Project Manual Available:**  
> For an exhaustive, in-depth technical reference covering all mathematical formulations, decision variables, model parameters, cluster-first algorithms, directory structures, and file-by-file documentation, please consult [**`PROJECT_DOCUMENTATION.md`**](PROJECT_DOCUMENTATION.md).

---

## 1. Project Overview

**PharmaRoute-Opt** is an enterprise-grade Operations Research (OR) decision-support framework designed to solve real-world pharmaceutical vehicle routing problems under stochastic traffic conditions.

Built on empirical last-mile delivery data from metropolitan Athens, Greece (*Delivering Data*, Data in Brief 2025 / PMC12206052), the system models urban logistics as a **Capacitated Vehicle Routing Problem with Time Windows and Service Times (CVRPTW-S)**.

### Core Capabilities
* **Rigorous Mathematical Formulation:** Integrates Assignment, Subtour Elimination (MTZ), Dual Knapsack Physical Capacity (Weight & Volume), and Continuous Temporal Scheduling into a Mixed-Integer Linear Program (MILP).
* **Cluster-First Route-Second Decomposition:** Overcomes monolithic branch-and-cut combinatorial tractability limits ($n \ge 25$) to solve full real-world 63- to 84-customer daily instances in ~46 seconds.
* **Multi-Scenario Traffic Modeling:** Incorporates empirical API-derived travel-time matrices under **Optimistic** (free-flow), **Most-Likely** (typical daytime), and **Pessimistic** (peak gridlock) traffic regimes.
* **Fast Heuristic Baseline:** High-speed greedy nearest-neighbor solver for real-time dispatch benchmarks (0.05s).
* **Stress-Testing & Plan Robustness (RQ6):** Evaluates schedule fragility and topological arc stability (Jaccard similarity) when plans optimized for normal conditions encounter severe congestion shocks.
* **Three Decision-Support User Interfaces:** Includes an interactive Streamlit simulation dashboard, a production React + Leaflet GIS command center, and a zero-dependency standalone web interface.

---

## 2. Repository Architecture

```text
PharmaRoute-Opt/
├── README.md                           # Quickstart guide & repository overview
├── PROJECT_DOCUMENTATION.md            # Exhaustive 1,000+ line technical & OR reference
├── requirements.txt                    # Python dependencies
├── run_experiment.py                   # Unified CLI runner for all models & benchmarks
├── app/                                # Streamlit Operations Research DSS
│   └── app.py                          # Multi-tab interactive decision-support application
├── data/
│   ├── raw/                            # Immutable raw dataset (orders.xlsx & matrices)
│   ├── interim/                        # Cleaned / standardized tables
│   └── processed/                      # Preprocessed solver instances
├── src/
│   ├── data/                           # Data loading, schemas, validation, preprocessing
│   │   ├── schema.py                   # Order, VehicleConfig, DeliveryInstance schemas
│   │   ├── loader.py                   # Multi-tab Excel matrix and order parser
│   │   ├── validator.py                # Sanity, integrity, and road anomaly checks
│   │   └── preprocessing.py            # Transformation to solver index dictionaries
│   ├── analysis/                       # Descriptive EDA and multi-day statistics
│   │   └── descriptive.py
│   ├── baseline/                       # Heuristic routing solver
│   │   └── nearest_neighbor.py         # Greedy nearest-neighbor CVRPTW-S heuristic
│   ├── optimization/                   # Exact & decomposed mathematical optimization
│   │   ├── model.py                    # CVRPTW-S MILP formulation (PuLP builder)
│   │   ├── solver.py                   # Solver interface (HiGHS wrapper & C++ log parser)
│   │   └── decomposition.py            # Feasibility-aware cluster-first decomposition
│   ├── scenarios/                      # Scenario coordination
│   │   └── traffic.py                  # Multi-scenario traffic manager
│   ├── evaluation/                     # Metric evaluation & stress testing
│   │   ├── metrics.py                  # Standardized SolutionMetrics calculator
│   │   └── robustness.py               # Arc Jaccard stability & cross-evaluation
│   └── visualization/                  # Textual sequence formatters
│       └── routes.py
├── frontend/                           # Production React + Leaflet GIS Command Center
│   ├── src/
│   │   ├── App.jsx                     # Interactive GIS map, Gantt timeline, driver panels
│   │   ├── App.css                     # Dark luxury cartography stylesheet
│   │   └── data/pharmaData.json        # Precomputed benchmark database (all 27 runs)
│   ├── package.json
│   └── vite.config.js
├── web/                                # Standalone zero-dependency web dashboard
│   ├── index.html                      # Native HTML5 / Chart.js dashboard
│   ├── index.css                       # Responsive glassmorphic styles
│   ├── index.js                        # Client routing and spatial canvas
│   └── data/pharma_data.js             # Embedded JSON data bundle
├── experiments/                        # Academic experiment & benchmark scripts
│   ├── configs/default_config.yaml     # Default configuration and hyperparameters
│   ├── run_nine_day_benchmark.py       # Full 27-instance evaluation across all 9 days (RQ5)
│   ├── run_scalability_benchmark.py    # Monolithic MILP tractability vs problem size (RQ2)
│   ├── run_multiobjective_sweep.py     # Parametric weights (alpha, beta, gamma) (RQ4)
│   ├── run_decomposition_benchmark.py  # Monolithic vs decomposed comparison (RQ3)
│   └── run_robustness_stress_test.py   # Traffic gridlock shock simulation (RQ6)
├── results/                            # Benchmark summaries and generated plots
│   ├── benchmarks/                     # CSV & JSON benchmark outputs (all 27 runs)
│   └── figures/                        # Generated Pareto and robustness charts
├── tests/                              # Pytest test suite (100% passing)
└── docs/                               # Foundational documentation
    ├── dataset.md                      # Dataset provenance and dictionary
    └── mathematical_model.md           # Mathematical model specification
```

---

## 3. Quick Start & Execution

### 3.1 Installation
```bash
# Clone or navigate to the repository
cd PharmaRoute-Opt

# Install Python dependencies
python -m pip install -r requirements.txt
```

### 3.2 Run Unit Tests
```bash
python -m pytest tests/ -v
```
*(Runs 8 unit tests covering loader, validator, baseline, decomposition, MILP optimizer, and custom constraints).*

### 3.3 Run Optimization Benchmarks via CLI
```bash
# 1. Run greedy baseline heuristic for Day 1
python run_experiment.py --day 1 --scenario mostlikely --mode baseline

# 2. Run monolithic MILP on a 10-customer cluster (HiGHS)
python run_experiment.py --day 1 --scenario mostlikely --mode milp --nodes 10 --time-limit 30

# 3. Run cluster-first decomposed MILP on full Day 1 (78 customers)
python run_experiment.py --day 1 --scenario mostlikely --mode decomposition --time-limit 20

# 4. Run multi-scenario comparison and plan stability test
python run_experiment.py --day 1 --mode scenarios

# 5. Run full 9-day x 3-scenario academic benchmark (27 instances)
python experiments/run_nine_day_benchmark.py

# 6. Run multi-objective Pareto weight sweep (RQ4)
python experiments/run_multiobjective_sweep.py

# 7. Run traffic shock robustness stress test (RQ6)
python experiments/run_robustness_stress_test.py

# 8. Run scalability benchmark across problem sizes (RQ2)
python experiments/run_scalability_benchmark.py
```

### 3.4 Launch Decision Support Web Interfaces

#### Option A: Interactive Streamlit Dashboard (Recommended)
Features live interactive sliders for vehicle payload weight ($100-2500\text{ kg}$), cubic cargo volume ($0.5-10.0\text{ m}^3$), driver shift duration ($180-600\text{ min}$), and fleet limits with on-the-fly simulation:
```bash
python -m streamlit run app/app.py
# Opens at: http://localhost:8501/
```

#### Option B: Production React + Leaflet GIS Command Center
Features interactive satellite/dark GIS mapping, animated vehicle tour playback, driver profiles, and delivery Gantt timelines:
```bash
cd frontend
npm install
npm run dev
# Opens at: http://localhost:5173/
```

#### Option C: Standalone Zero-Dependency Web Dashboard
Zero build steps, zero Node.js dependencies—runs natively in any browser:
```bash
# Option 1: Double-click web/index.html in Windows Explorer
# Option 2: Serve locally via Python
python -m http.server 3000 --directory web
# Opens at: http://localhost:3000/
```

---

## 4. Key Empirical Findings

### 4.1 27-Instance Academic Benchmark (9 Days × 3 Traffic Regimes)
* **On-Time Advantage:** Cluster-first Decomposed MILP achieves a **97.58% Mean On-Time Delivery Rate** vs. **94.07%** for the Greedy heuristic (+3.51% punctuality advantage).
* **Lateness Reduction:** Reduces delayed clinical deliveries by **58.9%** (48 late deliveries vs. 117 for Greedy across all 1,938 order evaluations).
* **Computational Efficiency:** Solves full 63- to 84-customer daily instances in **46.17 seconds** average total runtime.

### 4.2 Monolithic MILP Scalability Limits (RQ2)
* Monolithic CVRPTW-S solves small instances up to $n = 15$ to proven optimality within 12s, and $n = 20$ within 60s (with a 28.8% optimality gap).
* At $n \ge 25$ and the full 78-node Day 1 problem, monolithic branch-and-cut fails to establish an integer feasible solution within 120s, empirically establishing the necessity for **cluster-first decomposition**.

### 4.3 Multi-Objective Trade-Off & Pareto Frontier (RQ4)
* The normalized weighted objective $Z = \alpha (D/D_0) + \beta (T/T_0) + \gamma (L/L_0)$ demonstrates clear non-dominated trade-offs:
  * **Profile 7 ($\alpha=0.20, \beta=0.20, \gamma=0.60$):** Best operational compromise, achieving **100% on-time delivery (0 minutes lateness)** at **86.0 km** (+9.7% distance vs. pure distance minimization).
  * **Profile 3 ($\gamma=1.00$):** Optimizing purely for lateness without mileage constraints inflates route distance by **+184% (222.8 km)**.

### 4.4 Traffic Robustness Under Severe Gridlock Shocks (RQ6)
* When delivery plans optimized under normal (Most-Likely) conditions are deployed into severe peak-hour gridlock (+50% to +150% delay surge):
  * **Greedy Punctuality:** Collapses by **-21.36%** down to **72.71%**.
  * **Decomposed MILP:** Maintains an **80.02% resilience buffer (+7.31% higher)**, avoiding **5,171 minutes** of fleet delay and preventing **104 delayed hospital deliveries**.

---

## 5. Academic Citation

```bibtex
@article{vrani2025delivering,
  title     = {Delivering data: A real-world dataset for last-mile delivery optimization},
  author    = {Vrani, Anna and Apostolidis, Savvas D. and Kapoutsis, Athanasios Ch. and Kosmatopoulos, Elias B.},
  journal   = {Data in Brief},
  volume    = {61},
  pages     = {111762},
  year      = {2025},
  publisher = {Elsevier},
  doi       = {10.1016/j.dib.2025.111762}
}
```

---
*For full technical details, consult [**`PROJECT_DOCUMENTATION.md`**](PROJECT_DOCUMENTATION.md).*
