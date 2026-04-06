# Open Orpheus

[English Version](./README_en.md)

一个对网易云音乐 Orpheus 浏览器宿主的开源实现。

项目当前的开发计划请追踪：https://github.com/users/YUCLing/projects/2

## 功能

- 跨平台支持
- 开源

不然你还想要啥！它本质上就是给原版客户端提供一个运行环境！

## 安装

### Fedora Linux

可通过 Copr 仓库进行安装

```sh
dnf copr enable luorain/open-orpheus # 启用 Copr 仓库
dnf install open-orpheus # 安装
```

### Arch Linux（第三方AUR）

感谢 @zlicdt 发布

https://aur.archlinux.org/packages/open-orpheus

### Debian Linux、Windows、macOS

前往 [Releases](https://github.com/YUCLing/open-orpheus/releases/latest) 下载

## 开发

如果你要参与开发，需要先准备好 Node 和 Rust（推荐 Node v24、Rust 1.92）。

根项目这边的工作流和普通的 Electron Forge 项目差不多，不过 Open Orpheus 自己有一些原生模块，所以还得多做几步配置。

下面的步骤默认使用 `pnpm` 作为 Node 的包管理器。

### 环境准备

#### 安装依赖

在根目录执行一次即可，pnpm workspace 会自动为所有包（包括原生模块）安装依赖：

```sh
pnpm install
```

#### 构建模块

`modules` 文件夹里有几个 Open Orpheus 运行所需的原生模块。

在根目录执行：

```sh
pnpm build:modules # 构建所有模块（会同时构建 Rust 和 Node 代码）
```

### 资源文件

这个项目不会打包某些必需资源，因为它们归网易所有。

Open Orpheus 在首次启动时如果检测到资源缺失，会自动从网易的 CDN **自动下载**，通常无需手动配置。

资源存放在数据目录的 `package` 子文件夹中：

- 开发模式：`data/package/`（相对于工作目录）
- 打包后：`{userData}/package/`

#### `package` 文件夹

整个 `package` 文件夹都是必需的。

如果自动下载失败，可以从官方网易云音乐的安装目录手动复制整个 `package` 文件夹，例如 `C:\path\to\your\installation\CloudMusic\package`，并将其放入上述数据目录中。

#### `web.pack` 文件（可选）

官方网易云音乐客户端生成的最新 Web 资源包，一般位于 `C:\Users\<YOUR_USERNAME>\AppData\Local\NetEase\CloudMusic\web.pack`。将它复制到 `package` 文件夹中（与 `orpheus.ntpk` 放在一起）。如果存在，Open Orpheus 会优先使用它而不是 `orpheus.ntpk`。

## 免责声明

Open Orpheus 是一个以**互操作性**为目的的独立开源项目，与网易公司没有任何关联、授权或认可关系。

- **本项目不包含、不分发任何归网易所有的资产或代码。** 运行所需的资源文件（如 `orpheus.ntpk`）归网易公司所有，用户须自行从合法取得的官方客户端中获取，或由程序在首次启动时从网易官方 CDN 自动下载。
- **本项目不提供、不鼓励、不支持任何用于绕过广告、付费内容、会员权益或数字版权保护机制（DRM）的功能或修改。** 任何此类用途均明确超出本项目的范围，且会被主动抵制。
- 使用本项目时，您仍需遵守网易云音乐的[网易云音乐服务条款](https://st.music.163.com/official-terms/service)及相关法律法规。
- 本项目按"现状"提供，不对因使用本项目所产生的任何后果（包括但不限于账号封禁、服务中断或法律责任）承担责任。

> "网易云音乐"、"Orpheus" 等名称及相关商标归网易公司所有。
