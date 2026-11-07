use std::ffi::OsString;
use std::path::PathBuf;

fn desktop_launch_directories() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["/opt/homebrew/bin", "/usr/local/bin"]
    } else if cfg!(target_os = "linux") {
        &["/usr/local/bin", "/snap/bin"]
    } else {
        &[]
    }
}

pub fn path_with_extras(existing: Option<OsString>, extras: &[&str]) -> OsString {
    let mut entries: Vec<PathBuf> = existing
        .as_ref()
        .map(|value| std::env::split_paths(value).collect())
        .unwrap_or_default();
    for extra in extras {
        let candidate = PathBuf::from(extra);
        if !entries.contains(&candidate) {
            entries.push(candidate);
        }
    }
    std::env::join_paths(entries).unwrap_or_else(|_| existing.unwrap_or_default())
}

pub fn extend_search_path() {
    let extras = desktop_launch_directories();
    if extras.is_empty() {
        return;
    }
    let merged = path_with_extras(std::env::var_os("PATH"), extras);
    std::env::set_var("PATH", merged);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(value: &OsString) -> Vec<PathBuf> {
        std::env::split_paths(value).collect()
    }

    #[test]
    fn missing_directories_are_appended_after_the_existing_ones() {
        let existing = std::env::join_paths(["/usr/bin", "/bin"]).expect("join");
        let merged = path_with_extras(Some(existing), &["/opt/homebrew/bin", "/usr/local/bin"]);
        assert_eq!(
            entries(&merged),
            vec![
                PathBuf::from("/usr/bin"),
                PathBuf::from("/bin"),
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
            ]
        );
    }

    #[test]
    fn directories_that_are_already_present_are_not_repeated() {
        let existing = std::env::join_paths(["/usr/local/bin", "/usr/bin"]).expect("join");
        let merged = path_with_extras(Some(existing), &["/usr/local/bin", "/snap/bin"]);
        assert_eq!(
            entries(&merged),
            vec![
                PathBuf::from("/usr/local/bin"),
                PathBuf::from("/usr/bin"),
                PathBuf::from("/snap/bin"),
            ]
        );
    }

    #[test]
    fn a_missing_path_variable_becomes_just_the_extras() {
        let merged = path_with_extras(None, &["/usr/local/bin"]);
        assert_eq!(entries(&merged), vec![PathBuf::from("/usr/local/bin")]);
    }
}
