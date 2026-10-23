# Vishing Study 2 analysis

The preregistered analysis, written before any data exist and checked on simulated exports in the platform's exact
format.

| File | What it does |
|---|---|
| `analyze_study2.R` | The preregistered tests (H1 to H4 and S1 to S5) on the lab's trials export (`admin/export.csv`). Writes `<prefix>_results.csv`. |
| `simulate_export.R` | A simulated export in the real 133 columns (`export-columns.csv`), with known effects planted, or none (`null`). |
| `summarize_validation.R` | Recovery of the planted effects and the false-positive rate across many simulated runs. |
| `export-columns.csv` | The export header the simulator copies; refresh it from a real export if the platform adds columns. |

```bash
Rscript simulate_export.R sim.csv 150 11            # planted effects, 150 per arm, seed 11
Rscript simulate_export.R null.csv 150 11 null      # no effects
Rscript analyze_study2.R sim.csv sim                # writes sim_results.csv
Rscript summarize_validation.R <folder of *_results.csv>
```

Needs R with glmmTMB and emmeans (glmmTMB needs nloptr, which needs NLopt: `brew install nlopt pkg-config`).

Estimands are population-averaged risk differences: emmeans' bias adjustment integrates over each model's random
intercepts, so a contrast is the difference in rates across participants, not for a participant at the mean.
