pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the window could not be started");
}
