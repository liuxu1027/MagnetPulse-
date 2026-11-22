package com.magnetpulse.app

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.IBinder
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import com.magnetpulse.app.service.TorrentForegroundService
import com.magnetpulse.app.ui.MagnetPulseScreen
import com.magnetpulse.app.ui.theme.MagnetPulseTheme

import uniffi.magnetpulse_core.EnginePolicy

class MainActivity : ComponentActivity() {

    private var boundService by mutableStateOf<TorrentForegroundService?>(null)
    private var showStoragePermissionDialog by mutableStateOf(false)
    private var downloadLocation by mutableStateOf("public")

    companion object {
        private const val PREFS_NAME = "magnetpulse_prefs"
        private const val KEY_STORAGE_PROMPT_DISMISSED = "storage_permission_prompt_dismissed"
        private const val KEY_DOWNLOAD_LOCATION = "download_location"

        /** 通知栏“退出”操作用的 action：回到 MainActivity 后停服务、关应用。 */
        const val ACTION_EXIT_APP = "com.magnetpulse.action.EXIT_APP"
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as TorrentForegroundService.LocalBinder
            boundService = binder.getService()
            handleIncomingMagnetIntent(intent)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            boundService = null
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* Permission result handled gracefully; foreground service keeps running */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 从通知栏点“退出”进来：停掉下载服务、关闭应用，不再往下走。
        if (intent?.action == ACTION_EXIT_APP) {
            exitApp()
            return
        }
        requestNotificationPermissionIfNeeded()
        downloadLocation = readDownloadLocation()
        showStoragePermissionDialog = shouldShowStoragePermissionDialog()

        val serviceIntent = Intent(this, TorrentForegroundService::class.java)
        ContextCompat.startForegroundService(this, serviceIntent)
        bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE)

        setContent {
            MagnetPulseTheme {
                val svc = boundService
                val tasks by (svc?.tasks ?: kotlinx.coroutines.flow.MutableStateFlow(emptyList())).collectAsState()
                val totalDown by (svc?.totalDownBps ?: kotlinx.coroutines.flow.MutableStateFlow(0L)).collectAsState()
                val totalUp by (svc?.totalUpBps ?: kotlinx.coroutines.flow.MutableStateFlow(0L)).collectAsState()
                val engineError by (svc?.engineError ?: kotlinx.coroutines.flow.MutableStateFlow<String?>(null)).collectAsState()
                val policy by (svc?.policy ?: kotlinx.coroutines.flow.MutableStateFlow(
                    EnginePolicy(
                        maxConcurrentDownloads = 3u,
                        globalDownloadLimitKbps = 0u,
                        globalUploadLimitKbps = 0u,
                        wifiOnly = true,
                        chargingOnly = false,
                        fastresumeEnabled = true
                    )
                )).collectAsState()

                MagnetPulseScreen(
                    tasks = tasks,
                    totalDownBps = totalDown,
                    totalUpBps = totalUp,
                    policy = policy,
                    engineError = engineError,
                    downloadLocation = downloadLocation,
                    onDownloadLocationChange = { updateDownloadLocation(it) },
                    hasAllFilesAccess = hasAllFilesAccess(),
                    onOpenAllFilesAccess = { openAllFilesAccessSettings() },
                    downloadDir = TorrentForegroundService.resolveDownloadDir(this).absolutePath,
                    onExit = { exitApp() },
                    onAddMagnet = { uri, startPaused -> svc?.addMagnet(uri, null, startPaused) },
                    onPauseTask = { id -> svc?.pauseTask(id) },
                    onResumeTask = { id -> svc?.resumeTask(id) },
                    onPauseAll = { svc?.pauseAll() },
                    onResumeAll = { svc?.resumeAll() },
                    onRemoveTask = { id, deleteFiles -> svc?.removeTask(id, deleteFiles) },
                    onUpdateOnlyFiles = { id, files -> svc?.updateOnlyFiles(id, files) },
                    onSetTaskRateLimit = { id, downKbps, upKbps -> svc?.setTaskRateLimit(id, downKbps, upKbps) },
                    onUpdatePolicy = { updated -> svc?.updatePolicy(updated) }
                )

                if (showStoragePermissionDialog) {
                    AlertDialog(
                        onDismissRequest = { showStoragePermissionDialog = false },
                        title = { Text("下载保存到能找到的地方") },
                        text = {
                            Text(
                                "现在下载的文件保存在应用私有目录，文件管理器里看不到。" +
                                    "去设置里开启“所有文件访问权限”后，下载会保存到手机 Download " +
                                    "文件夹下的 MagnetPulse 文件夹，文件管理器里就能找到。" +
                                    "开启后重启应用生效。"
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                showStoragePermissionDialog = false
                                openAllFilesAccessSettings()
                            }) { Text("去开启") }
                        },
                        dismissButton = {
                            TextButton(onClick = { dismissStoragePermissionDialogPermanently() }) {
                                Text("以后再说")
                            }
                        }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_EXIT_APP) {
            exitApp()
            return
        }
        handleIncomingMagnetIntent(intent)
    }

    override fun onDestroy() {
        unbindService(connection)
        super.onDestroy()
    }

    private fun handleIncomingMagnetIntent(intent: Intent?) {
        val data = intent?.dataString ?: return
        if (data.startsWith("magnet:?")) {
            boundService?.addMagnet(data)
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    /** 没开“所有文件访问权限”且用户没点过“以后再说”时，启动弹一次授权提示。 */
    private fun shouldShowStoragePermissionDialog(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        if (Environment.isExternalStorageManager()) return false
        return !getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_STORAGE_PROMPT_DISMISSED, false)
    }

    private fun dismissStoragePermissionDialogPermanently() {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_STORAGE_PROMPT_DISMISSED, true)
            .apply()
        showStoragePermissionDialog = false
    }

    private fun openAllFilesAccessSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val intent = Intent(
            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.parse("package:$packageName")
        )
        startActivity(intent)
    }

    /** 下载位置选择：public = 手机存储 Download/MagnetPulse，private = 应用私有目录。 */
    private fun readDownloadLocation(): String {
        return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_DOWNLOAD_LOCATION, "public") ?: "public"
    }

    private fun updateDownloadLocation(value: String) {
        val v = if (value == "private") "private" else "public"
        downloadLocation = v
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_DOWNLOAD_LOCATION, v)
            .apply()
    }

    /** 是否有“所有文件访问权限”（Android 11+）。 */
    private fun hasAllFilesAccess(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            Environment.isExternalStorageManager()
    }

    /** 彻底退出：停掉下载服务、去掉通知栏，界面随后关闭。 */
    private fun exitApp() {
        val stopIntent = Intent(this, TorrentForegroundService::class.java).apply {
            action = TorrentForegroundService.ACTION_STOP_SERVICE
        }
        startService(stopIntent)
        finish()
    }
}
