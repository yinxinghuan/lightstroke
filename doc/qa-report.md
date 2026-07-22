# Lightstroke 视觉 QA

日期：2026-07-23

## 当前结果

- 390×844：900ms 幽灵手指通过真实 TubePainter 形成完整粗细彩管，标题、状态、44px 清除按钮与底部隐藏手势提示不遮挡主体。
- 320×568：标题、状态、清除按钮互不碰撞；真实演示曲线完整，底部提示保持 44px。
- 用户拖动：同一输入函数生成带圆头、速度粗细、HSL 渐变和墙面高光的管体；松手后进入固化。
- 真实用户笔触：自动化得到 `drawCount=2880`，松手后 `roughness=0.018`、`cureActive=true`。
- 双指演示：两枚 Material 手指出现时，相机真实绕 Y 轴旋转 0.32 弧度，而不是只动图标。
- 真实双指事件：CDP 同时注入两个 touch point 后，原 TubePainter 保持 `drawCount=2880`，相机由 `[0,0,5]` 变为 `[-0.018,0.018,2.538]`，证明双指进入 OrbitControls 而不是继续画线。
- 清除：旧 TubePainter 完整销毁并按原参数重建，相机回到 `(0,0,5)`；清除后立即重画不再产生非法 WebGPU buffer range。
- 基线：`?baseline=1` 显示原四组控件，同轨迹生成原 TubePainter 管体。
- 接口漂移：修复旧 `ssr()` 位置参数后，原 `camera=null / isNode` 错误消失；不再打印旧别名警告。
- 错误态：`?forceError=1` 显示 WebGPU 说明，不渲染假画面。
- 自动化页面错误与 console error 为 0；结构化状态位于 `_qa/ui/playwright-state.json`。

WebGPU 实机画面证据使用应用内 Chromium 保存为 `_qa/ui/iab-*.png`；无头 SwiftShader 用于状态与真实双指验证，它的 WebGPU screenshot 在清除后的页上可能是黑帧，因此不作为视觉结论。
