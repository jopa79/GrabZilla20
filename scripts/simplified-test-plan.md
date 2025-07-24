# GrabZilla 2.0 - Simplified Test Plan

## Overview

This simplified test plan focuses on the currently enabled functionality in Phase 1 (Foundation) and Phase 2 (Smart URL Extraction).

## Phase 1: Foundation Testing

### 1. UI Components

- **Dark Theme**: Verify the dark theme is correctly applied with gradient background (#1A1A1A to #2D2D2D)
- **URL Input**: Test the multi-line text input field with auto-resize functionality
- **Download Queue**: Check the virtual scrolling implementation (empty at first)
- **Layout**: Verify the overall layout matches the design

### 2. Basic Functionality

- **Clipboard Paste**: Test pasting URLs from clipboard
- **File Upload**: Try uploading a .txt file with URLs
- **Clear Button**: Test clearing the input field
- **Input Validation**: Check if URL validation works

## Phase 2: Smart URL Extraction Testing

### 1. URL Parsing

- **Single URL**: Test extracting a single YouTube URL
- **Multiple URLs**: Test extracting multiple URLs from pasted text
- **Platform Detection**: Verify correct platform detection (YouTube, Vimeo, etc.)
- **Playlist Detection**: Check if YouTube playlists are correctly identified

### 2. URL Cleaning

- **Tracking Parameters**: Verify removal of tracking parameters (utm_*, etc.)
- **Duplicate Removal**: Test deduplication of identical URLs
- **URL Expansion**: Check if shortened URLs are expanded

### 3. Extraction Modal

- **Preview Dialog**: Verify the URL extraction preview dialog appears
- **Selection**: Test selecting/deselecting URLs in the dialog
- **Confirmation**: Check if selected URLs are added to the queue

## Test URLs

```
# Single URLs
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://vimeo.com/148751763

# Playlist
https://www.youtube.com/playlist?list=PLFs4vir_WsTwEd-nJgVJCZPNL3HALHHpF

# Multiple URLs in text
Here's a YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
And a Vimeo video: https://vimeo.com/148751763
And a YouTube playlist: https://www.youtube.com/playlist?list=PLFs4vir_WsTwEd-nJgVJCZPNL3HALHHpF

# URL with tracking parameters
https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=test&utm_medium=test
```

## Expected Results

1. The application should correctly extract URLs from pasted text
2. The extraction modal should show all extracted URLs
3. URLs should be cleaned (tracking parameters removed)
4. Platform types should be correctly identified
5. Playlists should be marked as such
6. Selected URLs should be added to the queue

## Notes

- Advanced functionality (downloading, transcoding, etc.) is currently disabled
- This test plan focuses only on the URL extraction and UI components 