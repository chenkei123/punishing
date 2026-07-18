@echo off
REM 简单的 Windows 批处理文件，调用 PowerShell 启动本地服务器（默认端口 8000）
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"' -NoNewWindow -Wait"
