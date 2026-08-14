pub const CHECK_FOR_UPDATES_ID: &str = "xuanji-check-for-updates";
pub const CHECK_FOR_UPDATES_EVENT: &str = "xuanji://check-for-updates";

pub fn check_for_updates_label(locale: &str) -> &'static str {
    if locale == "en" {
        "Check for Updates…"
    } else {
        "检查更新…"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_and_ids_are_stable() {
        assert_eq!(CHECK_FOR_UPDATES_ID, "xuanji-check-for-updates");
        assert_eq!(CHECK_FOR_UPDATES_EVENT, "xuanji://check-for-updates");
        assert_eq!(check_for_updates_label("en"), "Check for Updates…");
        assert_eq!(check_for_updates_label("zh-CN"), "检查更新…");
    }
}
