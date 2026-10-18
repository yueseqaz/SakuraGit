# Gitlane

一个用 **MyGo 0.5.5 + Go + React 19 + TypeScript + Vite** 构建的轻量 Git 桌面客户端。系统 WebView 渲染界面，Go 通过参数化的系统 Git 命令执行操作，不捆绑 Chromium。

## 当前功能

- 雾霾蓝 / 石墨灰主题；浅色 / 深色 / 跟随系统；Diff 字号 11–16 px，设置自动保存在本机。
- 左下角「设置与外观」或 `Cmd/Ctrl + ,` 打开设置；复用 MyGo 原生菜单、主题、文件夹对话框、剪贴板和窗口状态保存。

- 原生文件夹选择、路径打开、最近仓库记录。
- 克隆远程或本机仓库；在新目录创建仓库，或为已有非 Git 项目初始化 `main` 分支，不覆盖现有仓库。
- 文件状态、未暂存 / 已暂存分区、统一 Diff、二进制与大型文件提示。
- 紧凑的代码审阅布局，统一 / 并排 Diff、自动换行、工具栏字号调整和全窗口专注阅读（Esc 退出）。补丁头默认收起，可随时展开；阅读方式保存在本机，不修改文件内容。
- 按文件或整个分区暂存 / 取消暂存，支持首次提交与部分暂存状态展示。
- 普通已跟踪文本修改支持按代码块暂存 / 取消暂存；操作前检查差异版本，拒绝过期代码块，不改动工作区文件。
- 提交标题与详细说明；仅提交暂存区内容。
- 最近 100 条提交的拓扑历史与基于父提交关系的分支连线；搜索提交、作者、邮箱和 ID（范围为已加载的最近 100 条）。
- 历史中直接显示作者标识和姓名；提交详情区分原作者与提交者，支持完整说明与提交 ID 复制。
- 提交变更文件清单、增删行统计、单文件 Diff；支持首次提交、重命名和二进制文件，合并提交明确对比第一父提交。
- 创建 / 切换本地分支，查看本地与远程分支。
- 手动 Fetch、仅快进 Pull、限定当前分支的非强制 Push，执行前确认。
- 同步确认直接显示真实的本地分支、远程名称和目标分支；待推送 / 待拉取数量注明基于最近一次获取的状态。实际命令折叠展示，不使用上游占位模板。确认期间分支或上游目标变化时拒绝同步，需刷新后重新确认。
- 尚无上游的新分支支持选择已配置远程与目标分支名，首次推送成功后自动建立 upstream。
- 查看和打开已有 Worktree。
- 「工作现场」保存、查看、恢复和删除 Stash，可包含未跟踪文件，可恢复原暂存状态；恢复成功仍保留原记录，删除需单独确认。
- 「仓库连接」添加 / 删除远程，分别修改 Fetch / Push 地址，检查系统 Git 和认证相关配置，设置仅对本仓库生效的提交姓名与邮箱。
- 当前仓库本次会话的操作记录、成功 / 失败详情。
- 仓库打开、操作完成和应用重新获得焦点时刷新；可见窗口每 3 秒检查本地文件、引用和配置变化，也可手动刷新。不会自动 Fetch / Pull。

## 开发

需要系统 Git、Go 1.27.1+ 和 Node.js 22.12+。Go 的自动工具链可根据 `go.mod` 下载所需版本。当前已经在 macOS Apple Silicon 上构建验证；Windows / Linux 尚未实机测试。

```sh
cd /Users/sakura/Code/gitlane
npm install
npm run dev
```

`npm run dev` 启动 MyGo 桌面窗口及 `127.0.0.1:5274` 上的 Vite 开发服务。配置使用 JSON 和 npm，不需要 Bun。

如果 Go 官方代理在当前网络不可用，可仅为这次命令指定镜像，不必修改全局设置：

```sh
GOPROXY=https://goproxy.cn,direct npm run dev
```

仅预览界面：

```sh
npm run dev:web
```

浏览器中的页面使用**明确标注的只读示例数据**，不能访问本地仓库，也不会模拟 Git 操作成功。真实操作仅在 MyGo 桌面窗口中可用。字体随应用打包，不依赖运行时网络。

## 构建与启动

```sh
npm run build
open build/darwin-arm64/Gitlane.app
```

macOS 构建输出：

```text
build/darwin-arm64/Gitlane.app
build/darwin-arm64/Gitlane 0.3.1 arm64.dmg
```

直接启动并打开指定仓库：

```sh
build/darwin-arm64/Gitlane.app/Contents/MacOS/Gitlane --repo /absolute/path/to/repository
```

本机构建使用 ad-hoc 签名，没有 Apple Developer ID 签名或公证；目前适合本地使用，不应视作已完成公开分发。

## 测试

```sh
npm test
go vet ./...
```

后端测试全部使用临时仓库，包括：普通修改、首次提交、中文 / 换行 / 通配字符文件名、重命名追加修改、取消暂存、二进制文件、越界路径、符号链接、仓库切换失效保护、Detached HEAD、冲突和本地裸仓库的 Fetch / Pull / Push。同时覆盖首次推送设置上游、拒绝分叉覆盖、原作者与提交者、合并提交的第一父提交差异及主题持久化。不会在你的现有仓库上执行测试提交或远程操作。

0.3.0 新增分块暂存与反向取消暂存、差异失效保护、Stash 生命周期与恢复冲突、未跟踪文件清理、克隆 / 初始化的目录保护、远程配置版本校验、本仓库身份和外部重复编辑检测。0.3.1 增加并排 Diff 配对、阅读布局、真实同步目标与确认失效保护。当前共 28 项 Go 测试（含 2 项外观设置测试，启用 race detector）和 16 项前端测试。

前端测试覆盖外观设置输入校验、统一 Diff 行号、类似 Diff 头的代码内容、部分暂存状态和真实父提交关系的分支连线。

推荐运行专用原生冒烟脚本。它创建临时仓库、裸远程和 Stash，再启动打包后的 WebView / IPC，检查工作区代码块、提交作者、原生设置事件、Stash 差异、仓库连接，以及外部新建文件后的自动刷新：

```sh
scripts/native-smoke.sh
```

输出保存在 `build/native-smoke-v031.log`；同时验证专注阅读窗口边界和真实上游推送确认。临时仓库路径保存在 `build/smoke-repository.txt`，保留供检查，不使用现有项目。也可对专用测试仓库执行只读的原生测试（成功输出 `GITLANE_SMOKE`，失败以非零退出）：

```sh
build/darwin-arm64/Gitlane.app/Contents/MacOS/Gitlane --smoke --repo /absolute/path/to/test-repository
```

## 安全边界与限制

- 不提供强推、硬重置、丢弃修改或一键撤销，避免制造“任何操作都能恢复”的错觉。
- 分支切换要求工作区干净。Pull 只允许快进，且不自动 Stash / Merge / Rebase。
- Stash 恢复要求工作区干净；失败时可能已产生部分修改或冲突，原记录保留，请先检查，不要盲目重复恢复。保存不包含忽略文件或子模块内部修改。删除前避免在其他工具中同时修改 Stash 列表。
- Detached HEAD、冲突、Merge / Rebase / Cherry-pick / Revert / Bisect 等特殊状态会提示；此版本不代替终端完成这些流程。
- Push 显式指定当前 HEAD 和上游目标，不受 `push.default=matching` 影响，不附带推送标签或子模块。
- 复用系统 Git 的 SSH、凭据助手和仓库配置。终端密码提示已关闭；需要交互认证时先在终端完成。Git hooks 仍由 Git 正常执行，提交签名仍沿用用户配置。
- 开发环境中的认证检查只表示配置是否存在，不代表已经通过远程认证。软件不保存账号密码；HTTP(S) 地址中不允许嵌入账号或 Token。当前没有克隆进度流或取消按钮，克隆也受 90 秒超时限制。
- Git 操作有互斥锁、仓库身份校验和 90 秒超时；外部 Git 进程仍可能并发修改仓库，错误后应刷新检查实际状态。
- Diff 不运行外部 Diff 程序或 textconv；未跟踪文件的预览限制在仓库根目录内。
- 单次输出限制为 4 MB，界面最多显示 3000 行 Diff；超限时明确提示，不静默截断 Git 状态。
- 分块暂存仅支持普通已跟踪文本修改；新增、删除、重命名、二进制、文件模式变化、符号链接与子模块等使用整文件操作。暂不支持逐行暂存、冲突编辑、Merge / Rebase 流程、分支删除、标签管理和创建 / 删除 Worktree。
- 历史仍限最近 100 条，尚无分页。大仓库性能与在线 GitHub / GitLab 认证仍需进一步实测。
- 最近仓库路径与外观设置保存在 MyGo 的用户数据目录；外观另有本地预加载缓存，避免启动时主题闪烁。操作记录仅在内存中保留，切换仓库后重新开始。

## 代码结构

```text
main.go                    MyGo 窗口、原生对话框、类型化 IPC、最近仓库
repository_api.go          新建仓库、Stash、连接设置和分块操作的 IPC
smoke.go                   打包后的原生只读冒烟流程
internal/gitrepo/          Git 命令封装、状态解析、操作保护和集成测试
src/App.tsx               工作区、历史、工作树、操作记录及确认交互
src/DiffPanel.tsx          统一 / 并排 Diff、换行和专注阅读
src/SyncSummary.tsx        同步方向、真实目标和折叠命令详情
src/sync-plan.ts           显示用 Git 命令格式化（不通过 Shell 执行）
src/reader.css             紧凑审阅布局和响应式阅读工具栏
src/NewRepositoryDialog.tsx 克隆与初始化仓库
src/StashPanel.tsx         工作现场列表、差异与恢复确认
src/RemotePanel.tsx        远程地址、开发环境和本仓库身份
src/HistoryDetails.tsx    提交元信息、文件清单和单文件差异
src/SettingsPanel.tsx     外观设置界面
src/appearance.ts        主题应用与启动缓存
preferences.go           本机外观配置、MyGo 主题与菜单事件
src/git-view.ts            Diff 解析和父提交关系图
src/mygo.ts               MyGo 自动生成的 TypeScript 客户端
src/demo.ts               仅用于浏览器预览的示例数据
src/style.css             雾霾蓝 / 石墨灰的浅深主题与窄屏适配
mygo.json                 桌面应用和构建配置
```
