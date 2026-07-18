本地试运行说明
================

快速在本地浏览器中运行此项目（适用于 Windows）：

1) 推荐方式（需要已安装 Python 3）：

   在项目根目录（包含 `index.html` 的目录）打开 PowerShell，然后运行：

```powershell
python -m http.server 8000
```

   在浏览器里打开： http://localhost:8000

2) 使用提供的 PowerShell 脚本（会尝试使用 `python` / `python3`）：

   在项目根目录运行：

```powershell
.\serve.ps1
# 或指定端口
.\serve.ps1 -port 8080
```

3) Windows 一键启动（可双击运行 `run-local.bat` 或在命令行执行）：

```powershell
run-local.bat
```

注意：
- 若没有 Python，可安装 Python（推荐）或通过 Node.js 的 `npx http-server` 启动（需安装 Node.js）。
- 使用本地服务器可以避免 `html2canvas` 加载本地资源时的跨域/文件协议问题。

如果需要我可以把一个小的自动验证脚本加入到页面中，帮助验证 `state` 和导出行为。
