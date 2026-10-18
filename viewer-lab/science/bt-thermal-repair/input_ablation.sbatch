#!/bin/bash
#SBATCH --account=tkcastrosim
#SBATCH --qos=tkcastrosim
#SBATCH --partition=chpc
#SBATCH --job-name=bt_input_ablation
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=00:45:00
#SBATCH --output=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/runtime/bt-input-ablation-%j.log
set -euo pipefail
source /project/tkcastrosim/HNHuang/.config/shell/bash_21cmfast
export OMP_NUM_THREADS=16 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
export LD_LIBRARY_PATH=/project/tkcastrosim/HNHuang/project_mcmc/software/21cmFAST/fftw_gcc/lib:${LD_LIBRARY_PATH:-}
script_root=/project/tkcastrosim/HNHuang/project_mcmc/web_21cm_viewer/thermal-repair-bt-20261017
cp "$script_root/input_ablation.py" "$script_root/ablation-${SLURM_JOB_ID}.py"
chmod a-w "$script_root/ablation-${SLURM_JOB_ID}.py"
exec /project/tkcastrosim/HNHuang/envs/Miniconda3/envs/21cmfast/bin/python -u "$script_root/ablation-${SLURM_JOB_ID}.py"
