package chat.vera.mediatools

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.util.UUID

class ImageOptions : Record {
  @Field val uri: String = ""
  /** The most the long side may measure, in pixels. Smaller photos keep their size. */
  @Field val maxSide: Int = 2048
  @Field val quality: Double = 0.8
}

/**
 * A photo as a JPEG no bigger than `maxSide`, turned upright, without its
 * metadata (location included).
 */
internal fun shrinkImage(context: Context, options: ImageOptions): Map<String, Any> {
  val source = Uri.parse(options.uri)
  val resolver = context.contentResolver
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  resolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, bounds) }
  if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
    throw CodedException("ERR_IMAGE_SHRINK", "Not an image", null)
  }
  // Decode at the smallest power-of-two step that's still at least maxSide.
  var sample = 1
  while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= options.maxSide) sample *= 2
  val decoded = resolver.openInputStream(source)?.use {
    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
  } ?: throw CodedException("ERR_IMAGE_SHRINK", "Couldn't read the image", null)

  val orientation = resolver.openInputStream(source)?.use {
    ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
  } ?: ExifInterface.ORIENTATION_NORMAL
  val scale = minOf(1f, options.maxSide.toFloat() / maxOf(decoded.width, decoded.height))
  val matrix = Matrix().apply {
    postScale(scale, scale)
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { postRotate(90f); postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { postRotate(270f); postScale(-1f, 1f) }
    }
  }
  val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
  val output = File(context.cacheDir, "shrunk-${UUID.randomUUID()}.jpg")
  output.outputStream().use {
    upright.compress(Bitmap.CompressFormat.JPEG, (options.quality * 100).toInt(), it)
  }
  if (upright !== decoded) decoded.recycle()
  val result = mapOf(
    "height" to upright.height,
    "size" to output.length().toDouble(),
    "uri" to Uri.fromFile(output).toString(),
    "width" to upright.width,
  )
  upright.recycle()
  return result
}
