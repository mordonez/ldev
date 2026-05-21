$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerDir = Split-Path -Parent $scriptDir
$envFile = Join-Path $dockerDir '.env'

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*#') {
            continue
        }

        if ($line -match '^\s*([^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"')

            if ($name -eq $Key) {
                return $value
            }
        }
    }

    return $null
}

$envDataRoot = Get-EnvValue -Path $envFile -Key 'ENV_DATA_ROOT'

if (-not $envDataRoot) {
    $envDataRoot = Join-Path $dockerDir 'data\default'
} elseif (-not [System.IO.Path]::IsPathRooted($envDataRoot)) {
    $envDataRoot = Join-Path $dockerDir $envDataRoot
}

$certSource = Join-Path $envDataRoot 'local-nginx-certs\ca.crt'

if (-not (Test-Path $certSource)) {
    throw "CA cert not found at '$certSource'. Run 'ldev start' first so the webserver generates its local CA."
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certSource)
$existing = Get-ChildItem Cert:\CurrentUser\Root | Where-Object Thumbprint -eq $cert.Thumbprint

if ($existing.Count -eq 0) {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
        $env:NODE_EXTRA_CA_CERTS = $certSource
        [Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $certSource, 'User')
        throw "Windows may require an interactive confirmation to trust a new root CA. Re-run this script from an interactive PowerShell window to import it into CurrentUser\Root. NODE_EXTRA_CA_CERTS was configured for Node-based tooling."
    }

    & certutil.exe -user -f -addstore Root $certSource | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Could not import the local CA into CurrentUser\Root."
    }
}

$env:NODE_EXTRA_CA_CERTS = $certSource
[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $certSource, 'User')

Write-Host "Trusted ldev local HTTPS CA and configured NODE_EXTRA_CA_CERTS."
