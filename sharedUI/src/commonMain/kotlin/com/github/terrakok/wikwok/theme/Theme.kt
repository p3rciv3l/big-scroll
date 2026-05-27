package com.github.terrakok.wikwok.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import com.materialkolor.PaletteStyle
import com.materialkolor.rememberDynamicColorScheme

@Composable
internal fun AppTheme(
    onThemeChanged: @Composable (isDark: Boolean) -> Unit,
    content: @Composable () -> Unit
) {
    val systemIsDark = isSystemInDarkTheme()
    val scheme = rememberDynamicColorScheme(
        seedColor = Color(0xFF5FBA9A),
        isDark = systemIsDark,
        isAmoled = false,
        style = PaletteStyle.Monochrome
    )
    onThemeChanged(!systemIsDark)
    MaterialTheme(
        colorScheme = scheme,
        content = { Surface(content = content) }
    )
}
