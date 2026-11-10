# convert_asteroids.ps1
$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
    Write-Error "Must be run from the root of the Git repository."
    exit 1
}

$labs = @("lab_1", "lab_2", "lab_3")
$targetFolder = "js\asteroids"

# 1. Create a clean orphan branch
git checkout --orphan clean-asteroids
git rm -rf . | Out-Null

# 2. Sequentially build history for js/asteroids
foreach ($lab in $labs) {
    $sourcePath = "js\$lab"
    Write-Host "==> Staging $sourcePath into $targetFolder..."

    # Ensure js/asteroids exists and is empty before copying the version contents
    New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    Get-ChildItem -Path $targetFolder -Force | Remove-Item -Recurse -Force

    # Copy contents from js/lab_X to js/asteroids
    if (Test-Path $sourcePath) {
        Get-ChildItem -Path $sourcePath -Force | Copy-Item -Destination $targetFolder -Recurse -Force
    }

    # Stage, commit, and create tag
    git add $targetFolder
    git commit -m "Release $lab"
    git tag -a "$lab" -m "Version $lab"
}

# 3. Clean up old lab folders and finalize main branch
foreach ($lab in $labs) {
    if (Test-Path "js\$lab") {
        Remove-Item -Path "js\$lab" -Recurse -Force
    }
}
git add -A
git commit -m "Clean up original lab folders" --allow-empty
git branch -M main

Write-Host "`nSuccessfully created js/asteroids with tags: $($labs -join ', ')"