#!/bin/bash
#SBATCH --job-name=density128_export
#SBATCH --cpus-per-task=2
#SBATCH --mem=8G
#SBATCH --time=00:30:00
#SBATCH --output=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/runtime/density128-%j.log
set -euo pipefail
source /project/tkcastrosim/HNHuang/.config/shell/bash_21cmfast
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
script_root=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/density128-20261017
cp "$script_root/export_density128.py" "$script_root/export-${SLURM_JOB_ID}.py"
chmod a-w "$script_root/export-${SLURM_JOB_ID}.py"
exec /project/tkcastrosim/HNHuang/envs/Miniconda3/envs/21cmfast/bin/python -u "$script_root/export-${SLURM_JOB_ID}.py" --model "$1"
