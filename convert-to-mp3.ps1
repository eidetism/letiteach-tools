param(
    [string]$InputDirectory = ".\letiteach-physics",

    [string]$OutputDirectory = ".\letiteach-audio",

    [ValidatePattern('^\d+k$')]
    [string]$Bitrate = "96k"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command "ffmpeg" -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg is not installed. Run: winget install Gyan.FFmpeg"
}

if (-not (Test-Path -LiteralPath $InputDirectory -PathType Container)) {
    Write-Error "Input directory not found: $InputDirectory"
}

$inputFiles = @(Get-ChildItem -LiteralPath $InputDirectory -File -Filter "*.mp4")

if ($inputFiles.Count -eq 0) {
    Write-Error "No MP4 files found in: $InputDirectory"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$failedFiles = [System.Collections.Generic.List[string]]::new()

foreach ($inputFile in $inputFiles) {
    $outputFile = Join-Path $OutputDirectory "$($inputFile.BaseName).mp3"

    if (Test-Path -LiteralPath $outputFile -PathType Leaf) {
        Write-Host "Skipping existing file: $outputFile"
        continue
    }

    Write-Host "Converting $($inputFile.FullName)..."

    & ffmpeg `
        -hide_banner `
        -loglevel error `
        -i $inputFile.FullName `
        -vn `
        -codec:a libmp3lame `
        -b:a $Bitrate `
        -ac 1 `
        -n `
        $outputFile

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not convert: $($inputFile.FullName)"
        $failedFiles.Add($inputFile.FullName)
    }
}

if ($failedFiles.Count -gt 0) {
    Write-Warning "Failed files: $($failedFiles -join ', ')"
    exit 2
}

Write-Host "Done. Audio files are in: $OutputDirectory"
