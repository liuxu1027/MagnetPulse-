package com.magnetpulse.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uniffi.magnetpulse_core.TaskState
import uniffi.magnetpulse_core.TorrentSnapshot

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MagnetPulseScreen(
    tasks: List<TorrentSnapshot>,
    totalDownBps: Long,
    engineError: String? = null,
    onAddMagnet: (String) -> Unit,
    onPauseTask: (UInt) -> Unit,
    onResumeTask: (UInt) -> Unit
) {
    var showAddSheet by remember { mutableStateOf(false) }
    var magnetInput by remember { mutableStateOf("") }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "MagnetPulse",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddSheet = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(Icons.Rounded.Add, contentDescription = "添加磁力链接")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            Text(
                text = "总下行速率 ${formatRate(totalDownBps)} · 队列任务 ${tasks.size}",
                style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (engineError != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "引擎状态异常：$engineError",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.25f))
                        .padding(12.dp)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 88.dp)
            ) {
                items(tasks, key = { it.id.toInt() }) { task ->
                    TorrentRowCard(
                        task = task,
                        onToggle = {
                            if (task.state == TaskState.DOWNLOADING) {
                                onPauseTask(task.id)
                            } else {
                                onResumeTask(task.id)
                            }
                        }
                    )
                }
            }
        }
    }

    if (showAddSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAddSheet = false },
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 16.dp)
            ) {
                Text("添加磁力任务", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = magnetInput,
                    onValueChange = { magnetInput = it },
                    placeholder = { Text("magnet:?xt=urn:btih:...") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 4
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = {
                        if (magnetInput.isNotBlank()) {
                            onAddMagnet(magnetInput.trim())
                            magnetInput = ""
                            showAddSheet = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("解析并加入 librqbit 队列")
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun TorrentRowCard(
    task: TorrentSnapshot,
    onToggle: () -> Unit
) {
    val progress = if (task.totalBytes > 0uL) {
        (task.downloadedBytes.toFloat() / task.totalBytes.toFloat()).coerceIn(0f, 1f)
    } else 0f

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = task.name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onToggle) {
                Icon(
                    imageVector = if (task.state == TaskState.DOWNLOADING) {
                        Icons.Rounded.Pause
                    } else {
                        Icons.Rounded.PlayArrow
                    },
                    contentDescription = "暂停或继续"
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(999.dp))
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "${(progress * 100).toInt()}% · ${formatRate(task.downloadBps.toLong())} · ${task.activePeers} Peers",
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun formatRate(bps: Long): String {
    return when {
        bps >= 1024 * 1024 -> String.format("%.2f MB/s", bps / (1024.0 * 1024.0))
        bps >= 1024 -> String.format("%.1f KB/s", bps / 1024.0)
        else -> "$bps B/s"
    }
}
