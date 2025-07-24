mod url_parser;
// Enable the main commands module
mod commands;

// All other modules that are now used by commands.rs
mod security_manager;
mod ffmpeg_controller;
mod download_manager;
mod update_manager;

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
      
      // The updater plugin can be re-enabled now that the manager is fixed
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::extract_urls_from_text,
      commands::get_supported_platforms,
      commands::validate_single_url,
      commands::clean_url,
      commands::get_default_download_dir,
      commands::test_connection,
      commands::get_video_metadata,
      commands::extract_playlist_videos,
      commands::get_basic_video_metadata,
      commands::start_download,
      commands::set_max_concurrent_downloads,
      commands::cancel_download,
      commands::convert_video_file,
      commands::generate_conversion_filename,
      commands::check_file_exists,
      commands::check_privilege_elevation,
      commands::validate_file_path,
      commands::expand_path,
      commands::validate_network_url,
      commands::check_for_updates,
      commands::set_update_channel,
      commands::rollback_update,
      commands::cleanup_old_backups,
      commands::open_download_folder,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
