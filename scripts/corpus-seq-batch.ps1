$ErrorActionPreference = "Stop"

$commands = Get-Content ".\scripts\corpus-q.txt" |
Where-Object {
    $_.Trim() -ne "" -and
    -not $_.Trim().StartsWith("#")
}

$total = $commands.Count

for ($i = 0; $i -lt $total; $i++) {
    $command = $commands[$i]

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "Corpus run $($i + 1) / $total"
    Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host $command
    Write-Host "============================================================"

    cmd.exe /d /s /c $command

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAILED: run $($i + 1)"
        Write-Host "Exit code: $LASTEXITCODE"
        Write-Host "Stopping queue."
        exit $LASTEXITCODE
    }

    Write-Host "SUCCESS: run $($i + 1) completed."
}

Write-Host ""
Write-Host "All $total corpus runs completed successfully."