package com.github.terrakok.wikwok

import android.content.ClipData
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.toClipEntry
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import com.github.terrakok.wikwok.data.LikedArticles
import io.github.vinceglb.filekit.FileKit
import io.github.vinceglb.filekit.filesDir
import io.github.vinceglb.filekit.path
import io.github.vinceglb.filekit.resolve
import io.github.xxfast.kstore.KStore
import io.github.xxfast.kstore.file.storeOf

actual fun createStore(name: String): KStore<LikedArticles> {
    return storeOf(
        kotlinx.io.files.Path(FileKit.filesDir.resolve("$name.json").path)
    )
}

actual fun clipEntryOf(text: String): ClipEntry =
    ClipData.newPlainText("Share", text).toClipEntry()

@Composable
internal actual fun BrowserNavigation(backStack: NavBackStack<NavKey>) {
}