#!/bin/bash

# GrabZilla 2.0 - Signed Build Script
# This script builds and signs the application for production release

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="GrabZilla 2.0"
BUNDLE_ID="com.grabzilla.app"
BUILD_TYPE="${BUILD_TYPE:-release}"
SIGN_IDENTITY="${MACOS_SIGN_IDENTITY:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_PASSWORD="${APPLE_PASSWORD:-}"

echo -e "${BLUE}🚀 Starting signed build for ${APP_NAME}${NC}"

# Check if we're on macOS for code signing
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}📋 macOS detected - checking signing requirements${NC}"
    
    if [ -z "$SIGN_IDENTITY" ]; then
        echo -e "${YELLOW}⚠️  No signing identity provided. Building without code signing.${NC}"
        echo -e "${YELLOW}   Set MACOS_SIGN_IDENTITY environment variable for code signing.${NC}"
    else
        echo -e "${GREEN}✅ Signing identity: $SIGN_IDENTITY${NC}"
        
        # Verify the signing identity exists
        if ! security find-identity -v -p codesigning | grep -q "$SIGN_IDENTITY"; then
            echo -e "${RED}❌ Signing identity '$SIGN_IDENTITY' not found in keychain${NC}"
            exit 1
        fi
    fi
fi

# Check for Windows signing certificate
if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
    echo -e "${BLUE}📋 Windows detected - checking signing requirements${NC}"
    
    if [ -z "${WINDOWS_CERT_THUMBPRINT:-}" ]; then
        echo -e "${YELLOW}⚠️  No certificate thumbprint provided. Building without code signing.${NC}"
        echo -e "${YELLOW}   Set WINDOWS_CERT_THUMBPRINT environment variable for code signing.${NC}"
    else
        echo -e "${GREEN}✅ Certificate thumbprint: ${WINDOWS_CERT_THUMBPRINT}${NC}"
    fi
fi

# Build frontend
echo -e "${BLUE}🔧 Building frontend...${NC}"
cd "$(dirname "$0")/.."
npm run build

# Build Tauri application
echo -e "${BLUE}🔧 Building Tauri application...${NC}"
cd src-tauri

if [ "$BUILD_TYPE" = "release" ]; then
    echo -e "${BLUE}🎯 Building release version${NC}"
    
    # Update tauri.conf.json with signing information
    if [[ "$OSTYPE" == "darwin"* ]] && [ -n "$SIGN_IDENTITY" ]; then
        echo -e "${BLUE}🔑 Configuring macOS code signing${NC}"
        
        # Create temporary config with signing info
        jq --arg identity "$SIGN_IDENTITY" \
           --arg teamId "$TEAM_ID" \
           --arg appleId "$APPLE_ID" \
           '.bundle.macOS.signingIdentity = $identity |
            .bundle.macOS.notarization.teamId = $teamId |
            .bundle.macOS.notarization.appleId = $appleId' \
            tauri.conf.json > tauri.conf.json.tmp
        
        mv tauri.conf.json.tmp tauri.conf.json
    fi
    
    if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
        if [ -n "${WINDOWS_CERT_THUMBPRINT:-}" ]; then
            echo -e "${BLUE}🔑 Configuring Windows code signing${NC}"
            
            # Update config with Windows signing info
            jq --arg thumbprint "$WINDOWS_CERT_THUMBPRINT" \
               --arg timestamp "${WINDOWS_TIMESTAMP_URL:-http://timestamp.sectigo.com}" \
               '.bundle.windows.certificateThumbprint = $thumbprint |
                .bundle.windows.timestampUrl = $timestamp' \
                tauri.conf.json > tauri.conf.json.tmp
            
            mv tauri.conf.json.tmp tauri.conf.json
        fi
    fi
    
    # Build with release profile
    cargo tauri build --verbose
else
    echo -e "${BLUE}🛠️  Building debug version${NC}"
    cargo tauri build --debug --verbose
fi

# Post-build validation
echo -e "${BLUE}🔍 Validating build artifacts...${NC}"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # Check macOS app signature
    APP_PATH="src-tauri/target/${BUILD_TYPE}/bundle/macos/${APP_NAME}.app"
    if [ -d "$APP_PATH" ]; then
        echo -e "${BLUE}📱 Validating macOS app bundle...${NC}"
        
        # Check code signature
        if codesign -v "$APP_PATH" 2>/dev/null; then
            echo -e "${GREEN}✅ Code signature is valid${NC}"
            
            # Display signature info
            codesign -dv --verbose=4 "$APP_PATH" 2>&1 | head -10
        else
            echo -e "${YELLOW}⚠️  App is not code signed${NC}"
        fi
        
        # Check if app is notarized (for release builds)
        if [ "$BUILD_TYPE" = "release" ] && [ -n "$APPLE_ID" ]; then
            echo -e "${BLUE}🔍 Checking notarization status...${NC}"
            spctl -a -v "$APP_PATH" || echo -e "${YELLOW}⚠️  App is not notarized${NC}"
        fi
    fi
fi

if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
    # Check Windows executable signature
    EXE_PATH="src-tauri/target/${BUILD_TYPE}/${APP_NAME}.exe"
    if [ -f "$EXE_PATH" ]; then
        echo -e "${BLUE}📱 Validating Windows executable...${NC}"
        
        # Note: On Windows, use signtool or PowerShell to verify signatures
        echo -e "${YELLOW}ℹ️  Use 'signtool verify /pa \"$EXE_PATH\"' to verify signature${NC}"
    fi
fi

# Security validation
echo -e "${BLUE}🔒 Running security validation...${NC}"

# Check for common security issues
echo -e "${BLUE}🔍 Checking for hardcoded secrets...${NC}"
if grep -r -i "password\|secret\|key" src/ --exclude-dir=node_modules --exclude="*.lock" | grep -v "TODO\|FIXME\|example" | head -5; then
    echo -e "${YELLOW}⚠️  Potential secrets found - review before release${NC}"
else
    echo -e "${GREEN}✅ No obvious secrets detected${NC}"
fi

# Check dependencies for vulnerabilities
echo -e "${BLUE}🔍 Checking for vulnerable dependencies...${NC}"
if command -v npm &> /dev/null; then
    npm audit --audit-level=high --production || echo -e "${YELLOW}⚠️  Vulnerabilities found in dependencies${NC}"
fi

if command -v cargo &> /dev/null; then
    if command -v cargo-audit &> /dev/null; then
        cargo audit || echo -e "${YELLOW}⚠️  Vulnerabilities found in Rust dependencies${NC}"
    else
        echo -e "${YELLOW}ℹ️  Install cargo-audit for Rust dependency scanning${NC}"
    fi
fi

echo -e "${GREEN}🎉 Build completed successfully!${NC}"

# Display build artifacts
echo -e "${BLUE}📦 Build artifacts:${NC}"
if [ "$BUILD_TYPE" = "release" ]; then
    find src-tauri/target/release/bundle/ -name "*${APP_NAME}*" -o -name "*.dmg" -o -name "*.msi" -o -name "*.deb" -o -name "*.AppImage" 2>/dev/null | head -10
else
    find src-tauri/target/debug/bundle/ -name "*${APP_NAME}*" 2>/dev/null | head -5
fi

echo -e "${GREEN}✨ Signed build process complete!${NC}"