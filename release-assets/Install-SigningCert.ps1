# Installs the "Electron by Haris" code-signing certificate into the
# Local Machine Trusted Root and Trusted Publisher stores so Windows
# shows "Verified publisher" instead of "Unknown publisher".
# Right-click PowerShell -> Run as Administrator, then:
#   powershell -ExecutionPolicy Bypass -File .\Install-SigningCert.ps1

$ErrorActionPreference = 'Stop'
$cer = Join-Path $PSScriptRoot 'electronbyharis.cer'
if (-not (Test-Path $cer)) {
    Write-Error "electronbyharis.cer was not found next to this script."
    exit 1
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cer)

$root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
$root.Open('ReadWrite')
$root.Add($cert)
$root.Close()

$pub = New-Object System.Security.Cryptography.X509Certificates.X509Store('TrustedPublisher', 'LocalMachine')
$pub.Open('ReadWrite')
$pub.Add($cert)
$pub.Close()

Write-Host 'Certificate installed successfully.' -ForegroundColor Green
Write-Host 'You can now run "Electron by Haris Setup 1.0.0.exe".' -ForegroundColor Green
