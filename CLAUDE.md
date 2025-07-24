# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start Vite development server for frontend
- `npm run tauri dev` - Start Tauri development environment (recommended for full-stack development)
- `npm run build` - Build TypeScript and create production bundle
- `npm run preview` - Preview production build

### System Dependencies Setup
- `./scripts/setup-dependencies.sh` (macOS/Linux) - Install yt-dlp and FFmpeg
- `.\scripts\setup-dependencies.ps1` (Windows) - Install system dependencies

### Testing
- Use `test-urls.txt` for testing URL extraction functionality
- Test plan available in `scripts/simplified-test-plan.md`
- Current test results in `scripts/test-report.md`

## Architecture Overview

### Technology Stack
- **Frontend**: React + TypeScript + Vite + Material-UI
- **Backend**: Tauri (Rust) for native system integration
- **State Management**: Zustand for React state
- **External Tools**: yt-dlp for video downloading, FFmpeg for transcoding

### Project Structure
```
src/                    # React frontend
├── components/         # UI components
├── hooks/             # React hooks (useDownloads.ts)
├── services/          # Tauri API integration
├── styles/            # Global styles and theme
└── types/             # TypeScript type definitions

src-tauri/             # Rust backend
├── src/
│   ├── commands.rs          # Tauri command handlers
│   ├── download_manager.rs  # Download orchestration
│   ├── ffmpeg_controller.rs # Video transcoding
│   ├── security_manager.rs  # Security and sandboxing
│   ├── update_manager.rs    # App updates
│   └── url_parser.rs        # URL validation and extraction
└── tauri.conf.json    # Tauri configuration
```

### Key Data Flow
1. **URL Extraction**: Text input → `url_parser.rs` → `ExtractedUrl[]`
2. **Download Management**: URLs → `download_manager.rs` → yt-dlp → FFmpeg (optional)
3. **State Management**: Rust commands → Tauri API → React hooks → UI components

### Core Types
- `DownloadItem` - Represents a single download with progress, status, and metadata
- `ExtractedUrl` - URL validation result with platform detection
- `ConversionFormat` - Supported output formats (H.264, DNxHR, ProRes, MP3)
- `DownloadStatus` - Progress states (queued, downloading, converting, completed, failed)

### Security Architecture
- Process sandboxing via `security_manager.rs`
- Network whitelisting for supported platforms
- File path validation and privilege checking

### Platform Support
Supported platforms defined in `Platform` enum:
- YouTube, Vimeo, Twitch, TikTok, Instagram, Twitter, Facebook, Generic

## Current Development Status

### Working Modules ✅
- URL Parser - Extract and validate URLs from various text formats
- Security Manager - Process sandboxing and validation
- FFmpeg Controller - Video transcoding capabilities
- Download Manager - Core download orchestration

### Known Issues ⚠️
- Update Manager requires `tauri-plugin-updater` dependency
- Advanced features (Phase 3-5) need comprehensive testing
- Command conflicts between simplified and full versions

### Prerequisites
- Node.js v16+
- Rust 1.77.2+
- yt-dlp (latest)
- FFmpeg (latest)