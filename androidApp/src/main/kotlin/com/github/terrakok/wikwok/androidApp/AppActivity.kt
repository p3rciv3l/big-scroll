package com.github.terrakok.wikwok.androidApp

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowInsetsControllerCompat
import com.github.terrakok.wikwok.App
import com.github.terrakok.wikwok.data.ShareService
import io.github.vinceglb.filekit.FileKit
import io.github.vinceglb.filekit.manualFileKitCoreInitialization

class AppActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        FileKit.manualFileKitCoreInitialization(this)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val shareService = object : ShareService {
            override fun share(text: String) {
                val sendIntent: Intent = Intent().apply {
                    action = Intent.ACTION_SEND
                    putExtra(Intent.EXTRA_TEXT, text)
                    type = "text/plain"
                }
                val shareIntent = Intent.createChooser(sendIntent, null)
                this@AppActivity.startActivity(shareIntent)
            }

        }

        setContent {
            App(
                shareService = shareService,
                onThemeChanged = { ThemeChanged(it) }
            )
        }
    }
}

@Composable
private fun ThemeChanged(isDark: Boolean) {
    val view = LocalView.current
    LaunchedEffect(isDark) {
        val window = (view.context as Activity).window
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = isDark
            isAppearanceLightNavigationBars = isDark
        }
    }
}
