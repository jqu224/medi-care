---
name: 暖哨 · sJIA 家庭预警 MVP（单文件原型）
description: 暖纸白底 + 深青绿主色 + EB Garamond 仪表数字的单文件 mobile web 原型（与 app/ React 版并行的赛马方案）
colors:
  paper: "#F6F2EA"
  card: "#FFFDF9"
  paper-2: "#EFE9DE"
  ink: "#1B1F1D"
  ink-2: "#4A524E"
  ink-3: "#5F6A63"
  line: "#E3DCCF"
  green: "#0E6B55"
  green-deep: "#0A4D3E"
  green-soft: "#DCEBE3"
  amber: "#D9A24A"
  amber-text: "#3A2404"
  red: "#B3261E"
  red-text: "#7A1710"
  delta-warn: "#8A5A10"
  shadow-knob: "rgba(0,0,0,.2)"
  desktop-backdrop: "#1E2922"
typography:
  ui-sans:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  hero-metric:
    fontFamily: "EB Garamond, Songti SC, Georgia, serif"
    fontSize: "72px"
    fontFeature: "lnum tnum"
  stepper-metric:
    fontSize: "60px"
  stepper-button:
    fontSize: "26px"
  metric-card:
    fontSize: "34px"
  page-title:
    fontSize: "28px"
  alert-title:
    fontSize: "17px"
  row-metric:
    fontSize: "24px"
  greeting-title:
    fontSize: "24px"
  section-title:
    fontSize: "15px"
  body:
    fontSize: "14px"
  sheet-title:
    fontSize: "20px"
  button-label:
    fontSize: "16px"
  avatar:
    fontSize: "18px"
  aux:
    fontSize: "13px"
  caption:
    fontSize: "12px"
  micro:
    fontSize: "11px"
rounded:
  hero: "28px"
  card: "18px"
  tab: "14px"
  icon-tile: "12px"
  focus-ring: "10px"
  chart-bar: "7px"
  slider-track: "3px"
  sheet-handle: "2px"
  pill: "999px"
  phone-shell: "44px"
spacing:
  page-x: "20px"
  card-pad: "16px"
  stack: "12px"
---

## Overview

与 app/（React 版）并行的赛马方案：单文件、零构建、双击即开。设计世界观同根（暖纸白 + 青绿 + 红色配给制），但执行更偏「纸面仪表」：数字用 EB Garamond 衬线（lnum/tnum），卡片圆角更大（28px hero），桌面演示用深松绿衬底衬托手机壳。

## Colors

- 底：暖纸白 `#F6F2EA`（有意为之，致敬肌愈通纸面感）；桌面端外围衬底为深松绿 `#1E2922`（可感知的绿，不近黑），壳内才是纸白。
- 主色唯一：深青绿 `#0E6B55`，深档 `#0A4D3E`，浅底 `#DCEBE3`。
- 风险色：琥珀 `#D9A24A`（文字压深 `#3A2404`）、红 `#B3261E`（文字压深 `#7A1710`）。红色配给制：只用于预警/行动元素与越线标记。
- 辅助墨色三级：`#1B1F1D` / `#4A524E` / `#5F6A63`，全部 ≥4.5:1 对比度（对纸白底）。

## Typography

- 数字展示字：EB Garamond（`lnum`+`tnum`），用于 hero 72px、记录步进 60px、指标卡 34px、行内 24px；中文与界面文字用 Noto Sans SC/系统栈。
- 正文 14px，辅助 13px，微标签 11-12px；层级靠字重+墨色分级。

## Layout / Shapes

- 390×844 移动优先；桌面=居中 430px 手机壳（44px 圆角+投影），壳外深松绿衬底。
- 半径体系：hero/sheet 28px、卡片 18px、图标砖 12px、柱条 7px、滑杆 3px、把手 2px、按钮一律 pill。

## Do's and Don'ts

- 同根红线：无 emoji（手写 stroke 1.8 SVG 图标系统）、页面可见文案无 em-dash、红色配给制、非诊断话术、免责声明常驻。
- 曲线一律 Catmull-Rom 平滑；事件标记用色环点+图例，不用图标堆叠。
- 动效克制：页面切换 rise、曲线 draw-in 一次、保存后数字 count-up；`prefers-reduced-motion` 全灭。
