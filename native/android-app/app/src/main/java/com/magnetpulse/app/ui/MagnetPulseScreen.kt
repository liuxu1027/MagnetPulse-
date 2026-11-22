package com.magnetpulse.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uniffi.magnetpulse_core.EnginePolicy
import uniffi.magnetpulse_core.TaskState
import uniffi.magnetpulse_core.TorrentSnapshot
import kotlin.math.roundToInt

private enum class MainTab(val label: String) {
    QUEUE("下载队列"),
    POLICY("策略中心")
}

private enum class QueueFilter(val label: String) {
    ALL("全部"),
    ACTIVE("下载中"),
    COMPLETED("已完成"),
    PAUSED("已暂停")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MagnetPulseScreen(
    tasks: List<TorrentSnapshot>,
    totalDownBps: Long,
    totalUpBps: Long = 0L,
    policy: EnginePolicy = EnginePolicy(3u, 0u, 0u, wifiOnly = true, chargingOnly = false, fastresumeEnabled = true),
    engineError: String? = null,
    onAddMagnet: (uri: String, startPaused: Boolean) -> Unit,
    onPauseTask: (UInt) -> Unit,
    onResumeTask: (UInt) -> Unit,
    onPauseAll: () -> Unit = {},
    onResumeAll: () -> Unit = {},
    onRemoveTask: (id: UInt, deleteFiles: Boolean) -> Unit = { _, _ -> },
    onUpdateOnlyFiles: (id: UInt, files: List<UInt>) -> Unit = { _, _ -> },
    onSetTaskRateLimit: (id: UInt, downKbps: UInt, upKbps: UInt) -> Unit = { _, _, _ -> },
    onUpdatePolicy: (EnginePolicy) -> Unit = {}
) {
    var activeTab by remember { mutableStateOf(MainTab.QUEUE) }
    var filter by remember { mutableStateOf(QueueFilter.ALL) }
    var showAddSheet by remember { mutableStateOf(false) }
    var selectedTaskId by remember { mutableStateOf<UInt?>(null) }

    val selectedTask = remember(tasks, selectedTaskId) {
        selectedTaskId?.let { id -> tasks.find { it.id == id } }
    }

    val filteredTasks = remember(tasks, filter) {
        when (filter) {
            QueueFilter.ALL -> tasks
            QueueFilter.ACTIVE -> tasks.filter {
                it.state == TaskState.DOWNLOADING ||
                    it.state == TaskState.RESOLVING ||
                    it.state == TaskState.QUEUED
            }
            QueueFilter.COMPLETED -> tasks.filter {
                it.state == TaskState.COMPLETED || it.state == TaskState.SEEDING
            }
            QueueFilter.PAUSED -> tasks.filter {
                it.state == TaskState.PAUSED ||
                    it.state == TaskState.POLICY_PAUSED ||
                    it.state == TaskState.ERROR
            }
        }
    }

    val downloadingCount = tasks.count { it.state == TaskState.DOWNLOADING }
    val queuedCount = tasks.count { it.state == TaskState.QUEUED }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(RoundedCornerShape(9.dp))
                                .background(Color(0xFFA8C7FA).copy(alpha = 0.16f))
                                .border(1.dp, Color(0xFFA8C7FA).copy(alpha = 0.35f), RoundedCornerShape(9.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Bolt,
                                contentDescription = null,
                                tint = Color(0xFFA8C7FA),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "MagnetPulse",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFFE3E2E6)
                            )
                            Text(
                                text = "librqbit · FastResume 引擎",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF9AA0AC)
                            )
                        }
                    }
                },
                actions = {
                    if (tasks.isNotEmpty() && activeTab == MainTab.QUEUE) {
                        IconButton(onClick = onPauseAll) {
                            Icon(Icons.Rounded.Pause, contentDescription = "全部暂停", tint = Color(0xFFC4C6D0))
                        }
                        IconButton(onClick = onResumeAll) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = "全部继续", tint = Color(0xFFA8C7FA))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF171A23),
                tonalElevation = 0.dp
            ) {
                NavigationBarItem(
                    selected = activeTab == MainTab.QUEUE,
                    onClick = { activeTab = MainTab.QUEUE },
                    icon = { Icon(Icons.Rounded.Download, contentDescription = null) },
                    label = { Text(MainTab.QUEUE.label) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF062E6F),
                        selectedTextColor = Color(0xFFA8C7FA),
                        indicatorColor = Color(0xFFA8C7FA),
                        unselectedIconColor = Color(0xFF9AA0AC),
                        unselectedTextColor = Color(0xFF9AA0AC)
                    )
                )
                NavigationBarItem(
                    selected = activeTab == MainTab.POLICY,
                    onClick = { activeTab = MainTab.POLICY },
                    icon = { Icon(Icons.Rounded.Tune, contentDescription = null) },
                    label = { Text(MainTab.POLICY.label) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF062E6F),
                        selectedTextColor = Color(0xFFA8C7FA),
                        indicatorColor = Color(0xFFA8C7FA),
                        unselectedIconColor = Color(0xFF9AA0AC),
                        unselectedTextColor = Color(0xFF9AA0AC)
                    )
                )
            }
        },
        floatingActionButton = {
            if (activeTab == MainTab.QUEUE) {
                FloatingActionButton(
                    onClick = { showAddSheet = true },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = "添加磁力链接")
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            if (engineError != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFFEF4444).copy(alpha = 0.14f))
                        .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Text(
                        text = "引擎状态异常：$engineError",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFFCA5A5)
                    )
                }
            }

            if (activeTab == MainTab.QUEUE) {
                // Summary Strip (matches web 4-metric overview)
                SummaryPanel(
                    totalDownBps = totalDownBps,
                    totalUpBps = totalUpBps,
                    downloadingCount = downloadingCount,
                    queuedCount = queuedCount,
                    maxConcurrent = policy.maxConcurrentDownloads.toInt(),
                    fastresumeEnabled = policy.fastresumeEnabled
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Segmented filter tabs
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(QueueFilter.entries) { item ->
                        val selected = filter == item
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (selected) Color(0xFFA8C7FA).copy(alpha = 0.18f)
                                    else Color(0xFF171A23)
                                )
                                .border(
                                    1.dp,
                                    if (selected) Color(0xFFA8C7FA).copy(alpha = 0.45f)
                                    else Color(0xFF282D3B),
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { filter = item }
                                .padding(horizontal = 14.dp, vertical = 7.dp)
                        ) {
                            Text(
                                text = item.label,
                                fontSize = 12.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (selected) Color(0xFFA8C7FA) else Color(0xFF9AA0AC)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (filteredTasks.isEmpty()) {
                    EmptyQueuePlaceholder(onAddClick = { showAddSheet = true })
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 88.dp)
                    ) {
                        items(filteredTasks, key = { it.id.toInt() }) { task ->
                            TorrentRowCard(
                                task = task,
                                onCardClick = { selectedTaskId = task.id },
                                onToggle = {
                                    if (task.state == TaskState.DOWNLOADING || task.state == TaskState.RESOLVING) {
                                        onPauseTask(task.id)
                                    } else {
                                        onResumeTask(task.id)
                                    }
                                }
                            )
                        }
                    }
                }
            } else {
                PolicyCenterContent(
                    policy = policy,
                    onUpdatePolicy = onUpdatePolicy
                )
            }
        }
    }

    if (showAddSheet) {
        AddMagnetBottomSheet(
            onDismiss = { showAddSheet = false },
            onSubmit = { uri, startPaused ->
                filter = QueueFilter.ALL
                onAddMagnet(uri, startPaused)
                showAddSheet = false
            }
        )
    }

    if (selectedTask != null) {
        TaskInspectorBottomSheet(
            task = selectedTask,
            onDismiss = { selectedTaskId = null },
            onTogglePause = {
                if (selectedTask.state == TaskState.DOWNLOADING || selectedTask.state == TaskState.RESOLVING) {
                    onPauseTask(selectedTask.id)
                } else {
                    onResumeTask(selectedTask.id)
                }
            },
            onUpdateOnlyFiles = { indices -> onUpdateOnlyFiles(selectedTask.id, indices) },
            onSetRateLimit = { downKbps, upKbps -> onSetTaskRateLimit(selectedTask.id, downKbps, upKbps) },
            onRemove = { deleteFiles ->
                onRemoveTask(selectedTask.id, deleteFiles)
                selectedTaskId = null
            }
        )
    }
}

@Composable
private fun SummaryPanel(
    totalDownBps: Long,
    totalUpBps: Long,
    downloadingCount: Int,
    queuedCount: Int,
    maxConcurrent: Int,
    fastresumeEnabled: Boolean
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF171A23))
            .border(1.dp, Color(0xFF282D3B), RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Download,
                        contentDescription = null,
                        tint = Color(0xFFA8C7FA),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("总下行速率", fontSize = 11.sp, color = Color(0xFF9AA0AC))
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = formatRate(totalDownBps),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFFE3E2E6)
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Upload,
                        contentDescription = null,
                        tint = Color(0xFF22C55E),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("总上行速率", fontSize = 11.sp, color = Color(0xFF9AA0AC))
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = formatRate(totalUpBps),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFFC4C6D0)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))
        HorizontalDivider(color = Color(0xFF262B38))
        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "并发槽位 $downloadingCount/$maxConcurrent · 排队 $queuedCount",
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF9AA0AC)
            )
            Text(
                text = if (fastresumeEnabled) "FastResume 已启用" else "FastResume 关闭",
                fontSize = 11.sp,
                color = if (fastresumeEnabled) Color(0xFF22C55E) else Color(0xFF9AA0AC)
            )
        }
    }
}

@Composable
private fun EmptyQueuePlaceholder(onAddClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF171A23))
            .border(1.dp, Color(0xFF282D3B), RoundedCornerShape(16.dp))
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Rounded.Folder,
            contentDescription = null,
            tint = Color(0xFFA8C7FA),
            modifier = Modifier.size(36.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "队列暂无磁力任务",
            style = MaterialTheme.typography.titleSmall,
            color = Color(0xFFE3E2E6)
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "点击右下角 + 或下方按钮粘贴 magnet:? 链接，支持断点续传与单文件勾选",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF9AA0AC)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onAddClick) {
            Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("新建磁力下载")
        }
    }
}

@Composable
private fun TorrentRowCard(
    task: TorrentSnapshot,
    onCardClick: () -> Unit,
    onToggle: () -> Unit
) {
    val progress = if (task.totalBytes > 0uL) {
        (task.downloadedBytes.toFloat() / task.totalBytes.toFloat()).coerceIn(0f, 1f)
    } else 0f

    val (stateLabel, stateColor) = stateBadgeInfo(task.state)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF171A23))
            .border(1.dp, Color(0xFF282D3B), RoundedCornerShape(16.dp))
            .clickable { onCardClick() }
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = task.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = Color(0xFFE3E2E6),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = stateLabel,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = stateColor
                    )
                    Text(
                        text = if (task.state == TaskState.RESOLVING && task.totalBytes == 0uL) {
                            " · 正在连接 DHT / Tracker 解析元数据..."
                        } else {
                            " · ${formatBytes(task.downloadedBytes.toLong())} / ${formatBytes(task.totalBytes.toLong())}"
                        },
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF9AA0AC)
                    )
                }
            }
            IconButton(onClick = onToggle) {
                Icon(
                    imageVector = if (task.state == TaskState.DOWNLOADING || task.state == TaskState.RESOLVING) {
                        Icons.Rounded.Pause
                    } else {
                        Icons.Rounded.PlayArrow
                    },
                    contentDescription = "暂停或继续",
                    tint = Color(0xFFA8C7FA)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        if (task.state == TaskState.RESOLVING && task.totalBytes == 0uL) {
            LinearProgressIndicator(
                color = stateColor,
                trackColor = Color(0xFF1E222E),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
            )
        } else {
            LinearProgressIndicator(
                progress = { progress },
                color = stateColor,
                trackColor = Color(0xFF1E222E),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(999.dp))
            )
        }
        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "${(progress * 100).toInt()}% · ↓ ${formatRate(task.downloadBps.toLong())} · ↑ ${formatRate(task.uploadBps.toLong())}",
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFFC4C6D0)
            )
            Text(
                text = "${task.activePeers} Peers${task.etaSeconds?.let { " · ${formatEta(it.toLong())}" } ?: ""}",
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF9AA0AC)
            )
        }
    }
}

@Composable
private fun PolicyCenterContent(
    policy: EnginePolicy,
    onUpdatePolicy: (EnginePolicy) -> Unit
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF171A23))
                    .border(1.dp, Color(0xFF282D3B), RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                Text(
                    text = "并发队列槽位：${policy.maxConcurrentDownloads} 个任务",
                    style = MaterialTheme.typography.titleSmall,
                    color = Color(0xFFE3E2E6)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "超出并发上限的新任务将自动进入 QUEUED 排队等待",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF9AA0AC)
                )
                Slider(
                    value = policy.maxConcurrentDownloads.toFloat().coerceIn(1f, 5f),
                    onValueChange = { v ->
                        onUpdatePolicy(policy.copy(maxConcurrentDownloads = v.roundToInt().toUInt()))
                    },
                    valueRange = 1f..5f,
                    steps = 3
                )
            }
        }

        item {
            PolicyToggleCard(
                icon = Icons.Rounded.Wifi,
                title = "仅 Wi-Fi / 以太网环境下下载",
                subtitle = "切到蜂窝流量时自动 PolicyPaused，恢复 Wi-Fi 后无缝续传",
                checked = policy.wifiOnly,
                onCheckedChange = { onUpdatePolicy(policy.copy(wifiOnly = it)) }
            )
        }

        item {
            PolicyToggleCard(
                icon = Icons.Rounded.BatteryChargingFull,
                title = "仅充电时保持高速下载",
                subtitle = "通过 BatteryManager 实时监听电源状态",
                checked = policy.chargingOnly,
                onCheckedChange = { onUpdatePolicy(policy.copy(chargingOnly = it)) }
            )
        }

        item {
            PolicyToggleCard(
                icon = Icons.Rounded.Bolt,
                title = "FastResume 断点续传索引",
                subtitle = "SessionPersistenceConfig::Json 持久化分片位图，重启免重新校验",
                checked = policy.fastresumeEnabled,
                onCheckedChange = { onUpdatePolicy(policy.copy(fastresumeEnabled = it)) }
            )
        }
    }
}

@Composable
private fun PolicyToggleCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF171A23))
            .border(1.dp, Color(0xFF282D3B), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Color(0xFFA8C7FA), modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, color = Color(0xFFE3E2E6))
                Spacer(modifier = Modifier.height(2.dp))
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF9AA0AC))
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddMagnetBottomSheet(
    onDismiss: () -> Unit,
    onSubmit: (uri: String, startPaused: Boolean) -> Unit
) {
    val clipboard = LocalClipboardManager.current
    var magnetInput by remember { mutableStateOf("") }
    var startPaused by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF171A23)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("添加磁力任务", style = MaterialTheme.typography.titleMedium, color = Color(0xFFE3E2E6))
                TextButton(
                    onClick = {
                        clipboard.getText()?.text?.let { magnetInput = it.trim() }
                    }
                ) {
                    Icon(Icons.Rounded.ContentPaste, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("粘贴剪贴板")
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = magnetInput,
                onValueChange = { magnetInput = it },
                placeholder = { Text("magnet:?xt=urn:btih:...") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 4
            )
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("添加后先保持暂停（稍后选择文件）", style = MaterialTheme.typography.bodySmall, color = Color(0xFFC4C6D0))
                Switch(checked = startPaused, onCheckedChange = { startPaused = it })
            }
            Spacer(modifier = Modifier.height(14.dp))
            Button(
                onClick = {
                    val trimmed = magnetInput.trim()
                    if (trimmed.isNotEmpty()) {
                        onSubmit(trimmed, startPaused)
                    }
                },
                enabled = magnetInput.trim().startsWith("magnet:?", ignoreCase = true),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("解析并加入 librqbit 队列")
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskInspectorBottomSheet(
    task: TorrentSnapshot,
    onDismiss: () -> Unit,
    onTogglePause: () -> Unit,
    onUpdateOnlyFiles: (List<UInt>) -> Unit,
    onSetRateLimit: (downKbps: UInt, upKbps: UInt) -> Unit,
    onRemove: (deleteFiles: Boolean) -> Unit
) {
    var selectedIndices by remember(task.id, task.files) {
        mutableStateOf(task.files.filter { it.selected }.map { it.index }.toSet())
    }
    var downLimitKbps by remember(task.id) { mutableIntStateOf(task.downloadLimitKbps.toInt()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF171A23)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp)
        ) {
            Text(
                text = task.name,
                style = MaterialTheme.typography.titleMedium,
                color = Color(0xFFE3E2E6),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "InfoHash: ${task.infoHash}",
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF9AA0AC),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onTogglePause,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        if (task.state == TaskState.DOWNLOADING || task.state == TaskState.RESOLVING) "暂停任务"
                        else "继续下载"
                    )
                }
                OutlinedButton(
                    onClick = { onRemove(false) },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFEF4444)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Rounded.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("移除任务")
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Speed, contentDescription = null, tint = Color(0xFFA8C7FA), modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (downLimitKbps == 0) "单任务限速：不限速" else "单任务限速：$downLimitKbps KB/s",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFE3E2E6)
                )
            }
            Slider(
                value = downLimitKbps.toFloat(),
                onValueChange = { downLimitKbps = it.roundToInt() },
                onValueChangeFinished = {
                    onSetRateLimit(downLimitKbps.toUInt(), task.uploadLimitKbps)
                },
                valueRange = 0f..10240f
            )

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "单文件选择 (only_files · ${task.files.size} 个文件)",
                style = MaterialTheme.typography.titleSmall,
                color = Color(0xFFE3E2E6)
            )
            Spacer(modifier = Modifier.height(6.dp))

            if (task.files.isEmpty()) {
                Text(
                    text = "正在等待磁力元数据解析完成后显示文件列表...",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF9AA0AC),
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                ) {
                    items(task.files, key = { it.index.toInt() }) { file ->
                        val checked = selectedIndices.contains(file.index)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    val next = if (checked) selectedIndices - file.index else selectedIndices + file.index
                                    selectedIndices = next
                                    onUpdateOnlyFiles(next.toList().sorted())
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = checked,
                                onCheckedChange = { isChecked ->
                                    val next = if (isChecked) selectedIndices + file.index else selectedIndices - file.index
                                    selectedIndices = next
                                    onUpdateOnlyFiles(next.toList().sorted())
                                }
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = file.path,
                                    fontSize = 12.sp,
                                    color = Color(0xFFE3E2E6),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "${formatBytes(file.downloadedBytes.toLong())} / ${formatBytes(file.length.toLong())}",
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = Color(0xFF9AA0AC)
                                )
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

private fun stateBadgeInfo(state: TaskState): Pair<String, Color> {
    return when (state) {
        TaskState.RESOLVING -> "解析元数据" to Color(0xFFA8C7FA)
        TaskState.QUEUED -> "队列等待" to Color(0xFFF59E0B)
        TaskState.DOWNLOADING -> "下载中" to Color(0xFFA8C7FA)
        TaskState.PAUSED -> "已暂停" to Color(0xFF9AA0AC)
        TaskState.POLICY_PAUSED -> "策略暂停" to Color(0xFFF59E0B)
        TaskState.SEEDING -> "做种中" to Color(0xFF22C55E)
        TaskState.COMPLETED -> "已完成" to Color(0xFF22C55E)
        TaskState.ERROR -> "异常" to Color(0xFFEF4444)
    }
}

private fun formatRate(bps: Long): String {
    return when {
        bps >= 1024L * 1024L -> String.format("%.2f MB/s", bps / (1024.0 * 1024.0))
        bps >= 1024L -> String.format("%.1f KB/s", bps / 1024.0)
        else -> "$bps B/s"
    }
}

private fun formatBytes(bytes: Long): String {
    return when {
        bytes >= 1024L * 1024L * 1024L -> String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0))
        bytes >= 1024L * 1024L -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        bytes >= 1024L -> String.format("%.1f KB", bytes / 1024.0)
        else -> "$bytes B"
    }
}

private fun formatEta(seconds: Long): String {
    if (seconds <= 0L) return "--"
    val h = seconds / 3600L
    val m = (seconds % 3600L) / 60L
    val s = seconds % 60L
    return when {
        h > 0 -> "${h}h${m}m"
        m > 0 -> "${m}m${s}s"
        else -> "${s}s"
    }
}
