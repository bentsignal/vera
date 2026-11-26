package chat.vera.mediatools

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

/** Shares files in the app's `previews` cache folder with a viewer app. */
class MediaToolsFileProvider : FileProvider()

/**
 * Opens a local file in the app the system picks to view it, and reports
 * whether one did, so the caller can fall back to a browser.
 */
internal fun previewFile(context: Context, uri: String): Boolean {
  val file = File(Uri.parse(uri).path ?: return false)
  val shared = FileProvider.getUriForFile(context, "${context.packageName}.mediatools.files", file)
  val type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
    ?: "application/octet-stream"
  val intent = Intent(Intent.ACTION_VIEW).apply {
    setDataAndType(shared, type)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
  }
  return try {
    context.startActivity(intent)
    true
  } catch (error: ActivityNotFoundException) {
    false
  }
}
