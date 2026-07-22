# Lightstroke 需求文档

## 1. Overview

一个以 WebGPU SSGI+SSR 为视觉主体的三维光笔体验：用户用单指在白色空间中画出会变粗、变色、反射环境光的金属彩管，再用双指绕着作品旋转和缩放观看。

## 2. Visual Design

视觉基线直接保留 mrdoob 原作的白色物理墙面、深灰背景、TubePainter 彩虹管、RoomEnvironment、ACES 色调映射、SSGI、SSR 与 TRAA，不使用 Canvas 2D 或另一套发光线近似。产品 UI 只保留左上标题、右上清除图标、底部双指相机提示与一次性材质读数；不出现设备外框、玻璃卡或常驻参数面板。目标视口为 320×568、390×844 与 1440×900。

## 3. Game Mechanics

- 原版基线：Three.js 0.185 WebGPURenderer，`maxColorAttachmentBytesPerSample: 40`；SSGI `sliceCount=2`、`stepCount=8`、`aoIntensity=1`；SSR 与 TRAA 按原节点顺序合成。
- 单指按下在 `z=0.25` 的墙平面建立新笔触；移动速度经 `speed * 1000` 映射为 1–15 的管径，并以 0.3 系数缓动。
- 位置在相邻采样点间以 0.7 插值；颜色按 `timeStamp * 0.001 % 1` 沿 HSL 色环变化；每个移动采样调用同一 TubePainter `lineTo()` 与 `update()`。
- 产品模式保留同一绘制合同；两指及以上时停止当前笔触，把事件交给 OrbitControls 做 `DOLLY_ROTATE`，不触发额外粒子或替代场景。
- 每次松手后，当前材质粗糙度在 240ms 内从 0.32 收到 0.02，再在 900ms 回到用户设定值，形成同一 SSGI/SSR 管面的“固化高光”。
- 首次 4.8 秒幽灵手指必须通过同一个绘制函数画出一条真实弧线；若用户先输入则立即停止演示，不保留演示笔触之外的假效果。

## 4. Controls

- Pointer / Touch 单指拖动：绘制彩色金属管；速度越快管径越粗。
- Touch 双指张合与移动：OrbitControls 缩放并旋转作品；底部文字只提示这一隐藏操作。
- Mouse 右键拖动 / 滚轮：旋转与缩放；产品右上清除图标删除全部笔触并回到初始相机。
- `?baseline=1`：保留原 `Mode: Draw/Orbit`、Roughness、Metalness 与 Download GLB 控件和原输入切换方式。

## 5. Win / Lose Conditions

本作没有失败。每完成一笔并看到 1,140ms 的固化高光，再用双指改变观察角度，即完成一轮“绘制—固化—观看”的体验闭环；清除后可立即重画。

## 6. Sound Effects

- 首次真实输入后启用 Web Audio，不申请权限。
- 绘制移动时以 110–330Hz 三角波跟随速度，最大音量 0.018，每 45ms 最多更新一次。
- 松手固化时播放 220Hz 与 440Hz 的 180ms 双音，指数衰减。
- 清除时播放 140Hz、时长 120ms 的低音，不循环背景音乐。
