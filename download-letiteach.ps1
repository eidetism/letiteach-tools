param(
    [Parameter(Mandatory = $false)]
    [string[]]$LectureIds,

    [Parameter(Mandatory = $false)]
    [string]$ListFile,

    [ValidateSet("best", "1080p", "720p", "540p")]
    [string]$Quality = "720p",

    [string]$OutputDirectory = ".\letiteach-physics"
)

$ErrorActionPreference = "Stop"
$baseUrl = "https://s3stor.etu.ru:8080/letiteach/PHYSICS_LECTURES_HLS"

if (-not (Get-Command "yt-dlp" -ErrorAction SilentlyContinue)) {
    Write-Error "yt-dlp is not installed. Run: winget install yt-dlp.yt-dlp"
}

if ($ListFile) {
    if (-not (Test-Path -LiteralPath $ListFile -PathType Leaf)) {
        Write-Error "List file not found: $ListFile"
    }

    $idsFromFile = Get-Content -LiteralPath $ListFile |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith("#") }

    $LectureIds = @($LectureIds) + @($idsFromFile)
}

$LectureIds = @($LectureIds) |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    Select-Object -Unique

if ($LectureIds.Count -eq 0) {
    Write-Host "No lecture IDs specified."
    Write-Host "Example:"
    Write-Host '  .\download-letiteach.ps1 -LectureIds 1_1,1_2,1_3 -Quality 720p'
    Write-Host "Or create lectures.txt with one ID per line and run:"
    Write-Host '  .\download-letiteach.ps1 -ListFile .\lectures.txt -Quality 720p'
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$qualityFileSuffix = @{
    "1080p" = "orig"
    "720p"  = "720p"
    "540p"  = "540p"
}

$failed = [System.Collections.Generic.List[string]]::new()

foreach ($lectureId in $LectureIds) {
    if ($lectureId -notmatch '^\d+_\d+$') {
        Write-Warning "Skipping invalid lecture ID: $lectureId"
        $failed.Add($lectureId)
        continue
    }

    if ($Quality -eq "best") {
        $playlistUrl = "$baseUrl/$lectureId/master.m3u8"
    }
    else {
        $suffix = $qualityFileSuffix[$Quality]
        $playlistUrl = "$baseUrl/$lectureId/${lectureId}_${suffix}.m3u8"
    }

    $outputTemplate = Join-Path $OutputDirectory "$lectureId.%(ext)s"

    Write-Host "Downloading $lectureId in $Quality..."

    & yt-dlp `
        --continue `
        --no-overwrites `
        --merge-output-format mp4 `
        --output $outputTemplate `
        $playlistUrl

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not download $lectureId. Check that the ID and quality exist."
        $failed.Add($lectureId)
    }
}

if ($failed.Count -gt 0) {
    Write-Warning "Failed or skipped IDs: $($failed -join ', ')"
    exit 2
}

Write-Host "Done. Videos are in: $OutputDirectory"
