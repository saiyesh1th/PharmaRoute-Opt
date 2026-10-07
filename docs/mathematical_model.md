# Mathematical Formulation: Capacitated Vehicle Routing Problem with Time Windows (CVRPTW)

## 1. Operations Research Problem Classification
The core problem in **PharmaRoute-Opt** is mathematically classified as a **Capacitated Vehicle Routing Problem with Time Windows and Service Times (CVRPTW-S)** under traffic-dependent travel times.

It integrates three classical Operations Research problem families into a unified Mixed-Integer Linear Program (MILP):
1. **Assignment Problem:** Partitioning $n$ pharmaceutical orders across $m$ vehicles respecting vehicle capacities.
2. **Vehicle Routing & Subtour Elimination:** Finding Hamiltonian subpaths from and to the depot without disjoint loops.
3. **Temporal Scheduling:** Propagating service durations and traffic transit times under rigid delivery deadlines.

---

## 2. Mathematical Notation

### Sets
* $V = \{0, 1, 2, \dots, n\}$: Complete vertex set, where $0$ represents the central pharmaceutical depot.
* $V_c = \{1, 2, \dots, n\} = V \setminus \{0\}$: Set of customer pharmacies to be serviced.
* $K = \{1, 2, \dots, m\}$: Set of homogeneous/heterogeneous delivery vehicles.
* $A = \{(i, j) \in V \times V : i \neq j\}$: Set of directed arcs connecting nodes.

### Parameters
* $d_{ij} \ge 0$: Distance between node $i$ and node $j$ in kilometers ($d_{ii} = 0$).
* $t_{ij}^{(s)} \ge 0$: Travel time between node $i$ and node $j$ under traffic scenario $s \in \{\text{optimistic}, \text{mostlikely}, \text{pessimistic}\}$.
* $w_i \ge 0$: Consignment payload weight for pharmacy $i$ in kilograms ($w_0 = 0$).
* $v_i \ge 0$: Consignment packaging volume for pharmacy $i$ in cubic meters ($v_0 = 0$).
* $s_i \ge 0$: Service and handover time at pharmacy $i$ in minutes ($s_0 = 0$).
* $e_i \ge 0$: Earliest Allowed Arrival Time (EAT) in minutes from 08:00 AM.
* $l_i \ge 0$: Latest Allowed Arrival Time (LAT) in minutes from 08:00 AM.
* $C_w$: Maximum vehicle payload weight capacity (e.g. $600$ kg).
* $C_v$: Maximum vehicle cargo volume capacity (e.g. $3.0\text{ m}^3$).
* $T_{\max}$: Maximum vehicle shift duration (e.g. $360$ minutes / 6 hours).
* $M$: A sufficiently large positive scalar ($M \ge T_{\max} + \max_{(i,j)} t_{ij}$).

---

## 3. Decision Variables

$$\begin{aligned}
x_{ijk} &\in \{0, 1\} && \forall (i, j) \in A, \; \forall k \in K \quad (\text{1 if vehicle } k \text{ traverses arc } (i,j); 0 \text{ otherwise}) \\
y_{ik} &\in \{0, 1\} && \forall i \in V_c, \; \forall k \in K \quad (\text{1 if customer } i \text{ is assigned to vehicle } k; 0 \text{ otherwise}) \\
T_{ik} &\ge 0 && \forall i \in V_c, \; \forall k \in K \quad (\text{Arrival time of vehicle } k \text{ at customer } i) \\
L_i &\ge 0 && \forall i \in V_c \quad (\text{Lateness in minutes beyond deadline } l_i)
\end{aligned}$$

---

## 4. Objective Function

### Multi-Objective Formulation (Goal Programming / Normalized Scalarization)
To avoid unit-incommensurability between kilometers, minutes, and penalty units, objectives are normalized relative to baseline reference values $(D_0, T_0, L_0)$:

$$\min Z = \alpha \left(\frac{D}{D_0}\right) + \beta \left(\frac{T}{T_0}\right) + \gamma \left(\frac{L}{L_0 + \epsilon}\right)$$

where:
* **Total Distance ($D$):**
  $$D = \sum_{k \in K} \sum_{(i,j) \in A} d_{ij} x_{ijk}$$
* **Total Travel Time ($T$):**
  $$T = \sum_{k \in K} \sum_{(i,j) \in A} t_{ij}^{(s)} x_{ijk}$$
* **Total Lateness ($L$):**
  $$L = \sum_{i \in V_c} L_i$$
* **Weights:** $\alpha \ge 0, \beta \ge 0, \gamma \ge 0$ such that $\alpha + \beta + \gamma = 1$.

---

## 5. Constraints

### 5.1 Customer Visit & Assignment Constraints
Each customer must be visited exactly once by exactly one vehicle:
$$\sum_{k \in K} y_{ik} = 1, \quad \forall i \in V_c$$

### 5.2 Flow Conservation
A vehicle entering customer $i$ must depart from customer $i$:
$$\sum_{j \in V, j \ne i} x_{ijk} = y_{ik}, \quad \forall i \in V_c, \; \forall k \in K$$
$$\sum_{j \in V, j \ne i} x_{jik} = y_{ik}, \quad \forall i \in V_c, \; \forall k \in K$$

### 5.3 Depot Operations
Each vehicle departs from the depot at most once and returns to the depot:
$$\sum_{j \in V_c} x_{0jk} \le 1, \quad \forall k \in K$$
$$\sum_{j \in V_c} x_{0jk} = \sum_{i \in V_c} x_{i0k}, \quad \forall k \in K$$

### 5.4 Dual Vehicle Capacity Limits (Weight and Volume)
$$\sum_{i \in V_c} w_i y_{ik} \le C_w, \quad \forall k \in K$$
$$\sum_{i \in V_c} v_i y_{ik} \le C_v, \quad \forall k \in K$$

### 5.5 Subtour Elimination & Temporal Propagation (MTZ Formulation)
If vehicle $k$ drives from customer $i$ to customer $j$ ($x_{ijk} = 1$), arrival time $T_{jk}$ must satisfy:
$$T_{jk} \ge T_{ik} + s_i + t_{ij}^{(s)} - M(1 - x_{ijk}), \quad \forall i \in V_c, \; \forall j \in V_c, \; i \ne j, \; \forall k \in K$$

For the first leg starting from the depot:
$$T_{jk} \ge t_{0j}^{(s)} - M(1 - x_{0jk}), \quad \forall j \in V_c, \; \forall k \in K$$

### 5.6 Time Windows & Soft Lateness
Arrival at pharmacy $i$ cannot occur before $e_i$:
$$T_{ik} \ge e_i y_{ik}, \quad \forall i \in V_c, \; \forall k \in K$$

Arrival at pharmacy $i$ relative to deadline $l_i$:
$$T_{ik} \le l_i + L_i + M(1 - y_{ik}), \quad \forall i \in V_c, \; \forall k \in K$$

### 5.7 Shift Duration Limit
The vehicle must complete all visits and return to the depot before the end of the shift:
$$T_{ik} + s_i + t_{i0}^{(s)} \le T_{\max} + M(1 - x_{i0k}), \quad \forall i \in V_c, \; \forall k \in K$$

---

## 6. Traffic Scenarios & Robustness Evaluation

For any generated delivery plan $X$:
1. **Scenario Degradation Metric ($\Delta P$):**
   $$\Delta P = \frac{P_{\text{pessimistic}} - P_{\text{optimistic}}}{P_{\text{optimistic}}} \times 100\%$$
2. **Route Stability / Arc Jaccard Metric:**
   $$J(A_1, A_2) = \frac{|A_1 \cap A_2|}{|A_1 \cup A_2|}, \quad \text{RouteChange} = 1 - J(A_1, A_2)$$
3. **Cross-Scenario Feasibility Stress Test:**
   Evaluate the solution vector $X_{\text{ML}}^*$ computed under Most-Likely traffic against the travel-time matrix $T_{\text{pessimistic}}$ to measure how delays propagate in real-world operations.
