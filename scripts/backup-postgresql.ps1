param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$BackupRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) "backups\postgresql"),
    [string]$EnvPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "backend\.env"),
    [int]$RetentionDays = 14,
    [string]$PgDumpPath = $env:PG_DUMP_PATH
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line

    if (-not (Test-Path -LiteralPath $BackupRoot)) {
        New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    }

    $logFile = Join-Path $BackupRoot "backup.log"
    Add-Content -LiteralPath $logFile -Value $line
}

function Read-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $lineKey = $trimmed.Substring(0, $separatorIndex).Trim()
        if ($lineKey -ne $Key) {
            continue
        }

        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        return $value
    }

    return $null
}

function Find-PgDumpExecutable {
    param([string]$PreferredPath)

    if ($PreferredPath) {
        $expanded = [Environment]::ExpandEnvironmentVariables($PreferredPath)
        if (Test-Path -LiteralPath $expanded) {
            return (Resolve-Path -LiteralPath $expanded).Path
        }
    }

    $command = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    $candidateRoots = @(
        "C:\Program Files\PostgreSQL",
        "C:\Program Files (x86)\PostgreSQL"
    )

    foreach ($root in $candidateRoots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }

        $candidates = Get-ChildItem -Path $root -Recurse -Filter "pg_dump.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending
        if ($candidates.Count -gt 0) {
            return $candidates[0].FullName
        }
    }

    return $null
}

function Parse-PostgresUrl {
    param([string]$DatabaseUrl)

    if (-not $DatabaseUrl) {
        throw "DATABASE_URL tidak ditemukan."
    }

    $uri = [Uri]$DatabaseUrl
    $databaseName = [Uri]::UnescapeDataString($uri.AbsolutePath.Trim("/"))
    if (-not $databaseName) {
        throw "Nama database tidak valid di DATABASE_URL."
    }

    $userInfo = $uri.UserInfo
    $username = ""
    $password = ""
    if ($userInfo) {
        $parts = $userInfo.Split(":", 2)
        $username = [Uri]::UnescapeDataString($parts[0])
        if ($parts.Count -gt 1) {
            $password = [Uri]::UnescapeDataString($parts[1])
        }
    }

    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

    return [pscustomobject]@{
        Host = $uri.Host
        Port = $port
        Username = $username
        Password = $password
        Database = $databaseName
    }
}

try {
    if (-not (Test-Path -LiteralPath $RepoRoot)) {
        throw "Repo root tidak ditemukan: $RepoRoot"
    }

    if (-not (Test-Path -LiteralPath $EnvPath)) {
        throw "File environment backend tidak ditemukan: $EnvPath"
    }

    if (-not (Test-Path -LiteralPath $BackupRoot)) {
        New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    }

    $databaseUrl = Read-DotEnvValue -Path $EnvPath -Key "DATABASE_URL"
    $connection = Parse-PostgresUrl -DatabaseUrl $databaseUrl

    $pgDump = Find-PgDumpExecutable -PreferredPath $PgDumpPath
    if (-not $pgDump) {
        throw "pg_dump.exe tidak ditemukan. Install PostgreSQL client tools atau set env PG_DUMP_PATH ke lokasi pg_dump.exe."
    }

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = Join-Path $BackupRoot "computer-inventory_$timestamp.backup"

    Write-Log "Mulai backup database: $($connection.Database)"
    Write-Log "Output file: $backupFile"
    Write-Log "Menggunakan pg_dump: $pgDump"

    $previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD")
    try {
        if ($connection.Password) {
            [Environment]::SetEnvironmentVariable("PGPASSWORD", $connection.Password)
        }

        $args = @(
            "--host=$($connection.Host)"
            "--port=$($connection.Port)"
            "--username=$($connection.Username)"
            "--format=custom"
            "--file=$backupFile"
            "--no-owner"
            "--no-privileges"
            "--dbname=$($connection.Database)"
        )

        & $pgDump @args
        if ($LASTEXITCODE -ne 0) {
            throw "pg_dump gagal dengan exit code $LASTEXITCODE."
        }
    } finally {
        [Environment]::SetEnvironmentVariable("PGPASSWORD", $previousPassword)
    }

    if (-not (Test-Path -LiteralPath $backupFile)) {
        throw "Backup selesai tetapi file tidak ditemukan."
    }

    $fileInfo = Get-Item -LiteralPath $backupFile
    if ($fileInfo.Length -le 0) {
        throw "Backup gagal: file backup kosong."
    }

    $cutoffDate = (Get-Date).AddDays(-[Math]::Abs($RetentionDays))
    Get-ChildItem -Path $BackupRoot -Filter "*.backup" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoffDate } |
        ForEach-Object {
            Write-Log "Hapus backup lama: $($_.FullName)"
            Remove-Item -LiteralPath $_.FullName -Force
        }

    Write-Log "Backup selesai. Ukuran file: $([Math]::Round($fileInfo.Length / 1MB, 2)) MB"
    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
