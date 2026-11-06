// On Windows the app is a window, never a console one, in a debug build too (a console would open beside it).
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    ohmatrix_tauri_lib::run();
}
