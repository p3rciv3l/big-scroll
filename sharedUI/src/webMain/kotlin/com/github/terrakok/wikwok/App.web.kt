package com.github.terrakok.wikwok

import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.ClipEntry
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import com.github.terrakok.navigation3.browser.HierarchicalBrowserNavigation
import com.github.terrakok.navigation3.browser.buildBrowserHistoryFragment
import com.github.terrakok.wikwok.data.LikedArticles
import io.github.xxfast.kstore.KStore
import io.github.xxfast.kstore.storage.storeOf


actual fun createStore(name: String): KStore<LikedArticles> {
    return storeOf(name)
}

actual fun clipEntryOf(text: String): ClipEntry = ClipEntry.withPlainText(text)

@Composable
internal actual fun BrowserNavigation(backStack: NavBackStack<NavKey>) {
    HierarchicalBrowserNavigation {
        when (backStack.lastOrNull()) {
            is LikedArticlesDestination -> buildBrowserHistoryFragment("liked_articles")
            else -> null
        }
    }
}