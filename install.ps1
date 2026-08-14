# dsh-harness-plugins 一键安装脚本
# 用法: powershell -ExecutionPolicy Bypass -File .\install.ps1
# 安装后请重启 DeepSeek Harness 生效。

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = Join-Path $HOME '.dsh'
$pluginsDir = Join-Path $dshHome 'plugins'
$nmDir = Join-Path $dshHome 'profiles\node_modules'
$patchFile = Join-Path $dshHome 'cordis.patch.yml'

# 插件目录名 -> npm 包名
$map = @{
  'pet'      = 'harness-pet'
  'term'     = 'harness-term'
  'diffs'    = 'harness-diffs'
  'vord'     = 'harness-vord'
  'file-ref' = 'harness-file-ref'
}

Write-Host '==> 1/3 复制插件源码到 ~/.dsh/plugins'
New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
foreach ($name in $map.Keys) {
  $src = Join-Path $repo "plugins\$name"
  if (-not (Test-Path $src)) {
    Write-Warning "跳过(目录不存在): $src"
    continue
  }
  $dst = Join-Path $pluginsDir $name
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item $src $dst -Recurse -Force
  Write-Host "  - $name"
}

Write-Host '==> 2/3 创建 junction 链接到 profiles/node_modules'
New-Item -ItemType Directory -Force -Path $nmDir | Out-Null
foreach ($name in $map.Keys) {
  $target = Join-Path $pluginsDir $name
  if (-not (Test-Path $target)) { continue }
  $link = Join-Path $nmDir $map[$name]
  if (Test-Path $link) {
    # junction/目录链接用 rmdir 删除(避免误删目标内容)
    cmd /c rmdir "$link" 2>$null
  }
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
  Write-Host "  - $($map[$name]) -> plugins\$name"
}

Write-Host '==> 3/3 注册插件到 cordis.patch.yml'
$block = @'

# ── harness plugins (client plugins, ~/.dsh/plugins/*) ─────────────
- insert:
    - id: harness-pet
      name: harness-pet
    - id: harness-term
      name: harness-term
    - id: harness-diffs
      name: harness-diffs
    - id: harness-vord
      name: harness-vord
    - id: harness-file-ref
      name: harness-file-ref
'@
if (-not (Test-Path $patchFile)) {
  New-Item -ItemType File -Path $patchFile -Force | Out-Null
}
$content = Get-Content $patchFile -Raw -ErrorAction SilentlyContinue
if ($content -match 'harness-pet') {
  Write-Host '  - 已注册, 跳过'
} else {
  Add-Content -Path $patchFile -Value $block -Encoding UTF8
  Write-Host '  - 已追加注册块'
}

Write-Host ''
Write-Host '安装完成!请重启 DeepSeek Harness 使插件生效。'
