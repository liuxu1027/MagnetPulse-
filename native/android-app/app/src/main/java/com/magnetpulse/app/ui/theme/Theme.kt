package com.magnetpulse.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val MagnetPulseDarkScheme = darkColorScheme(
    primary = Color(0xFFA8C7FA),
    onPrimary = Color(0xFF062E6F),
    primaryContainer = Color(0xFF0842A0),
    onPrimaryContainer = Color(0xFFD3E3FD),
    secondary = Color(0xFFBAC3D8),
    background = Color(0xFF0F1117),
    onBackground = Color(0xFFE3E2E6),
    surface = Color(0xFF171A23),
    onSurface = Color(0xFFE3E2E6),
    surfaceVariant = Color(0xFF1E222E),
    onSurfaceVariant = Color(0xFFC4C6D0),
    outline = Color(0xFF333846),
    error = Color(0xFFEF4444)
)

@Composable
fun MagnetPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MagnetPulseDarkScheme,
        content = content
    )
}
