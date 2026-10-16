#!/bin/bash
#SBATCH --job-name=pl_thermal_package64
#SBATCH --account=tkcastrosim
#SBATCH --qos=tkcastrosim
#SBATCH --partition=chpc
#SBATCH --cpus-per-task=1
#SBATCH --mem=1G
#SBATCH --time=00:10:00
#SBATCH --output=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/runtime/pl-thermal-package-%j.log
set -euo pipefail
TASK_REPAIR=/project/tkcastrosim/HNHuang/project_mcmc/data/web_pl_thermal_repair_20261016
# Submit with --dependency=afterok:<validation/export job>.
test -f "$TASK_REPAIR/display64/validation.json"
tar -cf "$TASK_REPAIR/display64.tar.pending" -C "$TASK_REPAIR" display64
mv "$TASK_REPAIR/display64.tar.pending" "$TASK_REPAIR/display64.tar"
