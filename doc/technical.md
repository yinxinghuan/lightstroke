# Lightstroke 技术文档

## 1. 技术栈

- Vite 6.4，`base: './'`，构建产物位于 `dist/`。
- 原生 JavaScript ES Module、Three.js 0.185、WebGPURenderer 与 TSL。
- 原作渲染链为 MRT scene pass → SSGI → SSR → TRAA；几何使用 Three.js `TubePainter`，环境使用 `RoomEnvironment`。
- 没有 Canvas/WebGL 近似后备：WebGPU 初始化失败进入明确 Error 状态。

## 2. 目录结构

- `src/main.js`：原版 WebGPU 场景、MRT/SSGI/SSR/TRAA 节点链、TubePainter、基线 UI、产品手势、真实幽灵演示、材质固化、音频与 QA 状态。
- `src/style.css`：原版左下参数 UI，以及产品标题、双指提示、Material `touch_app`、Loading 与 Error。
- `index.html`：原版参数 DOM、产品 UI、异常收集与 Vite 入口。
- `upstream/ATTRIBUTION.md`：CodePen 来源、MIT 许可、r185 接口漂移与最小兼容补丁。
- `doc/`：需求、视觉与技术文档。

## 3. 核心模块

- 原版基线：`?baseline=1` 显示 Draw/Orbit、Roughness、Metalness 和 Download GLB，并保留 `(0,0,5)` 相机、白墙、速度管径、HSL 时间颜色和导出逻辑。
- r185 兼容：原 Pen 的旧六参数 `ssr()` 在当前 r185 会让 `camera=null`；本实现把相同 metalness、roughness、camera 放进新版 options 对象，并采用重命名后的 `RenderPipeline`、`packNormalToRGB`、`unpackRGBToNormal`。节点输入、数值与合成顺序不变。
- 输入分流：产品模式 OrbitControls 始终启用，但单指 touch 与鼠标左键动作设为空；单指由 TubePainter 绘制，两指交给 `DOLLY_ROTATE`，右键和滚轮继续服务相机。
- 绘制：`beginStroke()`、`continueStroke()`、`finishStroke()` 同时服务用户和幽灵手指；每点射线命中 `z=0.25` 平面，速度映射 1–15 管径，位置 0.7 插值。
- 引导：900ms 内按固定 72 个样本写真实 TubePainter。即使 WebGPU 首帧很慢，也会补齐漏掉的采样，不让教程只剩手指。之后两枚 Material 手指与同一相机共同旋转 0.32 弧度。
- 固化：松手后材质粗糙度 240ms 从 0.32 收到 0.02，再用 900ms 回到用户值；不添加第二层 glow 或粒子。
- 清除：销毁旧 TubePainter 的 geometry/material 并用原构造器重建；不能只把 drawRange 设为 0，因为内部 end-cap/update range 会污染下一笔 WebGPU buffer 更新。
- 音频：真实绘制启用 110–330Hz 三角波，松手叠 220/440Hz，清除播放 140Hz；幽灵演示不自动出声。
- 多语言：根据 `game_locale` 或浏览器语言选择 zh/en；产品文字来自 `copy`。
- QA：`window.__LIGHTSTROKE__` 暴露 drawCount、roughness、cure、pointerCount 与相机坐标；`?forceError=1` 提供确定性错误态。

## 4. 扩展点

- 改画笔速度/管径：修改 `continueStroke()` 的 `speed * 1000`、1–15 与 0.3 缓动；基线参数应保持不变。
- 改 SSGI/SSR：修改 `init()` 的节点链；先在 `?baseline=1` 与原 Pen 同轨迹对照，不能换成 bloom 近似。
- 改双指相机：调整 OrbitControls 的 `touches.TWO`，继续保证 `touches.ONE=-1` 与单指画笔分流。
- 改教程曲线：修改 `runGhostDemo()` 的 72 个确定性样本；必须继续调用真实 stroke 函数。
- 改产品 UI：修改 `index.html` 和 `src/style.css`；不增加设备框、常驻参数卡或单指文字教程。
- 平台永久 UUID：`028ddc63-b825-4039-abe6-e30be246e28c`。它已同步写入 `index.html`，后续版本不可更换。
