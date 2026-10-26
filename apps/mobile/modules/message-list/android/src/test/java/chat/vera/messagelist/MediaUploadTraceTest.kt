package chat.vera.messagelist

import android.content.pm.ApplicationInfo
import android.util.Log
import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class MediaUploadTraceTest {
  @Test fun lifetimeDetailsAreCollectedOnlyWhenBothDebuggableAndExplicitlyEnabled() {
    val app = RuntimeEnvironment.getApplication()
    val original = app.applicationInfo.flags
    val view = View(app)
    try {
      app.applicationInfo.flags = original or ApplicationInfo.FLAG_DEBUGGABLE
      ShadowLog.setLoggable("VeraMediaUpload", Log.INFO)
      mediaUploadTrace(view) { error("Opt-out must not collect details") }
      app.applicationInfo.flags = original and ApplicationInfo.FLAG_DEBUGGABLE.inv()
      ShadowLog.setLoggable("VeraMediaUpload", Log.DEBUG)
      mediaUploadTrace(view) { error("Release must not collect details") }
      assertTrue(ShadowLog.getLogsForTag("VeraMediaUpload").isEmpty())
      app.applicationInfo.flags = original or ApplicationInfo.FLAG_DEBUGGABLE
      mediaUploadTrace(view) { "START reason=bind" }
      val lines = ShadowLog.getLogsForTag("VeraMediaUpload")
      assertEquals(1, lines.size)
      assertTrue(lines.single().msg.matches(Regex("uptime=[0-9]+ START reason=bind")))
    } finally {
      app.applicationInfo.flags = original
    }
  }
}
