# 21cmFAST 预计算参数图谱

这是一个只展示已完成模拟的静态交互页面。页面不会现场调用 21cmFAST。
拖动参数时，它即时读取对应的全局 21 cm 亮温曲线和二维 lightcone 中心
切片。页面还提供一个同步红移控制器，用来查看同一红移下的二维
`brightness_temp`、`density`、电离氢分数 `x_HII`、自旋温度 `Ts_box`
和气体动温 `Tk_box` 场。
UV luminosity function（LF）使用独立的四档红移选择：`z = 6, 7, 8, 10`。
全局亮温、五种二维场和 LF 同时显示一个与当前模型具有相同天体物理参数、
分辨率、宇宙学和随机种子的标准 PL 参考。底部第一行显示当前 BPL 模型的
五个正方形字段切片，第二行显示同参数 PL 的五个对应切片；非亮温场在两种
模型之间使用共同色标。
参考模型使用
`POWER_SPECTRUM=0, POWER_INDEX=0.968`，不再使用“上一选择”曲线。

网页采用紧凑的学术数据 Dashboard：顶部横排 10 个参数；其下是全宽
brightness-temperature lightcone；中部以大型 UV LF 为主图，右侧依次为
全局亮温和再电离历史两个统计辅助图；底部为两行一一对应的五个等宽正方形
BPL / matched-PL 切片。

## 预计算设计

完整参数空间的 `5^10` 网格不可行，因此设计了 57 个可解释的精确模拟；
高分辨率版本发布其中 55 个成功模型：

- 1 个基准模型；
- 8 个天体物理参数分别做 5 点单参数扫描，共新增 `8 x 4 = 32` 个模型；
- `KP` 和 `MS` 在基准天体物理参数下做完整 `5 x 5` 网格，共新增 24 个模型。

两个设计点因 21cmFAST 自旋温度计算产生 NaN 而不发布：

- `NU_X_THRESH = 100 eV`；
- `KP = 1 h Mpc⁻¹, MS = 4`。

页面会把这两个参数组合明确显示为不可用，不使用插值或低分辨率结果替代。

页面严格按照这个设计工作。移动一个天体物理参数时，其他九个参数回到
基准值；`KP` 与 `MS` 可以联合移动。每一帧都对应一个真实 21cmFAST
lightcone，不进行跨模型场插值。

每个 BPL 模型及其去重后的匹配 PL 参考另外保存 32 个从 `z ≈ 35` 到
`z = 6` 的真实 lightcone 横截面，
每个横截面为 `256 × 256`：

- `brightness_temp`，单位 mK；
- `density`，定义为密度对比度 `δ = ρ/ρ̄ − 1`；
- `x_HII = 1 - x_HI`，其中原始 `xH_box` 给出中性氢分数；
- `Ts_box`，21 cm 自旋温度，单位 K；
- `Tk_box`，IGM 气体动温，单位 K；
- UV LF，在精确的 `z = 6, 7, 8, 10` 各保存 100 个原始 magnitude bins，
  网页展示 `−24 ≤ M_UV ≤ −10` 范围内的
  `log10 φ [cMpc⁻³ mag⁻¹]`。

页面的红移滑块只切换这些已完成切片，也可以用“播放”按钮依次显示宇宙
演化。LF 使用自己的四档离散红移按钮，不随切片滑块变化；二者都不进行
在线计算。

再电离历史使用上述 32 个切片中体素中性氢分数的空间平均值定义
`x_i(z) = 1 - <x_HI(z)>`，同时展示 BPL 与同参数标准 PL 曲线。电子散射
光学深度 `tau_e` 在静态站点构建阶段由这组预计算历史积分得到，积分约定与
21cmFAST `ComputeTau` 一致：最低输入红移以下取完全电离、最高输入红移
以上取未电离，并在 `z < 3` 加入氦二次电离修正。因此增加该图不触发网页端
计算，也不需要额外运行 21cmFAST。

切片颜色遵循 `py21cmfast.plotting`：`brightness_temp` 使用官方 `EoR`
色表和固定的 `−150 ... +30 mK` 归一化，其他场使用 `viridis`。`Ts_box`
与 `Tk_box` 跨越多个数量级，因此在 Kelvin 值上使用对数归一化；网页中的
动态色标端点会显示当前切片实际使用的数值范围。

LF 图叠加 44 个原始论文表格值及误差棒：HST 采用 Bouwens et al. (2021)
的 `z=6,7,8` SWML 表及 Oesch et al. (2018) `z≈10` 数据（同时在前者的
汇总表中逐值复核）；JWST
采用 Bouwens et al. (2023) 的 `z≈8-9,10-11` NIRCam 数据，以及 Donnan
et al. (2024) 的精确 `z=10` 数据。宽红移箱在页面中保留论文原始标签，
上限使用倒三角显示。机器可读的经核对数值和来源位于
`data/lf_observations.json`。

固定配置：

- `HII_DIM=256`, `DIM=768`, `BOX_LEN=250 cMpc`；
- `z=35 -> 6`, `Z_HEAT_MAX=35`；
- `POWER_SPECTRUM=6`；
- 对比参考为 `POWER_SPECTRUM=0` 的标准单幂律 PL；
- 所有模型使用相同随机种子 `725213656658`；
- `KP` 在页面中使用 `h Mpc^-1`，传给 21cmFAST 前乘以 `h=0.678`。

## 生成和运行

在仓库根目录生成冻结设计：

```bash
PYTHON=/project/tkcastrosim/HNHuang/envs/Miniconda3/envs/21cmfast/bin/python
cd workflows/visualization/interactive_21cmfast
"${PYTHON}" make_design.py
```

先运行基准模型 smoke test：

```bash
sbatch --array=0-0 run_grid.sbatch
```

验证基准结果后运行余下 56 个模型：

```bash
sbatch --array=1-56%8 run_grid.sbatch
```

成功发布的 55 个 BPL 结果只包含 32 组不同的天体物理参数。生成去重后的
匹配 PL 设计，先验证基准，再运行其余参考：

```bash
"${PYTHON}" make_pl_design.py
baseline_job=$(sbatch --parsable --array=0 run_pl_reference.sbatch)
sbatch --dependency="afterok:${baseline_job}" --array=1-31%4 run_pl_reference.sbatch
```

所有任务成功后构建静态站点：

```bash
"${PYTHON}" build_site.py \
  --design data_hii256/design.json \
  --raw-root data_hii256/raw \
  --pl-design data_hii256/pl_design.json \
  --pl-raw-root data_hii256/pl_raw \
  --exclude-run-id run_4600848a9a8c \
  --exclude-run-id run_5f2309678207
```

原始结果位于 `data/raw/`。站点位于 `site/`，其中 lightcone 温度以
0.1 mK 精度量化，只用于网页传输；density 使用每个模型独立的 int16
量化步长，`x_HII` 使用 `1/32767` 精度，两个温度场以量化的
`log10(K)` 传输。原始 NPZ 保留未量化的
`float32` 二维红移切片、lightcone
中心切片、`float64` 全局历史和完整 LF 表。

LF 可以在 lightcone 完成后独立补算：

```bash
sbatch --export=ALL,LF_FORCE=1 --array=0-28,30-35,37-56%8 run_lf.sbatch
```

## 展示结果

提交只读网页服务：

```bash
sbatch serve_site.sbatch
```

查询节点后，在自己的电脑上做端口转发：

```bash
ssh -N -L 8765:COMPUTE_NODE:8765 USER@LOGIN_HOST
```

然后打开 <http://127.0.0.1:8765>。这个服务只读取 `site/` 内的完成结果，
不包含运行模拟的 API。

## 快速验证

```bash
PYTHON=/project/tkcastrosim/HNHuang/envs/Miniconda3/envs/21cmfast/bin/python
"${PYTHON}" -m unittest discover -s tests -v
"${PYTHON}" -m py_compile app_config.py make_design.py make_pl_design.py run_grid.py run_pl_reference.py build_site.py
bash -n run_grid.sbatch
bash -n run_pl_reference.sbatch
bash -n serve_site.sbatch
```
