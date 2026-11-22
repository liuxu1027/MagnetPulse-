package com.magnetpulse.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.magnetpulse.app.MainActivity
import com.magnetpulse.app.network.NetworkPolicyMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uniffi.magnetpulse_core.EnginePolicy
import uniffi.magnetpulse_core.MagnetEngine
import uniffi.magnetpulse_core.ProgressCallback
import uniffi.magnetpulse_core.TaskState
import uniffi.magnetpulse_core.TorrentSnapshot
import java.io.File
import java.net.URLDecoder
import java.util.concurrent.atomic.AtomicInteger

class TorrentForegroundService : Service() {

    companion object {
        const val CHANNEL_PROGRESS_ID = "magnetpulse_progress"
        const val CHANNEL_COMPLETE_ID = "magnetpulse_complete"
        const val NOTIFICATION_ONGOING_ID = 1001

        const val ACTION_PAUSE_ALL = "com.magnetpulse.action.PAUSE_ALL"
        const val ACTION_RESUME_ALL = "com.magnetpulse.action.RESUME_ALL"
        const val ACTION_STOP_SERVICE = "com.magnetpulse.action.STOP"
    }

    inner class LocalBinder : Binder() {
        fun getService(): TorrentForegroundService = this@TorrentForegroundService
    }

    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var engine: MagnetEngine? = null
    private var networkMonitor: NetworkPolicyMonitor? = null
    private lateinit var notificationManager: NotificationManager

    private val _engineTasks = MutableStateFlow<List<TorrentSnapshot>>(emptyList())
    private val _pendingTasks = MutableStateFlow<List<TorrentSnapshot>>(emptyList())
    private val pendingIdCounter = AtomicInteger(0)

    private val _tasks = MutableStateFlow<List<TorrentSnapshot>>(emptyList())
    val tasks: StateFlow<List<TorrentSnapshot>> = _tasks.asStateFlow()

    private val _totalDownBps = MutableStateFlow(0L)
    val totalDownBps: StateFlow<Long> = _totalDownBps.asStateFlow()

    private val _totalUpBps = MutableStateFlow(0L)
    val totalUpBps: StateFlow<Long> = _totalUpBps.asStateFlow()

    private val _engineError = MutableStateFlow<String?>(null)
    val engineError: StateFlow<String?> = _engineError.asStateFlow()

    private val _policy = MutableStateFlow(
        EnginePolicy(
            maxConcurrentDownloads = 3u,
            globalDownloadLimitKbps = 0u,
            globalUploadLimitKbps = 0u,
            wifiOnly = true,
            chargingOnly = false,
            fastresumeEnabled = true
        )
    )
    val policy: StateFlow<EnginePolicy> = _policy.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannels()
        promoteToForeground()

        serviceScope.launch {
            initEngine()
        }
    }

    private fun initEngine() {
        try {
            val baseDownloadDir = getExternalFilesDir(null) ?: filesDir
            val downloadDir = File(baseDownloadDir, "downloads").apply { mkdirs() }
            val persistenceDir = File(filesDir, "librqbit_fastresume").apply { mkdirs() }

            val created = MagnetEngine(
                downloadDir = downloadDir.absolutePath,
                persistenceDir = persistenceDir.absolutePath,
                initialPolicy = _policy.value
            )

            created.registerCallback(object : ProgressCallback {
                override fun onSnapshotUpdated(
                    tasks: List<TorrentSnapshot>,
                    totalDownBps: ULong,
                    totalUpBps: ULong
                ) {
                    _engineTasks.value = tasks
                    syncVisibleTasks()
                    _totalDownBps.value = totalDownBps.toLong()
                    _totalUpBps.value = totalUpBps.toLong()
                    notificationManager.notify(
                        NOTIFICATION_ONGOING_ID,
                        buildOngoingNotification(_tasks.value, totalDownBps.toLong())
                    )
                }

                override fun onTaskCompleted(id: UInt, name: String) {
                    notifyCompletion(id.toInt(), name)
                }

                override fun onTaskError(id: UInt, message: String) {
                    notifyError(id.toInt(), message)
                }
            })

            engine = created
            _engineTasks.value = runCatching { created.listTasks() }.getOrDefault(emptyList())
            syncVisibleTasks()
            _engineError.value = null

            val monitor = NetworkPolicyMonitor(this) { isWifi, isCharging ->
                engine?.applyNetworkEnvironment(isWifi, isCharging)
            }
            networkMonitor = monitor
            monitor.start()
        } catch (t: Throwable) {
            val detail = "${t::class.java.simpleName}: ${t.message ?: "Native engine failed to load"}"
            _engineError.value = detail
            notifyError(0, detail)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE_ALL -> pauseAll()
            ACTION_RESUME_ALL -> resumeAll()
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        networkMonitor?.stop()
        serviceScope.cancel()
        super.onDestroy()
    }

    fun addMagnet(uri: String, onlyFiles: List<UInt>? = null, startPaused: Boolean = false) {
        val trimmed = uri.trim()
        if (!trimmed.startsWith("magnet:?", ignoreCase = true)) {
            _engineError.value = "无效的磁力链接，必须以 magnet:? 开头"
            return
        }

        val pendingId = (1_000_000_000 + pendingIdCounter.incrementAndGet()).toUInt()
        val parsedHash = extractInfoHash(trimmed)
        val parsedName = extractDisplayName(trimmed)
            ?: if (parsedHash.isNotEmpty()) "正在解析磁力任务 (${parsedHash.take(8)}...)" else "正在解析磁力任务..."

        val placeholder = TorrentSnapshot(
            id = pendingId,
            infoHash = parsedHash,
            name = parsedName,
            magnetUri = trimmed,
            state = TaskState.RESOLVING,
            totalBytes = 0uL,
            downloadedBytes = 0uL,
            uploadedBytes = 0uL,
            downloadBps = 0uL,
            uploadBps = 0uL,
            activePeers = 0u,
            etaSeconds = null,
            downloadLimitKbps = 0u,
            uploadLimitKbps = 0u,
            files = emptyList(),
            peers = emptyList(),
            trackers = emptyList(),
            errorMessage = null
        )

        _pendingTasks.update { listOf(placeholder) + it }
        syncVisibleTasks()
        notificationManager.notify(
            NOTIFICATION_ONGOING_ID,
            buildOngoingNotification(_tasks.value, _totalDownBps.value)
        )

        serviceScope.launch {
            try {
                var attempts = 0
                while (engine == null && attempts < 20) {
                    delay(150)
                    attempts++
                }
                val eng = engine ?: throw IllegalStateException("下载引擎尚未初始化完成")
                eng.addMagnet(trimmed, onlyFiles, startPaused)
                _engineTasks.value = runCatching { eng.listTasks() }.getOrDefault(_engineTasks.value)
            } catch (t: Throwable) {
                val msg = t.message ?: "添加磁力链接失败"
                _engineError.value = msg
                notifyError(pendingId.toInt(), msg)
            } finally {
                _pendingTasks.update { list -> list.filterNot { it.id == pendingId } }
                syncVisibleTasks()
            }
        }
    }

    fun pauseTask(id: UInt) {
        serviceScope.launch {
            runCatching { engine?.pauseTask(id) }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun resumeTask(id: UInt) {
        serviceScope.launch {
            runCatching { engine?.resumeTask(id) }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun pauseAll() {
        serviceScope.launch {
            runCatching { engine?.pauseAll() }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun resumeAll() {
        serviceScope.launch {
            runCatching { engine?.resumeAll() }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun removeTask(id: UInt, deleteFiles: Boolean = false) {
        if (_pendingTasks.value.any { it.id == id }) {
            _pendingTasks.update { list -> list.filterNot { it.id == id } }
            syncVisibleTasks()
            return
        }
        serviceScope.launch {
            runCatching {
                engine?.removeTask(id, deleteFiles)
                engine?.let { _engineTasks.value = it.listTasks() }
                syncVisibleTasks()
            }.onFailure { _engineError.value = it.message }
        }
    }

    @Synchronized
    private fun syncVisibleTasks() {
        val real = _engineTasks.value
        val activePending = _pendingTasks.value.filter { pending ->
            val matchedByUri = real.any { it.magnetUri.isNotEmpty() && it.magnetUri == pending.magnetUri }
            val matchedByHash = pending.infoHash.isNotEmpty() &&
                real.any { it.infoHash.contains(pending.infoHash, ignoreCase = true) }
            !matchedByUri && !matchedByHash
        }
        _tasks.value = activePending + real
    }

    private fun extractInfoHash(uri: String): String {
        val match = Regex("xt=urn:btih:([a-zA-Z0-9]+)", RegexOption.IGNORE_CASE).find(uri)
        return match?.groupValues?.getOrNull(1)?.lowercase() ?: ""
    }

    private fun extractDisplayName(uri: String): String? {
        val match = Regex("(?:^|[?&])dn=([^&]+)", RegexOption.IGNORE_CASE).find(uri) ?: return null
        return runCatching {
            URLDecoder.decode(match.groupValues[1], "UTF-8").trim().takeIf { it.isNotEmpty() }
        }.getOrNull()
    }

    fun setTaskRateLimit(id: UInt, downloadKbps: UInt, uploadKbps: UInt) {
        serviceScope.launch {
            runCatching { engine?.setTaskRateLimit(id, downloadKbps, uploadKbps) }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun updateOnlyFiles(id: UInt, files: List<UInt>) {
        serviceScope.launch {
            runCatching { engine?.updateOnlyFiles(id, files) }
                .onFailure { _engineError.value = it.message }
        }
    }

    fun updatePolicy(policy: EnginePolicy) {
        _policy.value = policy
        serviceScope.launch {
            runCatching { engine?.updatePolicy(policy) }
                .onFailure { _engineError.value = it.message }
        }
    }

    private fun promoteToForeground() {
        val notification = buildOngoingNotification(emptyList(), 0L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ONGOING_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ONGOING_ID, notification)
        }
    }

    private fun createNotificationChannels() {
        val progressChannel = NotificationChannel(
            CHANNEL_PROGRESS_ID,
            "磁力下载实时进度",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "显示 librqbit 引擎的实时下行速率、进度与快捷控制按钮"
            setShowBadge(false)
        }

        val completeChannel = NotificationChannel(
            CHANNEL_COMPLETE_ID,
            "下载完成与状态提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "当磁力任务完成校验或遇到网络异常时发出通知"
        }

        notificationManager.createNotificationChannel(progressChannel)
        notificationManager.createNotificationChannel(completeChannel)
    }

    private fun buildOngoingNotification(
        tasks: List<TorrentSnapshot>,
        totalDownBps: Long
    ): Notification {
        val active = tasks.filter { it.state == TaskState.DOWNLOADING }
        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val pauseIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, TorrentForegroundService::class.java).setAction(ACTION_PAUSE_ALL),
            PendingIntent.FLAG_IMMUTABLE
        )

        val resumeIntent = PendingIntent.getService(
            this,
            2,
            Intent(this, TorrentForegroundService::class.java).setAction(ACTION_RESUME_ALL),
            PendingIntent.FLAG_IMMUTABLE
        )

        val avgProgress = if (active.isNotEmpty()) {
            val sumDownloaded = active.sumOf { it.downloadedBytes.toLong() }
            val sumTotal = active.sumOf { it.totalBytes.toLong() }.coerceAtLeast(1L)
            ((sumDownloaded * 100) / sumTotal).toInt().coerceIn(0, 100)
        } else {
            0
        }

        val speedText = formatSpeed(totalDownBps)
        val title = if (active.isNotEmpty()) {
            "正在下载 ${active.size} 个磁力任务 · $speedText"
        } else {
            "MagnetPulse 就绪 · 共 ${tasks.size} 个任务"
        }

        val content = active.firstOrNull()?.name ?: "FastResume 断点索引已就绪"

        return NotificationCompat.Builder(this, CHANNEL_PROGRESS_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(content)
            .setContentIntent(openAppIntent)
            .setOngoing(active.isNotEmpty())
            .setOnlyAlertOnce(true)
            .setProgress(100, avgProgress, active.isEmpty() && tasks.any { it.state == TaskState.RESOLVING })
            .addAction(0, "全部暂停", pauseIntent)
            .addAction(0, "全部继续", resumeIntent)
            .build()
    }

    private fun notifyCompletion(id: Int, name: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_COMPLETE_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("下载已完成")
            .setContentText(name)
            .setAutoCancel(true)
            .build()
        notificationManager.notify(2000 + id, notification)
    }

    private fun notifyError(id: Int, message: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_COMPLETE_ID)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("磁力任务出现异常")
            .setContentText(message)
            .setAutoCancel(true)
            .build()
        notificationManager.notify(3000 + id, notification)
    }

    private fun formatSpeed(bps: Long): String {
        return when {
            bps >= 1024 * 1024 -> String.format("%.2f MB/s", bps / (1024.0 * 1024.0))
            bps >= 1024 -> String.format("%.1f KB/s", bps / 1024.0)
            else -> "$bps B/s"
        }
    }
}
