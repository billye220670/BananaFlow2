@echo off
chcp 65001 >nul 2>&1
:: ============================================
:: BananaFlow2 项目一键启动脚本 (批处理版本)
:: ============================================
:: 功能说明：
::   1. 自动检查依赖是否已安装
::   2. 如未安装依赖，自动执行 npm install
::   3. 启动 Next.js 开发服务器
:: 双击此文件即可启动项目
:: ============================================

:: 切换到脚本所在目录（项目根目录）
cd /d "%~dp0"

echo ============================================
echo   BananaFlow2 项目启动脚本
echo ============================================
echo.

:: 检查 Node.js 是否已安装
echo [检查] 正在检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo [成功] Node.js 版本: %%i

:: 检查 npm 是否可用
echo [检查] 正在检查 npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 npm，请确保 Node.js 安装正确
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do echo [成功] npm 版本: %%i

echo.

:: 检查 node_modules 目录和关键依赖是否已安装
set "NEED_INSTALL=0"

if not exist "node_modules" (
    echo [提示] node_modules 目录不存在，需要安装依赖
    set "NEED_INSTALL=1"
) else if not exist "node_modules\next" (
    echo [提示] next 未安装，需要安装依赖
    set "NEED_INSTALL=1"
) else if not exist "node_modules\tldraw" (
    echo [提示] tldraw 未安装，需要安装依赖
    set "NEED_INSTALL=1"
) else if not exist "node_modules\.package-lock.json" (
    echo [提示] 依赖可能不完整，需要重新安装
    set "NEED_INSTALL=1"
) else (
    echo [成功] 依赖已安装
)

:: 如果需要安装依赖
if "%NEED_INSTALL%"=="1" (
    echo.
    echo [安装] 正在安装项目依赖，请稍候...
    echo 执行命令: npm install
    echo.
    
    call npm install
    
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败！
        echo 请检查网络连接或尝试手动运行 'npm install'
        pause
        exit /b 1
    )
    
    echo.
    echo [成功] 依赖安装完成！
)

echo.
echo ============================================
echo [启动] 正在启动开发服务器...
echo 执行命令: npm run dev
echo ============================================
echo.
echo 提示: 按 Ctrl+C 可停止服务器
echo        服务器启动后将自动打开浏览器
echo.

:: 在后台启动延时打开浏览器的任务
:: 等待 3 秒让服务器启动完成后再打开浏览器
start /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

:: 启动开发服务器（阻塞命令）
call npm run dev

:: 如果服务器意外停止
echo.
echo [提示] 开发服务器已停止
pause
