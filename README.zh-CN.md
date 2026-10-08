<div align="center">
<img src="docs/assets/hero.svg" width="100%" alt="Medi-care — 罕见病照护里可解释的趋势提醒" />
</div>

<div align="center">
<pre>~/medi-care (main*)  19 tests  port 7100</pre>
</div>

<div align="center">

[![English](https://img.shields.io/badge/lang-EN-8b949e)](README.md)
[![中文](https://img.shields.io/badge/lang-ZH-0A2F2F)](README.zh-CN.md)

</div>

<div align="center">

[![最新版本](https://img.shields.io/github/v/release/jqu224/medi-care?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC&color=0A2F2F)](https://github.com/jqu224/medi-care/releases/latest)
[![下载量](https://img.shields.io/github/downloads/jqu224/medi-care/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F&color=0A2F2F)](https://github.com/jqu224/medi-care/releases)
![平台](https://img.shields.io/badge/Web%20%C2%B7%20%E7%A7%BB%E5%8A%A8%E4%BC%98%E5%85%88-%E6%9C%AC%E5%9C%B0%E8%BF%90%E8%A1%8C-0A2F2F)
[![MIT](https://img.shields.io/badge/license-MIT-0A2F2F)](LICENSE)
[![Stars](https://img.shields.io/github/stars/jqu224/medi-care?style=social)](https://github.com/jqu224/medi-care/stargazers)

</div>

## medi-care

给罕见病照护用的每日记录和可解释趋势提醒。

— 患者、家属、医生共用同一套本地演示数据。

[![react](https://img.shields.io/badge/react-19-0A2F2F)](app/package.json)
[![vite](https://img.shields.io/badge/vite-7-0A2F2F)](app/package.json)
[![tests](https://img.shields.io/badge/tests-19-0A2F2F)](app/tests/model.test.ts)
[![runtime](https://img.shields.io/badge/data-localStorage-0A2F2F)](app/README.md)

这是一个移动端优先的 Web 应用：记录症状、体温和用药，并在数值越过观察线时写明原因。

**开始之前**

1. 读这一页，看这个应用给谁用。
2. 进入 `app/`，安装依赖，在端口 `7100` 启动 Vite。
3. `npm test` 跑模型检查。运行中的应用把演示记录留在当前浏览器的 `localStorage`。

---

## 定位

| | |
| --- | --- |
| **谁** | 自己记一天的患者、在演示患者之间切换的家属、阅读同一份记录的医生 |
| **做什么** | 几次点击记完当天，看见趋势，并在数值持续越过一条线时读到原因 |
| **边界** | 辅助观察工具。不下诊断。演示患者是虚构的 |

## 流水线

```text
observation → shared metrics → watch rules → alert with a reason
patient / family write          clinician reads
```

| 步骤 | 做什么 | 闸门 |
| --- | --- | --- |
| 1. 记录 | 为当前登录患者追加体温、症状、用药和事件 | 患者的写入不能落到另一名患者身上 |
| 2. 指标 | 日、周、月视图共用同一条序列 | 空的时间段保持为空 |
| 3. 观察 | 按当前病种规则计算，包括 sJIA / MAS 趋势 | 非临床预设和暂停的监测不继承 MAS 警报 |
| 4. 解释 | 展示数值、越过的线、持续多久、建议的下一步 | 医生身份只读 |

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `app/` | React 19 + TypeScript + Vite 工作区 |
| `app/tests/model.test.ts` | 14 条模型测试 |
| `mvp/` | 更早的静态稿 |
| `docs/assets/hero.svg` | README 头图 |

## 契约

| 规则 | 含义 |
| --- | --- |
| 虚构演示 | 种子患者和密码只为本地演示存在 |
| 不下诊断 | 界面请读者去就医，不写出诊断名称 |
| 一台浏览器 | 记录留在本机 `localStorage` |
| 医生 | 可以切换患者，不能写入 |

## 用法

```bash
cd app
npm install
npm run dev
npm test
npm run build
npm run lint
```

| 命令 | 结果 |
| --- | --- |
| `npm run dev` | 开发服务器 http://127.0.0.1:7100 |
| `npm test` | 打包 `tests/model.test.ts`，用 Node 测试运行器执行 |
| `npm run build` | 类型检查并构建到 `app/dist/` |
| 第一次打开 | 选择患者、家属或医生。屏幕会显示该身份的演示密码 |

## 许可证

[MIT](LICENSE)
