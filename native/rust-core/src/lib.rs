use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use librqbit::limits::LimitsConfig;
use librqbit::{
    AddTorrent, AddTorrentOptions, AddTorrentResponse, ManagedTorrent, Session, SessionOptions,
    SessionPersistenceConfig, TorrentStatsState,
};
use parking_lot::{Mutex, RwLock};
use tokio::runtime::Runtime;

uniffi::include_scaffolding!("magnet_engine");

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Failed to initialize librqbit session: {reason}")]
    InitializationFailed { reason: String },
    #[error("Invalid magnet URI: {reason}")]
    InvalidMagnetUri { reason: String },
    #[error("Torrent task not found")]
    TorrentNotFound,
    #[error("I/O failure: {reason}")]
    IoFailure { reason: String },
    #[error("Internal error: {reason}")]
    InternalError { reason: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskState {
    Resolving,
    Queued,
    Downloading,
    Paused,
    PolicyPaused,
    Seeding,
    Completed,
    Error,
}

#[derive(Clone, Debug)]
pub struct FileEntry {
    pub index: u32,
    pub path: String,
    pub length: u64,
    pub downloaded_bytes: u64,
    pub selected: bool,
}

#[derive(Clone, Debug)]
pub struct PeerSnapshot {
    pub addr: String,
    pub client_name: String,
    pub download_bps: u64,
    pub upload_bps: u64,
    pub progress_ratio: f32,
}

#[derive(Clone, Debug)]
pub struct TrackerSnapshot {
    pub url: String,
    pub status: String,
    pub peers_found: u32,
}

#[derive(Clone, Debug)]
pub struct TorrentSnapshot {
    pub id: u32,
    pub info_hash: String,
    pub name: String,
    pub magnet_uri: String,
    pub state: TaskState,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
    pub download_bps: u64,
    pub upload_bps: u64,
    pub active_peers: u32,
    pub eta_seconds: Option<u64>,
    pub download_limit_kbps: u32,
    pub upload_limit_kbps: u32,
    pub files: Vec<FileEntry>,
    pub peers: Vec<PeerSnapshot>,
    pub trackers: Vec<TrackerSnapshot>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug)]
pub struct EnginePolicy {
    pub max_concurrent_downloads: u32,
    pub global_download_limit_kbps: u32,
    pub global_upload_limit_kbps: u32,
    pub wifi_only: bool,
    pub charging_only: bool,
    pub fastresume_enabled: bool,
}

pub trait ProgressCallback: Send + Sync {
    fn on_snapshot_updated(
        &self,
        tasks: Vec<TorrentSnapshot>,
        total_down_bps: u64,
        total_up_bps: u64,
    );
    fn on_task_completed(&self, id: u32, name: String);
    fn on_task_error(&self, id: u32, message: String);
}

struct TaskMetadata {
    magnet_uri: String,
    selected_files: Option<HashSet<usize>>,
    user_paused: bool,
    policy_paused: bool,
    queued: bool,
    completed_notified: bool,
    download_limit_kbps: u32,
    upload_limit_kbps: u32,
}

struct NetworkEnv {
    is_wifi: bool,
    is_charging: bool,
}

pub struct MagnetEngine {
    runtime: Arc<Runtime>,
    session: Arc<Session>,
    policy: Arc<RwLock<EnginePolicy>>,
    env: Arc<RwLock<NetworkEnv>>,
    metadata: Arc<Mutex<HashMap<usize, TaskMetadata>>>,
    callback: Arc<Mutex<Option<Box<dyn ProgressCallback>>>>,
}

impl MagnetEngine {
    pub fn new(
        download_dir: String,
        persistence_dir: String,
        initial_policy: EnginePolicy,
    ) -> Result<Self, EngineError> {
        let runtime = Arc::new(
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .worker_threads(4)
                .build()
                .map_err(|e| EngineError::InitializationFailed {
                    reason: e.to_string(),
                })?,
        );

        let persistence_path = PathBuf::from(&persistence_dir);
        let cache_dir = persistence_path.join("dht_cache");
        let _ = std::fs::create_dir_all(&persistence_path);
        let _ = std::fs::create_dir_all(&cache_dir);

        // Android app processes have no HOME or XDG_* environment variables by default,
        // causing librqbit's persistent DHT directory lookup (`directories::ProjectDirs`) to fail.
        std::env::set_var("HOME", &persistence_path);
        std::env::set_var("XDG_CACHE_HOME", &cache_dir);
        std::env::set_var("XDG_CONFIG_HOME", &cache_dir);
        std::env::set_var("XDG_DATA_HOME", &cache_dir);

        let mut opts = SessionOptions::default();
        opts.fastresume = initial_policy.fastresume_enabled;
        opts.persistence = Some(SessionPersistenceConfig::Json {
            folder: Some(persistence_path),
        });
        opts.ratelimits = Self::build_limits(
            initial_policy.global_download_limit_kbps,
            initial_policy.global_upload_limit_kbps,
        );

        let session = runtime
            .block_on(Session::new_with_opts(PathBuf::from(download_dir), opts))
            .map_err(|e| EngineError::InitializationFailed {
                reason: format!("{e:#}"),
            })?;

        let engine = Self {
            runtime,
            session,
            policy: Arc::new(RwLock::new(initial_policy)),
            env: Arc::new(RwLock::new(NetworkEnv {
                is_wifi: true,
                is_charging: false,
            })),
            metadata: Arc::new(Mutex::new(HashMap::new())),
            callback: Arc::new(Mutex::new(None)),
        };

        engine.spawn_monitor_loop();
        Ok(engine)
    }

    fn build_limits(down_kbps: u32, up_kbps: u32) -> LimitsConfig {
        LimitsConfig {
            download_bps: NonZeroU32::new(down_kbps.saturating_mul(1024)),
            upload_bps: NonZeroU32::new(up_kbps.saturating_mul(1024)),
        }
    }

    pub fn register_callback(&self, callback: Box<dyn ProgressCallback>) {
        *self.callback.lock() = Some(callback);
    }

    pub fn add_magnet(
        &self,
        magnet_uri: String,
        only_files: Option<Vec<u32>>,
        start_paused: bool,
    ) -> Result<u32, EngineError> {
        if !magnet_uri.trim().starts_with("magnet:?") {
            return Err(EngineError::InvalidMagnetUri {
                reason: "URI must begin with magnet:?".to_string(),
            });
        }

        let only_files_usize: Option<Vec<usize>> = only_files
            .as_ref()
            .map(|list| list.iter().map(|&idx| idx as usize).collect());

        let selected_set: Option<HashSet<usize>> = only_files_usize
            .as_ref()
            .map(|list| list.iter().copied().collect());

        let add_opts = AddTorrentOptions {
            paused: start_paused,
            only_files: only_files_usize,
            overwrite: true,
            ..Default::default()
        };

        let response = self
            .runtime
            .block_on(
                self.session
                    .add_torrent(AddTorrent::from_url(&magnet_uri), Some(add_opts)),
            )
            .map_err(|e| EngineError::InternalError {
                reason: e.to_string(),
            })?;

        let id = match response {
            AddTorrentResponse::Added(id, _) | AddTorrentResponse::AlreadyManaged(id, _) => id,
            AddTorrentResponse::ListOnly(_) => {
                return Err(EngineError::InternalError {
                    reason: "Unexpected list-only response".to_string(),
                })
            }
        };

        {
            let mut guard = self.metadata.lock();
            guard.insert(
                id,
                TaskMetadata {
                    magnet_uri,
                    selected_files: selected_set,
                    user_paused: start_paused,
                    policy_paused: false,
                    queued: false,
                    completed_notified: false,
                    download_limit_kbps: 0,
                    upload_limit_kbps: 0,
                },
            );
        }

        self.reconcile_queue_and_policy();
        Ok(id as u32)
    }

    pub fn pause_task(&self, id: u32) -> Result<(), EngineError> {
        let handle = self.find_handle(id as usize)?;
        if let Some(meta) = self.metadata.lock().get_mut(&(id as usize)) {
            meta.user_paused = true;
            meta.queued = false;
        }
        self.runtime
            .block_on(self.session.pause(&handle))
            .map_err(|e| EngineError::InternalError {
                reason: e.to_string(),
            })?;
        self.reconcile_queue_and_policy();
        Ok(())
    }

    pub fn resume_task(&self, id: u32) -> Result<(), EngineError> {
        let _ = self.find_handle(id as usize)?;
        if let Some(meta) = self.metadata.lock().get_mut(&(id as usize)) {
            meta.user_paused = false;
        }
        self.reconcile_queue_and_policy();
        Ok(())
    }

    pub fn pause_all(&self) -> Result<(), EngineError> {
        let ids: Vec<usize> = self.metadata.lock().keys().copied().collect();
        for id in ids {
            let _ = self.pause_task(id as u32);
        }
        Ok(())
    }

    pub fn resume_all(&self) -> Result<(), EngineError> {
        {
            let mut meta = self.metadata.lock();
            for item in meta.values_mut() {
                item.user_paused = false;
            }
        }
        self.reconcile_queue_and_policy();
        Ok(())
    }

    pub fn update_only_files(&self, id: u32, file_indices: Vec<u32>) -> Result<(), EngineError> {
        let handle = self.find_handle(id as usize)?;
        let indices: HashSet<usize> = file_indices.iter().map(|&i| i as usize).collect();
        if let Some(meta) = self.metadata.lock().get_mut(&(id as usize)) {
            meta.selected_files = Some(indices.clone());
        }
        self.runtime
            .block_on(self.session.update_only_files(&handle, &indices))
            .map_err(|e| EngineError::InternalError {
                reason: e.to_string(),
            })
    }

    pub fn set_task_rate_limit(
        &self,
        id: u32,
        download_kbps: u32,
        upload_kbps: u32,
    ) -> Result<(), EngineError> {
        let _ = self.find_handle(id as usize)?;
        if let Some(meta) = self.metadata.lock().get_mut(&(id as usize)) {
            meta.download_limit_kbps = download_kbps;
            meta.upload_limit_kbps = upload_kbps;
        }
        Ok(())
    }

    pub fn remove_task(&self, id: u32, delete_files: bool) -> Result<(), EngineError> {
        self.metadata.lock().remove(&(id as usize));
        self.runtime
            .block_on(self.session.delete((id as usize).into(), delete_files))
            .map_err(|e| EngineError::InternalError {
                reason: e.to_string(),
            })
    }

    pub fn update_policy(&self, policy: EnginePolicy) {
        *self.policy.write() = policy;
        self.reconcile_queue_and_policy();
    }

    pub fn apply_network_environment(&self, is_wifi: bool, is_charging: bool) {
        {
            let mut env = self.env.write();
            env.is_wifi = is_wifi;
            env.is_charging = is_charging;
        }
        self.reconcile_queue_and_policy();
    }

    pub fn list_tasks(&self) -> Vec<TorrentSnapshot> {
        let meta_map = self.metadata.lock();
        self.session.with_torrents(|torrents| {
            torrents
                .map(|(id, handle)| self.build_snapshot(id, handle, meta_map.get(&id)))
                .collect()
        })
    }

    fn find_handle(&self, id: usize) -> Result<Arc<ManagedTorrent>, EngineError> {
        self.session
            .get(id.into())
            .ok_or(EngineError::TorrentNotFound)
    }

    fn reconcile_queue_and_policy(&self) {
        let policy = self.policy.read().clone();
        let env = self.env.read();
        let policy_blocked =
            (policy.wifi_only && !env.is_wifi) || (policy.charging_only && !env.is_charging);

        let mut active_slots = 0u32;
        let handles: Vec<(usize, Arc<ManagedTorrent>)> = self
            .session
            .with_torrents(|iter| iter.map(|(id, h)| (id, h.clone())).collect());

        for (id, handle) in handles {
            let stats = handle.stats();
            if stats.finished {
                continue;
            }
            let mut meta_guard = self.metadata.lock();
            let entry = meta_guard.entry(id).or_insert_with(|| TaskMetadata {
                magnet_uri: String::new(),
                selected_files: None,
                user_paused: false,
                policy_paused: false,
                queued: false,
                completed_notified: false,
                download_limit_kbps: 0,
                upload_limit_kbps: 0,
            });

            if entry.user_paused {
                entry.policy_paused = false;
                entry.queued = false;
                continue;
            }

            if policy_blocked {
                entry.policy_paused = true;
                entry.queued = false;
                let session = self.session.clone();
                let h = handle.clone();
                self.runtime.spawn(async move {
                    let _ = session.pause(&h).await;
                });
                continue;
            }

            entry.policy_paused = false;
            if active_slots < policy.max_concurrent_downloads {
                active_slots += 1;
                entry.queued = false;
                let session = self.session.clone();
                let h = handle.clone();
                self.runtime.spawn(async move {
                    let _ = session.unpause(&h).await;
                });
            } else {
                entry.queued = true;
                let session = self.session.clone();
                let h = handle.clone();
                self.runtime.spawn(async move {
                    let _ = session.pause(&h).await;
                });
            }
        }
    }

    fn build_snapshot(
        &self,
        id: usize,
        handle: &Arc<ManagedTorrent>,
        meta: Option<&TaskMetadata>,
    ) -> TorrentSnapshot {
        Self::build_snapshot_inner(id, handle, meta)
    }

    fn build_snapshot_inner(
        id: usize,
        handle: &Arc<ManagedTorrent>,
        meta: Option<&TaskMetadata>,
    ) -> TorrentSnapshot {
        let stats = handle.stats();
        let live = stats.live.as_ref();

        let state = if stats.error.is_some() {
            TaskState::Error
        } else if stats.finished {
            TaskState::Completed
        } else if meta.map(|m| m.policy_paused).unwrap_or(false) {
            TaskState::PolicyPaused
        } else if meta.map(|m| m.queued).unwrap_or(false) {
            TaskState::Queued
        } else {
            match stats.state {
                TorrentStatsState::Initializing => TaskState::Resolving,
                TorrentStatsState::Paused => TaskState::Paused,
                TorrentStatsState::Live => TaskState::Downloading,
                TorrentStatsState::Error => TaskState::Error,
            }
        };

        let down_bps = live
            .map(|l| (l.download_speed.mbps * 125_000.0) as u64)
            .unwrap_or(0);
        let up_bps = live
            .map(|l| (l.upload_speed.mbps * 125_000.0) as u64)
            .unwrap_or(0);

        let remaining = stats.total_bytes.saturating_sub(stats.progress_bytes);
        let eta_seconds = if down_bps > 0 && remaining > 0 {
            Some(remaining / down_bps)
        } else {
            None
        };

        let files = handle
            .with_metadata(|m| {
                m.file_infos
                    .iter()
                    .enumerate()
                    .map(|(idx, f)| {
                        let selected = meta
                            .and_then(|mt| mt.selected_files.as_ref())
                            .map(|set| set.contains(&idx))
                            .unwrap_or(true);
                        FileEntry {
                            index: idx as u32,
                            path: f.relative_filename.to_string_lossy().to_string(),
                            length: f.len,
                            downloaded_bytes: stats.file_progress.get(idx).copied().unwrap_or(0),
                            selected,
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        TorrentSnapshot {
            id: id as u32,
            info_hash: format!("{:?}", handle.info_hash()),
            name: handle
                .name()
                .unwrap_or_else(|| format!("Torrent #{id}")),
            magnet_uri: meta.map(|m| m.magnet_uri.clone()).unwrap_or_default(),
            state,
            total_bytes: stats.total_bytes,
            downloaded_bytes: stats.progress_bytes,
            uploaded_bytes: stats.uploaded_bytes,
            download_bps: down_bps,
            upload_bps: up_bps,
            active_peers: live.map(|l| l.snapshot.peer_stats.live as u32).unwrap_or(0),
            eta_seconds,
            download_limit_kbps: meta.map(|m| m.download_limit_kbps).unwrap_or(0),
            upload_limit_kbps: meta.map(|m| m.upload_limit_kbps).unwrap_or(0),
            files,
            peers: Vec::new(),
            trackers: Vec::new(),
            error_message: stats.error.clone(),
        }
    }

    fn spawn_monitor_loop(&self) {
        let session = self.session.clone();
        let metadata = self.metadata.clone();
        let callback = self.callback.clone();
        let policy = self.policy.clone();
        let env = self.env.clone();

        self.runtime.spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(900));
            loop {
                interval.tick().await;
                let handles: Vec<(usize, Arc<ManagedTorrent>)> = session
                    .with_torrents(|torrents| torrents.map(|(id, h)| (id, h.clone())).collect());

                let snapshots: Vec<TorrentSnapshot> = {
                    let mut meta_guard = metadata.lock();
                    handles
                        .into_iter()
                        .map(|(id, handle)| {
                            let stats = handle.stats();
                            let mut meta = meta_guard.get_mut(&id);
                            let completed_now = if stats.finished {
                                if let Some(m) = meta.as_deref_mut() {
                                    if !m.completed_notified {
                                        m.completed_notified = true;
                                        true
                                    } else {
                                        false
                                    }
                                } else {
                                    false
                                }
                            } else {
                                false
                            };

                            if completed_now {
                                if let Some(cb) = callback.lock().as_ref() {
                                    cb.on_task_completed(
                                        id as u32,
                                        handle.name().unwrap_or_default(),
                                    );
                                }
                            }

                            let _ = (&policy, &env);
                            Self::build_snapshot_inner(id, &handle, meta.as_deref())
                        })
                        .collect()
                };

                let total_down: u64 = snapshots.iter().map(|s| s.download_bps).sum();
                let total_up: u64 = snapshots.iter().map(|s| s.upload_bps).sum();
                if let Some(cb) = callback.lock().as_ref() {
                    cb.on_snapshot_updated(snapshots, total_down, total_up);
                }
            }
        });
    }
}
