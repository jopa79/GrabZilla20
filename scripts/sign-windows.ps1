# GrabZilla 2.0 - Windows Code Signing Script
# This script signs Windows executables and installers using signtool

param(
    [Parameter(Mandatory=$false)]
    [string]$CertificateThumbprint = $env:WINDOWS_CERT_THUMBPRINT,
    
    [Parameter(Mandatory=$false)]
    [string]$TimestampUrl = "http://timestamp.sectigo.com",
    
    [Parameter(Mandatory=$false)]
    [string]$BuildPath = "src-tauri\target\release",
    
    [Parameter(Mandatory=$false)]
    [switch]$VerifyOnly = $false
)

# Colors for PowerShell output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"

function Write-ColorOutput($ForegroundColor, $Message) {
    Write-Host $Message -ForegroundColor $ForegroundColor
}

Write-ColorOutput $Blue "🚀 GrabZilla 2.0 - Windows Code Signing Script"

# Check if signtool is available
$SignTool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
if (-not $SignTool) {
    # Try to find signtool in Windows SDK
    $WinSDKPaths = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
        "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe",
        "${env:ProgramFiles(x86)}\Microsoft SDKs\Windows\*\bin\signtool.exe"
    )
    
    foreach ($path in $WinSDKPaths) {
        $SignTool = Get-ChildItem $path -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($SignTool) {
            $SignToolPath = $SignTool.FullName
            break
        }
    }
    
    if (-not $SignTool) {
        Write-ColorOutput $Red "❌ signtool.exe not found. Please install Windows SDK."
        exit 1
    }
} else {
    $SignToolPath = $SignTool.Source
}

Write-ColorOutput $Green "✅ Found signtool: $SignToolPath"

# Find executables and installers to sign
$FilesToSign = @()

# Find main executable
$MainExe = Get-ChildItem "$BuildPath\GrabZilla*.exe" -ErrorAction SilentlyContinue
if ($MainExe) {
    $FilesToSign += $MainExe.FullName
}

# Find MSI installers
$MsiFiles = Get-ChildItem "$BuildPath\bundle\msi\*.msi" -ErrorAction SilentlyContinue
if ($MsiFiles) {
    $FilesToSign += $MsiFiles.FullName
}

# Find NSIS installers
$NsisFiles = Get-ChildItem "$BuildPath\bundle\nsis\*.exe" -ErrorAction SilentlyContinue
if ($NsisFiles) {
    $FilesToSign += $NsisFiles.FullName
}

if ($FilesToSign.Count -eq 0) {
    Write-ColorOutput $Yellow "⚠️  No files found to sign in $BuildPath"
    exit 0
}

Write-ColorOutput $Blue "📦 Found $($FilesToSign.Count) file(s) to process:"
foreach ($file in $FilesToSign) {
    Write-ColorOutput $Blue "   - $(Split-Path $file -Leaf)"
}

if ($VerifyOnly) {
    Write-ColorOutput $Blue "🔍 Verifying signatures..."
    
    foreach ($file in $FilesToSign) {
        Write-ColorOutput $Blue "Verifying: $(Split-Path $file -Leaf)"
        
        & $SignToolPath verify /pa /v $file
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput $Green "✅ Valid signature"
        } else {
            Write-ColorOutput $Red "❌ Invalid or missing signature"
        }
    }
    exit 0
}

# Check certificate
if (-not $CertificateThumbprint) {
    Write-ColorOutput $Red "❌ Certificate thumbprint not provided."
    Write-ColorOutput $Yellow "   Set WINDOWS_CERT_THUMBPRINT environment variable or use -CertificateThumbprint parameter"
    exit 1
}

Write-ColorOutput $Blue "🔑 Using certificate: $CertificateThumbprint"

# Verify certificate exists in store
$Certificate = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Thumbprint -eq $CertificateThumbprint }
if (-not $Certificate) {
    $Certificate = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.Thumbprint -eq $CertificateThumbprint }
}

if (-not $Certificate) {
    Write-ColorOutput $Red "❌ Certificate with thumbprint $CertificateThumbprint not found in certificate store"
    exit 1
}

Write-ColorOutput $Green "✅ Certificate found: $($Certificate.Subject)"

# Sign each file
foreach ($file in $FilesToSign) {
    $fileName = Split-Path $file -Leaf
    Write-ColorOutput $Blue "🔏 Signing: $fileName"
    
    # Sign with timestamp
    $SignArgs = @(
        "sign"
        "/sha1", $CertificateThumbprint
        "/fd", "SHA256"
        "/tr", $TimestampUrl
        "/td", "SHA256"
        "/v"
        $file
    )
    
    & $SignToolPath @SignArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput $Green "✅ Successfully signed: $fileName"
        
        # Verify the signature
        Write-ColorOutput $Blue "🔍 Verifying signature..."
        & $SignToolPath verify /pa /v $file
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput $Green "✅ Signature verification passed"
        } else {
            Write-ColorOutput $Red "❌ Signature verification failed"
        }
    } else {
        Write-ColorOutput $Red "❌ Failed to sign: $fileName"
        exit 1
    }
}

# Final security check
Write-ColorOutput $Blue "🔒 Running final security checks..."

foreach ($file in $FilesToSign) {
    $fileName = Split-Path $file -Leaf
    Write-ColorOutput $Blue "Checking: $fileName"
    
    # Get file info
    $FileInfo = Get-ItemProperty $file
    Write-ColorOutput $Blue "  Size: $([math]::Round($FileInfo.Length / 1MB, 2)) MB"
    Write-ColorOutput $Blue "  Modified: $($FileInfo.LastWriteTime)"
    
    # Check if file is signed
    $Signature = Get-AuthenticodeSignature $file
    if ($Signature.Status -eq "Valid") {
        Write-ColorOutput $Green "  ✅ Valid digital signature"
        Write-ColorOutput $Blue "  Subject: $($Signature.SignerCertificate.Subject)"
        Write-ColorOutput $Blue "  Issuer: $($Signature.SignerCertificate.Issuer)"
        Write-ColorOutput $Blue "  Valid from: $($Signature.SignerCertificate.NotBefore)"
        Write-ColorOutput $Blue "  Valid until: $($Signature.SignerCertificate.NotAfter)"
    } else {
        Write-ColorOutput $Red "  ❌ Signature status: $($Signature.Status)"
    }
}

Write-ColorOutput $Green "🎉 Windows code signing completed successfully!"

# Display signed files
Write-ColorOutput $Blue "📦 Signed files:"
foreach ($file in $FilesToSign) {
    Write-ColorOutput $Green "  ✅ $file"
}