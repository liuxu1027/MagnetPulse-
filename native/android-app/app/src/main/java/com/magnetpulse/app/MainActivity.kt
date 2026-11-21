package com.magnetpulse.app

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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
        requestNotificationPermissionIfNeeded()

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
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
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
}
