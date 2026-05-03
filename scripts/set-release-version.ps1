# Set RELEASE_VERSION environment variable from git commit SHA
# Usage: .\scripts\set-release-version.ps1

$commitSha = git rev-parse --short HEAD
$env:RELEASE_VERSION = $commitSha
Write-Host "RELEASE_VERSION set to: $env:RELEASE_VERSION"
