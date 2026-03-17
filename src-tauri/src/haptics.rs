#[cfg(target_os = "ios")]
use tauri::Manager;

#[tauri::command]
pub(crate) fn trigger_haptic_feedback(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        if let Some(window) = app_handle.get_webview_window("main") {
            window
                .run_on_main_thread(move || unsafe {
                    use objc2::runtime::{AnyClass, AnyObject};
                    use std::ffi::CString;

                    let class_name =
                        CString::new("UISelectionFeedbackGenerator").expect("valid class name");
                    let Some(generator_class) = AnyClass::get(class_name.as_c_str()) else {
                        return;
                    };
                    let generator: *mut AnyObject = objc2::msg_send![generator_class, new];
                    if generator.is_null() {
                        return;
                    }
                    let () = objc2::msg_send![generator, prepare];
                    let () = objc2::msg_send![generator, selectionChanged];
                    let () = objc2::msg_send![generator, release];
                })
                .map_err(|error| error.to_string())?;
        }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = app_handle;
    }

    Ok(())
}
