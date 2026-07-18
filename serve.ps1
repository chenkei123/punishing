param(
    [int]$port = 8000
)

Write-Host "尝试在端口 $port 启动本地静态服务器..."

$py = Get-Command python -ErrorAction SilentlyContinue
$py3 = Get-Command python3 -ErrorAction SilentlyContinue

if ($py) {
    Write-Host "使用 python 启动: python -m http.server $port"
    & python -m http.server $port
    exit
} elseif ($py3) {
    Write-Host "使用 python3 启动: python3 -m http.server $port"
    & python3 -m http.server $port
    exit
} else {
    Write-Host "未检测到 Python。请安装 Python 或使用 Node.js 的 http-server。"
    Write-Host "若已安装 Node.js，可执行： npx http-server -p $port"
}
