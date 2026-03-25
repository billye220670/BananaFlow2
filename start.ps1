# ============================================
# BananaFlow2 项目一键启动脚本
# ============================================
# 功能说明：
#   1. 自动检查依赖是否已安装
#   2. 如未安装依赖，自动执行 npm install
#   3. 启动 Next.js 开发服务器
# ============================================

# 设置脚本编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 获取脚本所在目录（项目根目录）
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  BananaFlow2 项目启动脚本" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js 是否已安装
Write-Host "[检查] 正在检查 Node.js 环境..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "[成功] Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未检测到 Node.js，请先安装 Node.js" -ForegroundColor Red
    Write-Host "下载地址: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 1
}

# 检查 npm 是否可用
Write-Host "[检查] 正在检查 npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "[成功] npm 版本: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未检测到 npm，请确保 Node.js 安装正确" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

Write-Host ""

# 检查 node_modules 目录和 next 是否已安装
$nodeModulesPath = Join-Path $scriptDir "node_modules"
$nextPath = Join-Path $nodeModulesPath "next"
$packageLockPath = Join-Path $nodeModulesPath ".package-lock.json"

$needInstall = $false

if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "[提示] node_modules 目录不存在，需要安装依赖" -ForegroundColor Yellow
    $needInstall = $true
} elseif (-not (Test-Path $nextPath)) {
    Write-Host "[提示] next 未安装，需要安装依赖" -ForegroundColor Yellow
    $needInstall = $true
} elseif (-not (Test-Path $packageLockPath)) {
    Write-Host "[提示] 依赖可能不完整，需要重新安装" -ForegroundColor Yellow
    $needInstall = $true
} else {
    Write-Host "[成功] 依赖已安装" -ForegroundColor Green
}

# 如果需要安装依赖
if ($needInstall) {
    Write-Host ""
    Write-Host "[安装] 正在安装项目依赖，请稍候..." -ForegroundColor Yellow
    Write-Host "执行命令: npm install" -ForegroundColor Gray
    Write-Host ""
    
    # 执行 npm install
    $installProcess = Start-Process -FilePath "npm" -ArgumentList "install" -NoNewWindow -Wait -PassThru
    
    # 检查安装结果
    if ($installProcess.ExitCode -ne 0) {
        Write-Host ""
        Write-Host "[错误] 依赖安装失败！" -ForegroundColor Red
        Write-Host "请检查网络连接或尝试手动运行 'npm install'" -ForegroundColor Yellow
        Read-Host "按回车键退出"
        exit 1
    }
    
    Write-Host ""
    Write-Host "[成功] 依赖安装完成！" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[启动] 正在启动开发服务器..." -ForegroundColor Yellow
Write-Host "执行命令: npm run dev" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "提示: 按 Ctrl+C 可停止服务器" -ForegroundColor Magenta
Write-Host "       服务器启动后将自动打开浏览器" -ForegroundColor Magenta
Write-Host ""

# 在后台启动延时打开浏览器的任务
# 等待 3 秒让服务器启动完成后再打开浏览器
$null = Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3000"
}

# 启动开发服务器（阻塞命令）
npm run dev

# 如果服务器意外停止
Write-Host ""
Write-Host "[提示] 开发服务器已停止" -ForegroundColor Yellow
Read-Host "按回车键退出"
