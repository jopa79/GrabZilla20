# GrabZilla 2.0 - Advanced Modules Fix Plan

## Overview

This document outlines a step-by-step plan to incrementally enable and fix the advanced modules in the GrabZilla 2.0 application.

## Step 1: Add Missing Dependencies

```bash
# Add missing Tauri updater plugin
cd src-tauri
cargo add tauri-plugin-updater
```

## Step 2: Fix Common Code Errors

### 1. Fix `download_manager.rs`

- Line 352: Replace `ffmpeg_controller.as_ref()` with `self.ffmpeg_controller.as_ref()`
- Line 482: Replace `active_downloads.lock()` with `self.active_downloads.lock()`
- Line 383: Fix type mismatch between `ConversionProgress` and `DownloadProgress`
- Line 226: Fix lifetime issue with `tokio::spawn` and `self`

### 2. Fix `ffmpeg_controller.rs`

- Line 141: Fix the partial move of `child.stdout`
- Line 226: Fix unused variable warning (add underscore prefix)

### 3. Fix `secure_process.rs`

- Line 85: Fix orphan rule violation for `impl From<Command> for AsyncCommand`
- Lines 31, 45: Remove unnecessary `mut` keywords

### 4. Fix `update_manager.rs`

- Line 72: Fix missing `updater_builder` method
- Line 151: Fix unsized local variable issue with `[u8]`
- Line 299: Fix unused variable warning (add underscore prefix)
- Line 192: Fix unused variable warning (add underscore prefix)

## Step 3: Incremental Module Enabling

Enable modules one by one in the following order, fixing issues as they arise:

1. **url_parser.rs** (already enabled)
2. **progress_tracker.rs**
3. **retry_manager.rs**
4. **security_manager.rs**
5. **secure_process.rs**
6. **ffmpeg_controller.rs**
7. **download_manager.rs**
8. **update_manager.rs** (requires additional dependency)

## Step 4: Update `lib.rs` with Fixed Modules

```rust
mod url_parser;
mod commands_simple;
// Enable fixed modules one by one
mod progress_tracker;
mod retry_manager;
mod security_manager;
mod secure_process;
mod ffmpeg_controller;
mod download_manager;
mod update_manager;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Enable updater plugin once fixed
      // app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // Gradually replace with full commands
      commands::extract_urls_from_text,
      commands::get_supported_platforms,
      commands::validate_single_url,
      commands::clean_url,
      commands::get_default_download_dir,
      // Add more commands as modules are fixed
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

## Step 5: Test Each Module After Enabling

After enabling each module:

1. Run `npm run tauri dev` to check for compilation errors
2. Fix any new issues that arise
3. Test the functionality related to that module
4. Document any issues or fixes needed

## Step 6: Final Integration

Once all modules are fixed and enabled:

1. Enable all commands in `lib.rs`
2. Run comprehensive tests for all phases
3. Update the test report with the results 