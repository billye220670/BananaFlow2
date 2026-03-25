# ============================================
# BananaFlow2 项目停止脚本
# ============================================
# 功能说明：
#   1. 查找占用 3000 端口的进程
#   2. 终止找到的开发服务器进程
# ============================================

# 设置脚本编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  BananaFlow2 停止脚本" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[检查] 正在查找占用 3000 端口的进程..." -ForegroundColor Yellow

try {
    # 使用 Get-NetTCPConnection 查找占用 3000 端口的进程
    $connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    
    if ($null -eq $connections -or $connections.Count -eq 0) {
        Write-Host ""
        Write-Host "[提示] 没有找到运行中的开发服务器" -ForegroundColor Yellow
        Write-Host "       端口 3000 没有被占用" -ForegroundColor Gray
        Write-Host ""
        Read-Host "按回车键退出"
        exit 0
    }
    
    # 获取所有占用端口的进程 ID（去重）
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    
    $stoppedCount = 0
    
    foreach ($pid in $processIds) {
        try {
            # 获取进程信息
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            
            if ($null -ne $process) {
                $processName = $process.ProcessName
                Write-Host "[停止] 正在终止进程: $processName (PID: $pid)..." -ForegroundColor Yellow
                
                # 终止进程
                Stop-Process -Id $pid -Force -ErrorAction Stop
                
                Write-Host "[成功] 进程已终止: $processName (PID: $pid)" -ForegroundColor Green
                $stoppedCount++
            }
        } catch {
            Write-Host "[错误] 无法终止进程 (PID: $pid): $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    
    if ($stoppedCount -gt 0) {
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host "[完成] 开发服务器已停止" -ForegroundColor Green
        Write-Host "       共终止 $stoppedCount 个进程" -ForegroundColor Gray
        Write-Host "============================================" -ForegroundColor Cyan
    } else {
        Write-Host "[提示] 没有找到需要停止的进程" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "[错误] 查找进程时发生错误: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Read-Host "按回车键退出"
