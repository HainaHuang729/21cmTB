# 21cmFAST 预计算参数图谱

这是一个纯静态的交互式结果展示站点。拖动参数时，浏览器读取已经完成的
21cmFAST 模拟结果，不会现场启动计算。

## 数据设计

站点包含 57 个精确模拟：

- 1 个基准模型；
- 8 个天体物理参数各自进行 5 点单参数扫描，共新增 32 个模型；
- `KP` 与 `MS` 在基准天体物理参数下进行完整的 5 × 5 联合扫描，共新增
  24 个模型。

每个模型都包含全局平均 21 cm 亮温历史，以及对应 lightcone 的二维中心
切片。页面不在不同模拟之间插值。

固定计算配置：

- `HII_DIM = 64`，`DIM = 256`，`BOX_LEN = 250 cMpc`；
- 红移范围 `z = 35 → 6`；
- `POWER_SPECTRUM = 6`；
- 匹配随机种子 `725213656658`。

## 在线展示

GitHub Pages 地址：<https://hainahuang729.github.io/21cmTB/>

页面由 [Pages workflow](.github/workflows/pages.yml) 在每次推送到 `main`
后自动部署。
