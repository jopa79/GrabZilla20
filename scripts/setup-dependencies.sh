#!/bin/bash

echo "GrabZilla 2.0 - Dependency Setup Script"
echo "======================================"
echo

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macOS"
  PACKAGE_MANAGER="brew"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="Linux"
  if command_exists apt; then
    PACKAGE_MANAGER="apt"
  elif command_exists dnf; then
    PACKAGE_MANAGER="dnf"
  elif command_exists pacman; then
    PACKAGE_MANAGER="pacman"
  else
    PACKAGE_MANAGER="unknown"
  fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  OS="Windows"
  PACKAGE_MANAGER="choco"
else
  OS="Unknown"
  PACKAGE_MANAGER="unknown"
fi

echo "Detected OS: $OS"
echo "Detected package manager: $PACKAGE_MANAGER"
echo

# Check for yt-dlp
echo "Checking for yt-dlp..."
if command_exists yt-dlp; then
  YT_DLP_VERSION=$(yt-dlp --version)
  echo "✅ yt-dlp is installed (version $YT_DLP_VERSION)"
else
  echo "❌ yt-dlp not found"
  
  case $PACKAGE_MANAGER in
    brew)
      echo "Installing yt-dlp with Homebrew..."
      brew install yt-dlp
      ;;
    apt)
      echo "Installing yt-dlp with apt..."
      sudo apt update
      sudo apt install python3-pip -y
      sudo pip3 install yt-dlp
      ;;
    dnf)
      echo "Installing yt-dlp with dnf..."
      sudo dnf install python3-pip -y
      sudo pip3 install yt-dlp
      ;;
    pacman)
      echo "Installing yt-dlp with pacman..."
      sudo pacman -S yt-dlp
      ;;
    choco)
      echo "Installing yt-dlp with Chocolatey..."
      if command_exists choco; then
        choco install yt-dlp -y
      else
        echo "Chocolatey not found. Please install Chocolatey or manually install yt-dlp."
        echo "Visit: https://github.com/yt-dlp/yt-dlp#installation"
      fi
      ;;
    *)
      echo "Please install yt-dlp manually:"
      echo "pip install yt-dlp"
      echo "Visit: https://github.com/yt-dlp/yt-dlp#installation"
      ;;
  esac
fi

echo

# Check for FFmpeg
echo "Checking for FFmpeg..."
if command_exists ffmpeg; then
  FFMPEG_VERSION=$(ffmpeg -version | head -n 1)
  echo "✅ FFmpeg is installed ($FFMPEG_VERSION)"
else
  echo "❌ FFmpeg not found"
  
  case $PACKAGE_MANAGER in
    brew)
      echo "Installing FFmpeg with Homebrew..."
      brew install ffmpeg
      ;;
    apt)
      echo "Installing FFmpeg with apt..."
      sudo apt update
      sudo apt install ffmpeg -y
      ;;
    dnf)
      echo "Installing FFmpeg with dnf..."
      sudo dnf install ffmpeg -y
      ;;
    pacman)
      echo "Installing FFmpeg with pacman..."
      sudo pacman -S ffmpeg
      ;;
    choco)
      echo "Installing FFmpeg with Chocolatey..."
      if command_exists choco; then
        choco install ffmpeg -y
      else
        echo "Chocolatey not found. Please install Chocolatey or manually install FFmpeg."
        echo "Visit: https://ffmpeg.org/download.html"
      fi
      ;;
    *)
      echo "Please install FFmpeg manually:"
      echo "Visit: https://ffmpeg.org/download.html"
      ;;
  esac
fi

echo
echo "Dependency check complete!"
echo "If any dependencies were installed, you may need to restart your terminal."
echo 