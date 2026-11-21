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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.magnetpulse_core.EnginePolicy
import uniffi.magnetpulse_core.MagnetEngine
import uniffi.magnetpulse_core.ProgressCallback
import uniffi.magnetpulse_core.TaskState
import uniffi.magnetpulse_core.TorrentSnapshot
import java.io.File

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
    private lateinit var engine: MagnetEngine
    private lateinit var networkMonitor: NetworkPolicyMonitor
    private lateinit var notificationManager: NotificationManager

    private val _tasks = MutableStateFlow<List<TorrentSnapshot>>(emptyList())
    val tasks: StateFlow<List<TorrentSnapshot>> = _tasks.asStateFlow()

    private val _totalDownBps = MutableStateFlow(0L)
    val totalDownBps: StateFlow<Long> = _totalDownBps.asStateFlow()

    private val _totalUpBps = MutableStateFlow(0L)
    val totalUpBps: StateFlow<Long> = _totalUpBps.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannels()

        val downloadDir = File(getExternalFilesDir(null), "downloads").apply { mkdirs() }
        val persistenceDir = File(filesDir, "librqbit_fastresume").apply { mkdirs() }

        engine = MagnetEngine(
            downloadDir = downloadDir.absolutePath,
            persistenceDir = persistenceDir.absolutePath,
            initialPolicy = EnginePolicy(
                maxConcurrentDownloads = 3u,
                globalDownloadLimitKbps = 0u,
                globalUploadLimitKbps = 0u,
                wifiOnly = true,
                chargingOnly = false,
                fastresumeEnabled = true
            )
        )

        engine.registerCallback(object : ProgressCallback {
            override fun onSnapshotUpdated(
                tasks: List<TorrentSnapshot>,
                totalDownBps: ULong,
                totalUpBps: ULong
            ) {
                _tasks.value = tasks
                _totalDownBps.value = totalDownBps.toLong()
                _totalUpBps.value = totalUpBps.toLong()
                notificationManager.notify(
                    NOTIFICATION_ONGOING_ID,
                    buildOngoingNotification(tasks, totalDownBps.toLong())
                )
            }

            override fun onTaskCompleted(id: UInt, name: String) {
                notifyCompletion(id.toInt(), name)
            }

            override fun onTaskError(id: UInt, message: String) {
                notifyError(id.toInt(), message)
            }
        })

        networkMonitor = NetworkPolicyMonitor(this) { isWifi, isCharging ->
            engine.applyNetworkEnvironment(isWifi, isCharging)
        }
        networkMonitor.start()

        promoteToForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE_ALL -> engine.pauseAll()
            ACTION_RESUME_ALL -> engine.resumeAll()
            ACTION_STOP_SERVICE -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        networkMonitor.stop()
        super.onDestroy()
    }

    fun addMagnet(uri: String, onlyFiles: List<UInt>? = null) {
        engine.addMagnet(uri, onlyFiles, false)
    }

    fun pauseTask(id: UInt) = engine.pauseTask(id)
    fun resumeTask(id: UInt) = engine.resumeTask(id)
    fun updateOnlyFiles(id: UInt, files: List<UInt>) = engine.updateOnlyFiles(id, files)
    fun updatePolicy(policy: EnginePolicy) = engine.updatePolicy(policy)

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
