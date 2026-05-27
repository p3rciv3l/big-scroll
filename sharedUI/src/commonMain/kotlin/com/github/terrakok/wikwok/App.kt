package com.github.terrakok.wikwok

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.*
import androidx.navigation3.ui.NavDisplay
import androidx.savedstate.serialization.SavedStateConfiguration
import co.touchlab.kermit.Logger
import co.touchlab.kermit.Severity
import co.touchlab.kermit.loggerConfigInit
import co.touchlab.kermit.platformLogWriter
import coil3.ImageLoader
import coil3.compose.LocalPlatformContext
import com.github.terrakok.wikwok.data.LikedArticles
import com.github.terrakok.wikwok.data.LikedArticlesStore
import com.github.terrakok.wikwok.data.ShareService
import com.github.terrakok.wikwok.data.WikipediaService
import com.github.terrakok.wikwok.theme.AppTheme
import com.github.terrakok.wikwok.ui.LikedArticlesScreen
import com.github.terrakok.wikwok.ui.WikipediaScreen
import com.russhwolf.settings.Settings
import io.github.xxfast.kstore.KStore
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import wikwok.composeapp.generated.resources.Res
import wikwok.composeapp.generated.resources.app_name
import wikwok.composeapp.generated.resources.ic_arrow_back
import wikwok.composeapp.generated.resources.text_copied

internal val Log = Logger(
    config = loggerConfigInit(
        platformLogWriter(),
        minSeverity = Severity.Info
    ),
    tag = "WikWok"
)

internal val LocalImageLoader = compositionLocalOf<ImageLoader> { error("ImageLoader not provided") }
internal val LocalShareService = compositionLocalOf<ShareService> { error("ShareService not provided") }
internal val wikipediaService = WikipediaService()
internal val likedArticlesStore = LikedArticlesStore(createStore("liked_articles_store"))
internal val settings = Settings()

internal expect fun createStore(name: String): KStore<LikedArticles>
internal expect fun clipEntryOf(text: String): ClipEntry

@Composable
fun App(
    shareService: ShareService? = null,
    onThemeChanged: @Composable (isDark: Boolean) -> Unit = {}
) = AppTheme(onThemeChanged) {
    val context = LocalPlatformContext.current
    val imageLoader = remember(context) { ImageLoader(context) }
    val coroutineScope = rememberCoroutineScope()
    val clipboard = LocalClipboard.current
    val snackbarHostState = remember { SnackbarHostState() }

    val share = shareService ?: object : ShareService {
        override fun share(text: String) {
            coroutineScope.launch {
                clipboard.setClipEntry(clipEntryOf(text))
                snackbarHostState.showSnackbar(getString(Res.string.text_copied))
            }
        }
    }

    CompositionLocalProvider(
        LocalImageLoader provides imageLoader,
        LocalShareService provides share,
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            snackbarHost = { SnackbarHost(snackbarHostState) }
        ) {
            val backStack = rememberNavBackStack(navSerializationConfig, MainDestination)
            BrowserNavigation(backStack)
            NavDisplay(
                backStack = backStack,
                entryDecorators = listOf(
                    rememberSaveableStateHolderNavEntryDecorator(),
                    rememberViewModelStoreNavEntryDecorator()
                ),
                entryProvider = entryProvider {
                    entry<MainDestination> {
                        WikipediaScreen(onLikedArticlesClick = { backStack.add(LikedArticlesDestination) })
                    }
                    entry<LikedArticlesDestination> {
                        LikedArticlesScreen()
                    }
                }
            )

            val isBackVisible = backStack.size > 1

            Row(
                modifier = Modifier
                    .padding(16.dp)
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
                    )
                    .background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(50))
                    .padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                AnimatedVisibility(isBackVisible) {
                    IconButton(
                        modifier = Modifier.size(24.dp),
                        onClick = { backStack.removeLastOrNull() }
                    ) {
                        Icon(
                            imageVector = vectorResource(Res.drawable.ic_arrow_back),
                            contentDescription = "Back",
                            tint = Color.White
                        )
                    }
                }
                Text(
                    text = stringResource(Res.string.app_name),
                    style = MaterialTheme.typography.headlineMedium,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }
        }
    }
}


@Serializable
@SerialName("main")
internal data object MainDestination : NavKey

@Serializable
@SerialName("liked_articles")
internal data object LikedArticlesDestination : NavKey

private val navSerializationConfig = SavedStateConfiguration {
    serializersModule = SerializersModule {
        polymorphic(NavKey::class) {
            subclass(MainDestination::class, MainDestination.serializer())
            subclass(LikedArticlesDestination::class, LikedArticlesDestination.serializer())
        }
    }
}

@Composable
internal expect fun BrowserNavigation(backStack: NavBackStack<NavKey>)
