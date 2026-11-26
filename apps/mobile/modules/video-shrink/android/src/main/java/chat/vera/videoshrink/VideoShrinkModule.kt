package chat.vera.videoshrink

import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.UUID

class ShrinkOptions : Record {
  /** Names this job in its `onProgress` events. */
  @Field val id: String = ""
  @Field val uri: String = ""
  /** The video's target bits per second. */
  @Field val bitrate: Int = 6_000_000
  /** The most the long and short sides may measure, in pixels. */
  @Field val maxLongSide: Int = 1920
  @Field val maxShortSide: Int = 1080
}

/**
 * Re-encodes a video smaller so it fits an upload limit, with Media3's
 * Transformer: H.264 at the bitrate asked for, no bigger than 1080p,
 * keeping rotation and the sound. H.264 because every Android phone can
 * encode it at 1080p, where some can't encode HEVC that big; HDR is
 * tone-mapped to SDR, which H.264 can carry. The app sends a video as it was
 * recorded when it already fits, so this only runs on the ones that don't.
 */
@UnstableApi
class VideoShrinkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VeraVideoShrink")
    Events("onProgress")

    AsyncFunction("shrinkAsync") { options: ShrinkOptions, promise: Promise ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_VIDEO_SHRINK", "No context", null)
      val source = Uri.parse(options.uri)
      val (width, height) = displaySize(context, source)
      val scale = minOf(
        1.0,
        options.maxLongSide.toDouble() / maxOf(width, height),
        options.maxShortSide.toDouble() / minOf(width, height),
      )
      val outWidth = even(width * scale)
      val outHeight = even(height * scale)
      val output = File(context.cacheDir, "shrunk-${UUID.randomUUID()}.mp4")

      val effects = if (scale < 1.0) {
        Effects(listOf(), listOf(Presentation.createForWidthAndHeight(outWidth, outHeight, Presentation.LAYOUT_SCALE_TO_FIT)))
      } else {
        Effects.EMPTY
      }
      val item = EditedMediaItem.Builder(MediaItem.fromUri(source)).setEffects(effects).build()
      val composition = Composition.Builder(EditedMediaItemSequence.Builder(item).build())
        .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
        .build()
      val main = Handler(Looper.getMainLooper())
      main.post {
        lateinit var transformer: Transformer
        var done = false
        transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setEncoderFactory(
            DefaultEncoderFactory.Builder(context)
              .setRequestedVideoEncoderSettings(
                VideoEncoderSettings.Builder().setBitrate(options.bitrate).build(),
              )
              .build(),
          )
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, result: ExportResult) {
              done = true
              promise.resolve(
                mapOf(
                  "height" to outHeight,
                  "size" to output.length().toDouble(),
                  "uri" to Uri.fromFile(output).toString(),
                  "width" to outWidth,
                ),
              )
            }

            override fun onError(
              composition: Composition,
              result: ExportResult,
              exception: ExportException,
            ) {
              done = true
              output.delete()
              promise.reject(CodedException("ERR_VIDEO_SHRINK", exception.message, exception))
            }
          })
          .build()
        transformer.start(composition, output.path)

        val holder = ProgressHolder()
        val poll = object : Runnable {
          override fun run() {
            if (done) return
            if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
              sendEvent("onProgress", mapOf("id" to options.id, "fraction" to holder.progress / 100.0))
            }
            main.postDelayed(this, 250)
          }
        }
        main.postDelayed(poll, 250)
      }
    }
  }
}

private fun even(value: Double) = maxOf(2, (Math.round(value / 2) * 2).toInt())

/** The video's width and height as it displays, after rotation. */
private fun displaySize(context: android.content.Context, uri: Uri): Pair<Int, Int> {
  val retriever = MediaMetadataRetriever()
  try {
    retriever.setDataSource(context, uri)
    val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
    val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
    val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    if (width == 0 || height == 0) throw CodedException("ERR_VIDEO_SHRINK", "Not a video", null)
    return if (rotation % 180 == 0) width to height else height to width
  } finally {
    retriever.release()
  }
}
