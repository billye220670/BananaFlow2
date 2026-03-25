@echo off
chcp 65001 >nul 2>&1
:: ============================================
:: BananaFlow2 项目停止脚本 (批处理版本)
:: ============================================
:: 功能说明：
::   1. 查找占用 3000 端口的进程
::   2. 终止找到的开发服务器进程
:: 双击此文件即可停止开发服务器
:: ============================================

echo ============================================
echo   BananaFlow2 停止脚本
echo ============================================
echo.

echo [检查] 正在查找占用 3000 端口的进程...

:: 使用 netstat 查找占用 3000 端口的进程
:: 临时文件用于存储查找结果
set "FOUND=0"
set "STOPPED_COUNT=0"

:: 查找监听 3000 端口的进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING" 2^>nul') do (
    set "FOUND=1"
    set "PID=%%a"
    
    :: 获取进程名称
    for /f "tokens=1" %%b in ('tasklist /FI "PID eq %%a" /NH 2^>nul ^| findstr /v "INFO:"') do (
        set "PROCESS_NAME=%%b"
    )
    
    echo [停止] 正在终止进程: PID %%a...
    
    :: 终止进程
    taskkill /PID %%a /F >nul 2>&1
    
    if %errorlevel% equ 0 (
        echo [成功] 进程已终止: PID %%a
        set /a STOPPED_COUNT+=1
    ) else (
        echo [错误] 无法终止进程: PID %%a
    )
)

echo.

if "%FOUND%"=="0" (
    echo [提示] 没有找到运行中的开发服务器
    echo        端口 3000 没有被占用
) else (
    echo ============================================
    echo [完成] 开发服务器已停止
    echo ============================================
)

echo.
pause
