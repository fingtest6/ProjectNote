# 项目便签

分项目记录、双链引用与 Git 式历史的本地优先便签。

桌面端现在以 **Qt 6 原生应用** 为主。原来的 TypeScript / Vite、Electron 与 Capacitor Android 工程仍保留在仓库里，方便对照，不再作为桌面端的默认运行方式。

## 用 Qt 运行（桌面端）

依赖：

- CMake 3.16+、Ninja、C++17（建议 g++）
- Qt 6：Core、Gui、Widgets、Qml、Quick、QuickControls2、Sql、Network
- QML 模块：`QtQuick`、`QtQuick.Controls`、`QtQuick.Layouts`、`QtQml.WorkerScript`
- SQLite 驱动（`libqt6sql6-sqlite`）
- `libqrencode`（局域网配对二维码）
- 中文字体（例如 Noto Sans CJK SC）

Ubuntu / Debian：

```bash
sudo apt install build-essential cmake ninja-build \
  qt6-base-dev qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls \
  qml6-module-qtquick-layouts qml6-module-qtquick-templates \
  qml6-module-qtquick-window qml6-module-qtqml-workerscript \
  libqt6sql6-sqlite libqrencode-dev pkg-config fonts-noto-cjk
```

构建并运行：

```bash
./qt/build.sh
./qt/build/projectnote
```

也可以直接：

```bash
./启动项目便签-Qt.sh
```

数据默认保存在应用数据目录的 `projectnote.sqlite`（项目、便签、Git 式历史）。外部 Markdown 镜像默认写到「文档/ProjectNotesVault」，可在「电脑手机互联与外部存储」里更换目录。

自检数据层（不打开窗口）：

```bash
./qt/build/projectnote --self-test
```

### 安装与打包

```bash
cmake --install qt/build --prefix /usr/local
```

会安装可执行文件、`.desktop` 和 `hicolor` 图标。Windows 构建会把 `qt/packaging/projectnote.rc` 链进 exe，使用多尺寸 `.ico`。macOS 图标为 `qt/packaging/projectnote.icns`。也可以在 `qt/build` 里用 CPack 打出 TGZ：

```bash
cd qt/build && cpack -G TGZ
```

### 已移植的功能

界面沿用现有布局：顶栏项目切换、搜索（当前项目 / 全部项目）、双列便签卡片、右下角新建、以及原来的各个弹层。

- 项目：新建、改名、主题色、描述、删除（至少保留一个；删除时便签一并软删除）
- 便签：新建、Markdown 编辑、预览、置顶、复制（含历史）、删除
- 编辑工具：标题、粗体、斜体、删除线、待办、列表、引用、行内代码、双链、图片、导入 `.md`，回车续写列表
- 双链 `[[id|标题]]` 与反向链接
- Git 式历史：逐行差异、对比上一版 / 最新版、回退版本
- 导出 Markdown、卡片图片、复制正文
- 主题：浅色 / 深色 / 跟随系统，以及原来的 8 个强调色
- 外部文件夹镜像（带 frontmatter 的 `.md`）
- 局域网同步：端口 `25860`、6 位配对码、二维码、在线设备邀请、按 IP 发起同步；模式与原来的电脑端一致（智能合并、仅新增、以电脑覆盖手机、以手机覆盖电脑）。协议与现有手机端兼容。同步前需确认，完成后可撤销本机变更。

## 应用图标

应用图标使用 Ting 提供的角色图：浅蓝色银发、手持笔记本的角色，白底。已生成：

- Windows：`icon.ico`、`build/icon.ico`、`electron/icon.ico`、`qt/packaging/projectnote.ico`（16/32/48/64/128/256）
- Linux：`qt/resources/icon-512.png`，安装到 `hicolor` 256 与 512
- macOS：`qt/packaging/projectnote.icns`
- 窗口与任务栏：Qt 从资源加载上述尺寸
- 网站 / Electron / Android 启动图标也换成同一张图

角色按整幅缩放进圆角方块，不裁掉脸。需要重做图标时：

```bash
python3 qt/tools/make-icons.py
```

源图在 `qt/resources/app-icon-source.png`。

## 原来的 Web / Electron / Android

这些目录保持原样，仅作参照：

```bash
pnpm install
pnpm dev                  # Vite
pnpm electron:dev         # Electron
pnpm sync:server          # 旧的独立同步服务脚本
pnpm cap:sync             # Capacitor Android
```

Windows 上仍可使用 `启动项目便签-Electron版.bat` 与 `启动项目便签-Windows桌面版.bat` 启动旧桌面壳。新的桌面端请用上面的 Qt 程序。
