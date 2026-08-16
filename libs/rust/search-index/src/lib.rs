pub struct SearchIndex {
    entries: Vec<String>,
}

impl SearchIndex {
    #[must_use]
    pub fn new() -> SearchIndex {
        SearchIndex {
            entries: Vec::new(),
        }
    }

    pub fn insert(&mut self, entry: &str) {
        self.entries.push(entry.to_lowercase());
    }

    #[must_use]
    pub fn matches(&self, needle: &str) -> Vec<String> {
        let lowered = needle.to_lowercase();
        let mut result = Vec::new();
        for entry in &self.entries {
            if entry.contains(&lowered) {
                result.push(entry.clone());
            }
        }
        result
    }
}

impl Default for SearchIndex {
    fn default() -> SearchIndex {
        SearchIndex::new()
    }
}

#[cfg(test)]
mod tests {
    use super::SearchIndex;

    #[test]
    fn matches_entries_case_insensitively() {
        let mut index = SearchIndex::new();
        index.insert("Open Settings");
        index.insert("Quit App");
        let found = index.matches("SETTINGS");
        assert_eq!(found, vec!["open settings".to_string()]);
    }

    #[test]
    fn returns_nothing_for_an_unknown_needle() {
        let mut index = SearchIndex::new();
        index.insert("Open Settings");
        let found = index.matches("missing");
        assert!(found.is_empty());
    }
}
