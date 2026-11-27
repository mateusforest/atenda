$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $env:LOCALAPPDATA 'Atenda\WhatsApp-1'
$envFile = Join-Path $stateDir 'atendimento.env'
$portalFile = Join-Path $stateDir 'portal.env'
$config = ConvertFrom-StringData (Get-Content -LiteralPath $envFile -Raw)
$node = (Get-Command node.exe).Source
$worker = Join-Path $PSScriptRoot 'atendimento.mjs'
$mutex = [Threading.Mutex]::new($false, 'Local\AtendaWhatsAppAtendimento')
if (!$mutex.WaitOne(0)) { exit }
try {
    $gateway = $null
    while ($true) {
        $socket = [Net.Sockets.TcpClient]::new()
        try { $socket.Connect('127.0.0.1',38741) } catch {}
        $online = $socket.Connected
        $socket.Dispose()
        if (!$online -and (!$gateway -or $gateway.HasExited)) {
            $gateway = Start-Process -FilePath $node -ArgumentList 'iniciar-atenda.cjs' -WorkingDirectory $config.WA_AKG_DIR -WindowStyle Hidden -PassThru
        }
        if ($online) {
            & $node "--env-file=$portalFile" "--env-file=$envFile" $worker
        }
        Start-Sleep -Seconds 8
    }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }

