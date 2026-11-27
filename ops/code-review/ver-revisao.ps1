param([ValidatePattern('^(main|pr-[1-9][0-9]*)$')][string]$Alvo = 'main')
$ErrorActionPreference = 'Stop'
$remote = Join-Path $env:LOCALAPPDATA 'Atenda/VPS/remote.ps1'
if (!(Test-Path -LiteralPath $remote)) {
    throw 'O acesso SSH da Atenda precisa estar configurado neste Windows.'
}
# O ponteiro só é publicado depois de o relatório completo estar disponível.
& $remote ("python3 /opt/atenda-review/show.py " + $Alvo)
exit $LASTEXITCODE
