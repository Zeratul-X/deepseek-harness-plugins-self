# dsh-harness-plugins

DeepSeek Harness(DSH)自定义插件集:桌宠、终端、Git 差异、@ 文件引用、会话页签拖拽排序。

适用于 **Windows + DeepSeek Harness 桌面版**(Web 客户端插件,`dsh.client.platform: web`)。

## 插件列表

| 插件 | 目录 | 功能 |
|---|---|---|
| 🐶 桌宠 | `plugins/pet` | 桌面宠物(透明置顶、9 组动作动画:待机/左右奔跑/挥手/跳跃/失败/等待/冲刺/敬礼;点击弹出交互面板:跳/打/投喂骨头;饱食度系统,8 小时耗尽,饿了播放失败动画;滚轮缩放;随机可爱文案气泡) |
| 💻 终端 | `plugins/term` | 在会话内直接执行终端命令,返回输出与退出码(基于当前会话工作目录,超时保护) |
| 📝 Git 差异 | `plugins/diffs` | 工作区 Git 变更快照/差异查看(Git 状态、文件级 diff) |
| 📎 @ 文件引用 | `plugins/file-ref` | 输入框输入 `@` 弹出文件筛选(只列当前展开工作区的文件),选中后以纯文本 `@相对路径` 写入输入框(无 chip/占位符,光标正常);输入框上方 dock 只展示当前工作区真实存在的代码文件 `@` 引用(点击弹代码预览选行,✕ 移除);预览支持点行号选行、Shift 点击/拖拽连选、Ctrl+F 搜索,确认后原位替换为纯文本 `@path line a-b`;输入内容过多时 dock 显示内容缩略胶囊(首行预览+行数,点击回到输入框顶部) |
| 📑 页签排序 | `plugins/vord` | 拖拽会话/对话视图页签进行排序 |

## 环境要求

- Windows 10/11
- DeepSeek Harness 桌面版(插件通过 `~/.dsh/cordis.patch.yml` 的 `insert` 注册,加载到每个 profile)

## 安装

### 方法一:一键脚本(推荐)

```powershell
# 在仓库根目录执行(右键 -> 使用 PowerShell 运行,或):
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

脚本会:

1. 把 `plugins/*` 复制到 `%USERPROFILE%\.dsh\plugins\`
2. 在 `%USERPROFILE%\.dsh\profiles\node_modules` 下创建 `harness-*` junction 链接
3. 向 `%USERPROFILE%\.dsh\cordis.patch.yml` 追加插件注册块(若未注册过)

安装完成后**重启 DeepSeek Harness** 生效。

### 方法二:手动安装

```powershell
# 1. 复制插件源码
$dst = "$env:USERPROFILE\.dsh\plugins"
New-Item -ItemType Directory -Force -Path $dst
Copy-Item -Recurse -Force .\plugins\* $dst

# 2. 创建 junction 链接(让 Loader 与 client 端都能解析包)
$nm = "$env:USERPROFILE\.dsh\profiles\node_modules"
New-Item -ItemType Directory -Force -Path $nm
New-Item -ItemType Junction -Path "$nm\harness-pet" -Target "$dst\pet"
New-Item -ItemType Junction -Path "$nm\harness-term" -Target "$dst\term"
New-Item -ItemType Junction -Path "$nm\harness-diffs" -Target "$dst\diffs"
New-Item -ItemType Junction -Path "$nm\harness-vord" -Target "$dst\vord"
New-Item -ItemType Junction -Path "$nm\harness-file-ref" -Target "$dst\file-ref"

# 3. 注册插件(追加到 %USERPROFILE%\.dsh\cordis.patch.yml)
# 如果文件里没有下面内容, 在末尾追加:
# - insert:
#     - id: harness-pet
#       name: harness-pet
#     - id: harness-term
#       name: harness-term
#     - id: harness-diffs
#       name: harness-diffs
#     - id: harness-vord
#       name: harness-vord
#     - id: harness-file-ref
#       name: harness-file-ref
```

## 更新

```powershell
# 拉取新版本后重新运行一键脚本即可(会覆盖旧文件)
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## 卸载

```powershell
# 删除插件源码目录与 junction 链接
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\plugins\pet", "$env:USERPROFILE\.dsh\plugins\term", "$env:USERPROFILE\.dsh\plugins\diffs", "$env:USERPROFILE\.dsh\plugins\vord", "$env:USERPROFILE\.dsh\plugins\file-ref"
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\node_modules\harness-pet"
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\node_modules\harness-term"
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\node_modules\harness-diffs"
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\node_modules\harness-vord"
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\node_modules\harness-file-ref"
```

然后在 `%USERPROFILE%\.dsh\cordis.patch.yml` 中删除对应的 `insert` 块,重启 DSH。

## 自定义桌宠形象

桌宠精灵图位于 `plugins/pet/spritesheet.webp`,为 Codex 宠物图集格式:

- 尺寸 `1536 × 1872`,网格 `8 列 × 9 行`,每格 `192 × 208`
- 行序固定:`idle / run-right / run-left / wave / jump / failed / waiting / run / review`
- 替换同名文件后重启 DSH 即可生效

## 目录结构

```text
dsh-harness-plugins/
├── install.ps1              # 一键安装脚本
├── README.md
└── plugins/
    ├── pet/                 # 桌宠(含 spritesheet.webp 资源)
    │   ├── package.json
    │   ├── spritesheet.webp
    │   └── lib/
    │       ├── index.js     # host 端:HTTP 提供精灵图
    │       └── client.js    # 客户端:渲染与交互
    ├── term/
    ├── diffs/
    ├── vord/
    └── file-ref/
```

## License

MIT
