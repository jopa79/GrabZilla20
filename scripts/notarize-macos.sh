#!/bin/bash

# GrabZilla 2.0 - macOS Notarization Script
# This script handles the complete notarization process for macOS distribution

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
APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/${APP_NAME}.dmg"

# Apple Developer credentials (from environment)
APPLE_ID="${APPLE_ID:-}"
APPLE_PASSWORD="${APPLE_PASSWORD:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
KEYCHAIN_PROFILE="${KEYCHAIN_PROFILE:-grabzilla-notarization}"

echo -e "${BLUE}🍎 Starting macOS notarization process for ${APP_NAME}${NC}"

# Check required environment variables
check_credentials() {
    echo -e "${BLUE}🔍 Checking Apple Developer credentials...${NC}"
    
    if [ -z "$APPLE_ID" ]; then
        echo -e "${RED}❌ APPLE_ID environment variable not set${NC}"
        exit 1
    fi
    
    if [ -z "$APPLE_PASSWORD" ]; then
        echo -e "${RED}❌ APPLE_PASSWORD environment variable not set${NC}"
        echo -e "${YELLOW}   Use app-specific password, not your Apple ID password${NC}"
        exit 1
    fi
    
    if [ -z "$APPLE_TEAM_ID" ]; then
        echo -e "${RED}❌ APPLE_TEAM_ID environment variable not set${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Apple Developer credentials configured${NC}"
    echo -e "${BLUE}   Apple ID: $APPLE_ID${NC}"
    echo -e "${BLUE}   Team ID: $APPLE_TEAM_ID${NC}"
}

# Check if required tools are installed
check_tools() {
    echo -e "${BLUE}🛠️  Checking required tools...${NC}"
    
    if ! command -v xcrun &> /dev/null; then
        echo -e "${RED}❌ Xcode Command Line Tools not installed${NC}"
        echo -e "${YELLOW}   Install with: xcode-select --install${NC}"
        exit 1
    fi
    
    if ! command -v codesign &> /dev/null; then
        echo -e "${RED}❌ codesign not found${NC}"
        exit 1
    fi
    
    if ! command -v ditto &> /dev/null; then
        echo -e "${RED}❌ ditto not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All required tools are available${NC}"
}

# Store notarization credentials in keychain
setup_keychain_profile() {
    echo -e "${BLUE}🔐 Setting up keychain profile for notarization...${NC}"
    
    # Store credentials in keychain
    xcrun notarytool store-credentials "$KEYCHAIN_PROFILE" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --validate
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Keychain profile '$KEYCHAIN_PROFILE' configured successfully${NC}"
    else
        echo -e "${RED}❌ Failed to configure keychain profile${NC}"
        exit 1
    fi
}

# Verify app bundle structure and signing
verify_app_bundle() {
    echo -e "${BLUE}🔍 Verifying app bundle...${NC}"
    
    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}❌ App bundle not found: $APP_PATH${NC}"
        echo -e "${YELLOW}   Run 'cargo tauri build' first${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📱 App bundle found: $APP_PATH${NC}"
    
    # Check bundle structure
    if [ ! -f "$APP_PATH/Contents/MacOS/GrabZilla 2.0" ]; then
        echo -e "${RED}❌ Main executable not found in bundle${NC}"
        exit 1
    fi
    
    if [ ! -f "$APP_PATH/Contents/Info.plist" ]; then
        echo -e "${RED}❌ Info.plist not found in bundle${NC}"
        exit 1
    fi
    
    # Verify code signature
    echo -e "${BLUE}🔏 Verifying code signature...${NC}"
    
    codesign --verify --verbose=4 --strict "$APP_PATH"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Code signature is valid${NC}"
    else
        echo -e "${RED}❌ Code signature verification failed${NC}"
        exit 1
    fi
    
    # Display signature details
    echo -e "${BLUE}📋 Signature details:${NC}"
    codesign -dv --verbose=4 "$APP_PATH" 2>&1 | head -10
}

# Create and sign DMG
create_dmg() {
    echo -e "${BLUE}💽 Creating DMG...${NC}"
    
    # Remove existing DMG
    if [ -f "$DMG_PATH" ]; then
        rm "$DMG_PATH"
        echo -e "${YELLOW}🗑️  Removed existing DMG${NC}"
    fi
    
    # Create DMG directory structure
    DMG_DIR="$(dirname "$DMG_PATH")"
    mkdir -p "$DMG_DIR"
    
    TEMP_DMG_DIR=$(mktemp -d)
    echo -e "${BLUE}📁 Using temporary directory: $TEMP_DMG_DIR${NC}"
    
    # Copy app to temp directory
    cp -R "$APP_PATH" "$TEMP_DMG_DIR/"
    
    # Create Applications symlink for easy installation
    ln -s /Applications "$TEMP_DMG_DIR/Applications"
    
    # Create DMG
    hdiutil create -srcfolder "$TEMP_DMG_DIR" \
        -volname "$APP_NAME" \
        -fs HFS+ \
        -fsargs "-c c=64,a=16,e=16" \
        -format UDBZ \
        -size 300m \
        "$DMG_PATH"
    
    # Clean up temp directory
    rm -rf "$TEMP_DMG_DIR"
    
    if [ -f "$DMG_PATH" ]; then
        echo -e "${GREEN}✅ DMG created: $DMG_PATH${NC}"
    else
        echo -e "${RED}❌ Failed to create DMG${NC}"
        exit 1
    fi
    
    # Sign the DMG
    echo -e "${BLUE}🔏 Signing DMG...${NC}"
    
    # Get signing identity from existing app signature
    SIGNING_IDENTITY=$(codesign -dv "$APP_PATH" 2>&1 | grep "Authority=" | head -1 | sed 's/Authority=//')
    
    if [ -n "$SIGNING_IDENTITY" ]; then
        codesign --sign "$SIGNING_IDENTITY" --timestamp "$DMG_PATH"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ DMG signed successfully${NC}"
        else
            echo -e "${RED}❌ Failed to sign DMG${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  Could not determine signing identity from app${NC}"
    fi
}

# Submit for notarization
submit_for_notarization() {
    echo -e "${BLUE}📤 Submitting for notarization...${NC}"
    
    # Submit DMG for notarization
    echo -e "${BLUE}🚀 Uploading to Apple for notarization...${NC}"
    
    SUBMISSION_ID=$(xcrun notarytool submit "$DMG_PATH" \
        --keychain-profile "$KEYCHAIN_PROFILE" \
        --wait --timeout 30m \
        --output-format json | jq -r '.id')
    
    if [ "$SUBMISSION_ID" = "null" ] || [ -z "$SUBMISSION_ID" ]; then
        echo -e "${RED}❌ Failed to submit for notarization${NC}"
        
        # Show submission history for debugging
        echo -e "${BLUE}📋 Recent submission history:${NC}"
        xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" | head -5
        exit 1
    fi
    
    echo -e "${GREEN}✅ Submitted for notarization${NC}"
    echo -e "${BLUE}   Submission ID: $SUBMISSION_ID${NC}"
    
    # Check notarization status
    echo -e "${BLUE}⏳ Waiting for notarization to complete...${NC}"
    
    xcrun notarytool wait "$SUBMISSION_ID" --keychain-profile "$KEYCHAIN_PROFILE"
    NOTARIZATION_STATUS=$?
    
    if [ $NOTARIZATION_STATUS -eq 0 ]; then
        echo -e "${GREEN}✅ Notarization completed successfully!${NC}"
    else
        echo -e "${RED}❌ Notarization failed${NC}"
        
        # Get detailed log
        echo -e "${BLUE}📋 Notarization log:${NC}"
        xcrun notarytool log "$SUBMISSION_ID" --keychain-profile "$KEYCHAIN_PROFILE"
        exit 1
    fi
}

# Staple the notarization ticket
staple_ticket() {
    echo -e "${BLUE}📎 Stapling notarization ticket...${NC}"
    
    # Staple to DMG
    xcrun stapler staple "$DMG_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Notarization ticket stapled to DMG${NC}"
    else
        echo -e "${RED}❌ Failed to staple notarization ticket to DMG${NC}"
        exit 1
    fi
    
    # Also staple to app bundle
    xcrun stapler staple "$APP_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Notarization ticket stapled to app bundle${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to staple notarization ticket to app bundle${NC}"
    fi
}

# Verify notarization
verify_notarization() {
    echo -e "${BLUE}🔍 Verifying notarization...${NC}"
    
    # Verify DMG
    spctl -a -t open --context context:primary-signature -v "$DMG_PATH"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ DMG notarization verified${NC}"
    else
        echo -e "${RED}❌ DMG notarization verification failed${NC}"
        exit 1
    fi
    
    # Verify app bundle
    spctl -a -v "$APP_PATH"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ App bundle notarization verified${NC}"
    else
        echo -e "${RED}❌ App bundle notarization verification failed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}🎉 All notarization checks passed!${NC}"
}

# Display final information
show_final_info() {
    echo -e "${BLUE}📊 Final distribution information:${NC}"
    echo -e "${GREEN}✅ Notarized DMG: $DMG_PATH${NC}"
    echo -e "${GREEN}✅ Notarized App: $APP_PATH${NC}"
    
    # File sizes
    DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)
    APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
    
    echo -e "${BLUE}📏 DMG Size: $DMG_SIZE${NC}"
    echo -e "${BLUE}📏 App Size: $APP_SIZE${NC}"
    
    # Checksums for integrity verification
    echo -e "${BLUE}🔐 SHA-256 Checksums:${NC}"
    echo -e "${BLUE}   DMG: $(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)${NC}"
    
    echo -e "${GREEN}🚀 Ready for distribution!${NC}"
    echo -e "${BLUE}ℹ️  The DMG can be safely distributed and will pass Gatekeeper checks${NC}"
}

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up temporary files...${NC}"
    # Remove keychain profile if created during this session
    # (Keep it for future runs unless explicitly requested to remove)
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Starting macOS notarization process${NC}"
    
    # Setup trap for cleanup
    trap cleanup EXIT
    
    # Run all steps
    check_credentials
    check_tools
    setup_keychain_profile
    verify_app_bundle
    create_dmg
    submit_for_notarization
    staple_ticket
    verify_notarization
    show_final_info
    
    echo -e "${GREEN}🎉 macOS notarization completed successfully!${NC}"
}

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This script must be run on macOS${NC}"
    exit 1
fi

# Run main function
main "$@"