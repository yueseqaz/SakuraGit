# SakuraGit

**让每一次 Git 变更，都清晰可见。**

[English](README.en.md) · [技术验证记录](QA.md) · [MyGo](https://mygo.egoist.dev/)

SakuraGit 是一个使用 **MyGo + Go + React + TypeScript** 构建的轻量 Git 桌面客户端。它用系统 WebView 渲染界面，通过系统 Git 操作本地仓库，**不捆绑 Chromium**。雾霾蓝主题、可拖动面板和专注 Diff 阅读，让日常提交、代码审阅和分支操作更直观。

> 当前版本：**0.5.2，早期开发阶段**。已在 macOS Apple Silicon 上构建和测试，仍有明确的功能边界；不代表已完成生产环境或跨平台验证。目前界面以中文为主，英文文档不代表已实现英文界面。

![SakuraGit 工作区](docs/screenshots/workspace.png)

## 功能一览

| 模块 | 已支持 |
| --- | --- |
| 仓库 | 打开本地仓库、最近仓库、初始化项目；克隆时选择分支，可选仅跟踪该分支 |
| 工作区 | 已暂存 / 未暂存分区、整文件和整组暂存 / 取消暂存；普通文本修改按代码块暂存 |
| 提交 | 标题和详细说明；仅提交已暂存内容；按仓库保存提交草稿 |
| Diff | 统一 / 并排、语法与行内高亮、自动换行、字号调整、全窗口专注阅读 |
| 历史 | 作者、邮箱、提交详情、变更文件与单文件 Diff；父提交关系图；滚动自动翻页与全历史搜索 |
| 分支 | 创建、切换、重命名、安全删除已合并分支、设置 upstream、检出远程分支、本地分支合并 |
| 同步 | Fetch、仅快进 Pull、非强制 Push、首次推送设置 upstream；执行前显示真实目标与确认 |
| Stash | 保存、查看、恢复和删除；可包含未跟踪文件、恢复暂存状态；恢复后保留原记录 |
| 开发工具 | 冲突文件定位、外部编辑器 / 合并工具、检测残留冲突标记、继续 / 中止 Git 流程 |
| 连接与身份 | 管理远程 Fetch / Push 地址、查看 Git / 认证相关配置、设置仓库级姓名和邮箱 |
| 阅读与布局 | 雾霾蓝 / 石墨灰，浅色 / 深色 / 跟随系统；可拖动面板、比例记忆、会话与草稿恢复 |
| 操作状态 | 克隆与同步进度、耗时、取消、中文错误指引，以及写操作期间的退出保护 |

支持继续 / 中止已由 Git 启动的 Merge、Rebase、Cherry-pick 和 Revert 流程；这不是任意 Git 命令终端，也不是内置三方合并编辑器。Worktree 目前支持查看和打开。

![SakuraGit 提交历史](docs/screenshots/history.png)

## 快速开始

### 环境要求

- **Git**：安装在系统中，桌面应用需要能找到它。
- **Go 1.27.1+**：版本由 `go.mod` 声明；Go 可按配置自动下载所需工具链。
- **Node.js 22.12+** 与 npm。
- 构建目标所需的系统开发工具；macOS 请安装 Xcode Command Line Tools。

| 平台 | 验证状态 |
| --- | --- |
| macOS Apple Silicon / ARM64 | 已构建、签名校验及原生冒烟验证 |
| macOS Intel、Windows、Linux | 尚未实机验证，不承诺现成安装包或完整兼容性 |

### 本地开发

```sh
git clone https://github.com/yueseqaz/SakuraGit.git
cd SakuraGit
npm ci
npm run dev
```

`npm run dev` 启动 MyGo 桌面窗口和 `http://127.0.0.1:5274` 上的 Vite 服务。使用 npm 和 JSON 配置，不需要 Bun。

只预览界面：

```sh
npm run dev:web
```

**浏览器预览使用明确标注的只读示例数据**，不能访问本地仓库，不会假装 Git 操作成功。真实 Git 操作只在 MyGo 桌面窗口中提供。字体和语法高亮随应用打包，不依赖运行时 CDN。

### 构建桌面应用

```sh
npm run build
```

在 macOS ARM64 上输出：

```text
build/darwin-arm64/SakuraGit.app
build/darwin-arm64/SakuraGit 0.5.2 arm64.dmg
```

```sh
open build/darwin-arm64/SakuraGit.app

# 启动并打开指定仓库
build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --repo /absolute/path/to/repository
```

目前本机构建使用 **ad-hoc 签名，未经过 Apple Developer ID 签名或公证**。源码公开不代表已经提供正式发行安装包；请只运行你信任并自行验证的构建。

## 使用提示

- **调整面板**：拖动区块之间的分隔线；双击恢复该处默认比例。聚焦分隔线后用方向键微调，Shift 加大步长，Esc 取消当前拖动。比例保存在本机；窄窗口改为堆叠布局。
- **阅读历史**：每批 100 条，接近底部自动加载，超过 300 条时使用虚拟列表。搜索说明、作者、邮箱或提交 ID 会搜索整个本地可达历史，不限首屏。
- **外观设置**：左下角「设置与外观」，或 `Cmd/Ctrl + ,`。Diff 支持 11–16 px 字号与 Esc 退出专注阅读。
- **同步与认证**：复用系统 Git 的 SSH、凭据助手和签名配置；如需交互式认证，请先在终端完成。软件不保存账号密码，也不接受 URL 内嵌凭据。
- **本地状态**：按仓库保存草稿、恢复上次页面和文件选择。为兼容旧名 Gitlane，保留原应用标识、`Gitlane` 用户数据目录和 `gitlane.*` 本机缓存键；不是把个人配置写入源码仓库。

## 安全边界与已知限制

- 不提供强推、硬重置、丢弃修改或任意命令执行。分支切换和 Stash 恢复要求工作区干净；Pull 只允许快进，不会自动 Stash、Merge 或 Rebase。
- 取消不等于回滚：提交、上传或部分文件操作可能已经发生。取消或失败后请刷新确认实际状态；克隆目录保留供检查，不自动删除。
- Git hooks、签名和外部合并工具沿用本机配置，可能执行本地程序。**只打开可信仓库**；应用内的版本校验不能阻止其他 Git 客户端并发写入。
- 分块暂存仅支持普通已跟踪文本修改；新增、删除、重命名、二进制、符号链接、模式变化和子模块等使用整文件操作。暂不支持逐行暂存。
- Diff 不调用外部 Diff / textconv；界面最多显示 3,000 行，并明确提示超限。高亮基于补丁上下文尽力解析，大型或未知语言内容会降级为纯文本。
- 历史仅包含本地可达提交，不会自动 Fetch。浅克隆的历史深度仍受仓库限制。普通 Git 命令通常限时 90 秒，克隆为 30 分钟。
- 暂无内置三方编辑、交互式 Rebase、标签管理、创建 / 删除 Worktree，以及子模块 / LFS 完整管理。现有子模块 / LFS 检测只是提示。
- 大型真实生产仓库、在线 GitHub / GitLab 认证、完整进程崩溃恢复和跨平台运行仍需进一步验证。会话缓存不是文件备份。

## 测试

```sh
npm test          # Go race 检测 + 前端测试
npm run build:web
go vet ./...
```

当前有 **78 项前端测试**，以及覆盖 Git 状态、提交、同步、分页、冲突流程、取消、会话和路径保护的 Go 集成测试。测试使用自建临时仓库与本地裸远程，不访问你的私有仓库。

原生测试会创建并修改独立测试仓库，启动打包后的桌面应用：

```sh
scripts/native-smoke.sh

# 无法保证窗口始终可见的自动化环境：显式跳过自动轮询及后续推送确认
scripts/native-smoke.sh build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --skip-auto-refresh
```

该脚本验证 426 条历史的自动滚动加载、最早提交详情、全历史搜索、打包后的高亮 Worker、桌面刷新保护，以及纯本地克隆等。日志与临时仓库路径记录在 `build/`，测试仓库保留供检查。跳过的项目不计为通过。详细覆盖范围和未验证事项见 [QA.md](QA.md)。

## 项目结构

```text
main.go / *_api.go         MyGo 窗口、原生 API 与类型化 IPC
internal/gitrepo/          Git 命令、状态解析、操作保护与集成测试
operations.go             操作进度、取消、串行化与退出保护
session.go                会话与草稿的原子持久化
src/App.tsx               工作区、导航与交互
src/DiffPanel.tsx          Diff 阅读器
src/HistoryPanel.tsx      自动分页历史与虚拟列表
src/ResizableSplit.tsx    可保存的面板分隔布局
src/WorkflowPanel.tsx     冲突、分支和外部开发工具
src/mygo.ts               自动生成的 TypeScript IPC 客户端
src/demo.ts               只读浏览器示例数据
scripts/native-smoke.sh   独立本地仓库的原生冒烟测试
```

## 反馈与许可

欢迎通过 [Issues](https://github.com/yueseqaz/SakuraGit/issues) 提交问题。请说明系统、版本、复现步骤和已脱敏的错误信息，**不要上传 Token、私钥或私有仓库内容**。

本项目暂未指定开源许可证；公开可见不等于已授予任意使用、修改或再分发许可。依赖与字体的许可分别归其各自作者所有。
