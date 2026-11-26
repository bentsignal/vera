package chat.vera.mediatools

import androidx.media3.common.util.UnstableApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Vera's media tools: shrinking photos and videos before they're sent, and
 * showing a file in the system's viewer. The app loads it optionally, so
 * builds without it send media as picked and open files in a browser.
 */
@UnstableApi
class MediaToolsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw CodedException("ERR_MEDIA_TOOLS", "No context", null)

  override fun definition() = ModuleDefinition {
    Name("VeraMediaTools")
    Events("onProgress")

    AsyncFunction("shrinkVideoAsync") { options: VideoOptions, promise: Promise ->
      shrinkVideo(context, options, promise) { fraction ->
        sendEvent("onProgress", mapOf("id" to options.id, "fraction" to fraction))
      }
    }

    AsyncFunction("shrinkImageAsync") { options: ImageOptions ->
      shrinkImage(context, options)
    }

    AsyncFunction("previewFileAsync") { uri: String ->
      previewFile(context, uri)
    }
  }
}
