use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

/// Represents a cache entry with metadata and content hash
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    /// Content hash (checksum) of the source file
    pub content_hash: u64,
    /// Last modified timestamp
    pub modified_at: u64,
    /// The cached data (AST, metadata, etc.)
    pub data: T,
}

/// Incremental cache manager with persistent storage
pub struct IncrementalCache<T>
where
    T: Serialize + for<'de> Deserialize<'de> + Clone,
{
    /// In-memory cache storage
    memory_cache: Arc<DashMap<String, CacheEntry<T>>>,
    /// Path to the cache directory
    cache_dir: PathBuf,
    /// Cache version (invalidate when structure changes)
    version: String,
}

impl<T> IncrementalCache<T>
where
    T: Serialize + for<'de> Deserialize<'de> + Clone,
{
    /// Create a new incremental cache with specified directory
    pub fn new(cache_dir: impl AsRef<Path>, version: &str) -> Self {
        let cache_dir = cache_dir.as_ref().to_path_buf();
        fs::create_dir_all(&cache_dir).ok();

        Self {
            memory_cache: Arc::new(DashMap::new()),
            cache_dir,
            version: version.to_string(),
        }
    }

    /// Calculate hash for file content
    fn hash_content(content: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        hasher.finish()
    }

    /// Get current timestamp in seconds
    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Get cache file path for a source file
    fn get_cache_path(&self, file_path: &str) -> PathBuf {
        let mut hasher = DefaultHasher::new();
        file_path.hash(&mut hasher);
        self.version.hash(&mut hasher);
        let cache_key = hasher.finish();
        self.cache_dir.join(format!("{:x}.cache", cache_key))
    }

    /// Try to get cached data for a file if still valid
    pub fn get(&self, file_path: &str, content: &str) -> Option<T> {
        let content_hash = Self::hash_content(content);

        // Check memory cache first
        if let Some(entry) = self.memory_cache.get(file_path) {
            if entry.content_hash == content_hash {
                return Some(entry.data.clone());
            }
        }

        // Check disk cache
        let cache_path = self.get_cache_path(file_path);
        if let Ok(cache_data) = fs::read_to_string(&cache_path) {
            if let Ok(entry) = serde_json::from_str::<CacheEntry<T>>(&cache_data) {
                if entry.content_hash == content_hash {
                    // Restore to memory cache
                    self.memory_cache
                        .insert(file_path.to_string(), entry.clone());
                    return Some(entry.data);
                }
            }
        }

        None
    }

    /// Store data in cache
    pub fn set(&self, file_path: &str, content: &str, data: T) {
        let content_hash = Self::hash_content(content);
        let entry = CacheEntry {
            content_hash,
            modified_at: Self::current_timestamp(),
            data: data.clone(),
        };

        // Store in memory
        self.memory_cache
            .insert(file_path.to_string(), entry.clone());

        // Store on disk (async would be better, but keeping it simple)
        let cache_path = self.get_cache_path(file_path);
        if let Ok(json) = serde_json::to_string(&entry) {
            fs::write(cache_path, json).ok();
        }
    }

    /// Clear all caches (memory and disk)
    pub fn clear(&self) {
        self.memory_cache.clear();
        fs::remove_dir_all(&self.cache_dir).ok();
        fs::create_dir_all(&self.cache_dir).ok();
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            memory_entries: self.memory_cache.len(),
            cache_dir: self.cache_dir.display().to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CacheStats {
    pub memory_entries: usize,
    pub cache_dir: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_hit_miss() {
        let temp_dir = std::env::temp_dir().join("perf_linter_test_cache");
        let cache = IncrementalCache::<String>::new(&temp_dir, "1.0");

        let file_path = "test.ts";
        let content = "const x = 1;";
        let data = "parsed_ast".to_string();

        // First access - cache miss
        assert!(cache.get(file_path, content).is_none());

        // Store in cache
        cache.set(file_path, content, data.clone());

        // Second access - cache hit
        assert_eq!(cache.get(file_path, content), Some(data.clone()));

        // Modified content - cache miss
        let new_content = "const x = 2;";
        assert!(cache.get(file_path, new_content).is_none());

        // Cleanup
        fs::remove_dir_all(&temp_dir).ok();
    }

    #[test]
    fn test_persistent_cache() {
        let temp_dir = std::env::temp_dir().join("perf_linter_persist_cache");
        let file_path = "persist.ts";
        let content = "const y = 10;";
        let data = "persistent_data".to_string();

        // Create cache and store data
        {
            let cache = IncrementalCache::<String>::new(&temp_dir, "1.0");
            cache.set(file_path, content, data.clone());
        }

        // Create new cache instance - should load from disk
        {
            let cache = IncrementalCache::<String>::new(&temp_dir, "1.0");
            assert_eq!(cache.get(file_path, content), Some(data));
        }

        // Cleanup
        fs::remove_dir_all(&temp_dir).ok();
    }
}
