# 21cmFAST 预计算参数图谱

这是一个纯静态的交互式结果展示站点。拖动参数时，浏览器读取已经完成的
21cmFAST 模拟结果，不会现场启动计算。

## 数据设计

高分辨率站点发布 55 个成功的精确模拟：

- 1 个基准模型；
- 8 个天体物理参数各自进行 5 点单参数扫描，共新增 32 个模型；
- `KP` 与 `MS` 在基准天体物理参数下进行完整的 5 × 5 联合扫描，共新增
  24 个模型。

原设计中的 `NU_X_THRESH = 100 eV` 与
`KP = 1 h Mpc⁻¹, MS = 4` 在 21cmFAST 自旋温度计算中产生 NaN，因而明确
标记为不可用，不使用插值或低分辨率结果替代。

每个已发布模型都包含全局平均 21 cm 亮温历史、对应 lightcone 的二维中心切片，
以及 32 个从 `z ≈ 35` 到 `z = 6` 的 `256 × 256` 横截面。红移控制器同步
显示 `brightness_temp`、密度对比度 `density = ρ/ρ̄ − 1`、电离氢分数
`x_HII = 1 − x_HI`、自旋温度 `Ts_box` 和气体动温 `Tk_box`，并支持自动
播放。UV luminosity function 使用独立的 `z = 6, 7, 8, 10` 四档按钮；
网页展示 `−24 ≤ M_UV ≤ −10` 内的
`log10 φ [cMpc⁻³ mag⁻¹]`。页面不在不同模拟之间插值，也不会在线计算。

固定计算配置：

- `HII_DIM = 256`，`DIM = 768`，`BOX_LEN = 250 cMpc`；
- 红移范围 `z = 35 → 6`；
- `POWER_SPECTRUM = 6`；
- 匹配随机种子 `725213656658`。

五种切片以 int16 科学量化后使用无损 deflate 二进制传输，以控制 GitHub
Pages 体积；空间网格仍为真实的 `256 × 256`。

## 在线展示

GitHub Pages 地址：<https://hainahuang729.github.io/21cmTB/>

页面由 [Pages workflow](.github/workflows/pages.yml) 在每次推送到 `main`
后自动部署。
