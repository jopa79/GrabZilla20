# GrabZilla 2.0 - Dependency Setup Script (Windows)
Write-Host "GrabZilla 2.0 - Dependency Setup Script (Windows)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-CommandExists {
    param ($command)
    $exists = $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
    return $exists
}

# Check for Chocolatey
Write-Host "Checking for Chocolatey package manager..."
if (Test-CommandExists "choco") {
    $chocoVersion = (choco --version)
    Write-Host "✓ Chocolatey is installed (version $chocoVersion)" -ForegroundColor Green
} else {
    Write-Host "✗ Chocolatey not found" -ForegroundColor Yellow
    Write-Host "Would you like to install Chocolatey? (y/n)" -ForegroundColor Yellow
    $installChoco = Read-Host
    
    if ($installChoco -eq "y") {
        Write-Host "Installing Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        if (Test-CommandExists "choco") {
            Write-Host "✓ Chocolatey installed successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to install Chocolatey. Please install manually:" -ForegroundColor Red
            Write-Host "https://chocolatey.org/install" -ForegroundColor Red
        }
    } else {
        Write-Host "Skipping Chocolatey installation. Dependencies will need to be installed manually." -ForegroundColor Yellow
    }
}

Write-Host ""

# Check for yt-dlp
Write-Host "Checking for yt-dlp..."
if (Test-CommandExists "yt-dlp") {
    $ytDlpVersion = (yt-dlp --version)
    Write-Host "✓ yt-dlp is installed (version $ytDlpVersion)" -ForegroundColor Green
} else {
    Write-Host "✗ yt-dlp not found" -ForegroundColor Yellow
    
    if (Test-CommandExists "choco") {
        Write-Host "Installing yt-dlp with Chocolatey..."
        choco install yt-dlp -y
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        if (Test-CommandExists "yt-dlp") {
            Write-Host "✓ yt-dlp installed successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to install yt-dlp with Chocolatey" -ForegroundColor Red
        }
    } else {
        Write-Host "Please install yt-dlp manually:" -ForegroundColor Yellow
        Write-Host "Visit: https://github.com/yt-dlp/yt-dlp#installation" -ForegroundColor Yellow
    }
}

Write-Host ""

# Check for FFmpeg
Write-Host "Checking for FFmpeg..."
if (Test-CommandExists "ffmpeg") {
    $ffmpegVersion = (ffmpeg -version | Select-Object -First 1)
    Write-Host "✓ FFmpeg is installed ($ffmpegVersion)" -ForegroundColor Green
} else {
    Write-Host "✗ FFmpeg not found" -ForegroundColor Yellow
    
    if (Test-CommandExists "choco") {
        Write-Host "Installing FFmpeg with Chocolatey..."
        choco install ffmpeg -y
        
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        if (Test-CommandExists "ffmpeg") {
            Write-Host "✓ FFmpeg installed successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to install FFmpeg with Chocolatey" -ForegroundColor Red
        }
    } else {
        Write-Host "Please install FFmpeg manually:" -ForegroundColor Yellow
        Write-Host "Visit: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Dependency check complete!" -ForegroundColor Cyan
Write-Host "If any dependencies were installed, you may need to restart your terminal." -ForegroundColor Cyan 