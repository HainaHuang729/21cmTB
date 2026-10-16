#!/bin/bash
#SBATCH --job-name=bt256_thermal_reference
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=01:00:00
#SBATCH --output=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/runtime/bt-thermal-reference-%j.log
set -euo pipefail
source /project/tkcastrosim/HNHuang/.config/shell/bash_21cmfast
export OMP_NUM_THREADS=16 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
export LD_LIBRARY_PATH=/project/tkcastrosim/HNHuang/project_mcmc/software/21cmFAST/fftw_gcc/lib:${LD_LIBRARY_PATH:-}
repair_root=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/thermal-repair-bt-20261017
cp "$repair_root/native_reference.py" "$repair_root/reference-${SLURM_JOB_ID}.py"
chmod a-w "$repair_root/reference-${SLURM_JOB_ID}.py"
exec /project/tkcastrosim/HNHuang/envs/Miniconda3/envs/21cmfast/bin/python -u "$repair_root/reference-${SLURM_JOB_ID}.py"
