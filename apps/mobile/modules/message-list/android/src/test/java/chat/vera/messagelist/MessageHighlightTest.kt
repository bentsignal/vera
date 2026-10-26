package chat.vera.messagelist

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MessageHighlightTest {
  @Test fun highlightPaintsOnlyItsRowEvenWhenTheParentAllowsOverflow() {
    val context = RuntimeEnvironment.getApplication()
    val units = Units(context)
    val row = MessageRow("target", true, Person("author", "Author", null, "A"), false, false, false, true,
      0.0, "10:08", listOf(TextBlock(listOf(Span("Target", null, null, null)), false, "body")),
      emptyList(), emptyList(), null, true, false, "Target")
    val env = CellEnv(units, Images(Glide.with(context)), RecyclerView.RecycledViewPool())
    val cell = MessageCell(context, env, signatureOf(row)).apply {
      bind(row, animate = false)
      measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
      layout(0, 0, measuredWidth, measuredHeight)
    }
    val bitmap = Bitmap.createBitmap(400, cell.height + 200, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    // RecyclerView allows content such as tapbacks outside a cell. Its clip can
    // therefore cover neighboring rows, even though this canvas is translated.
    canvas.translate(50f, 100f)
    cell.draw(canvas)
    assertNotEquals(Color.TRANSPARENT, bitmap.getPixel(340, 100 + cell.height / 2))
    assertEquals("above the target", Color.TRANSPARENT, bitmap.getPixel(200, 50))
    assertEquals("below the target", Color.TRANSPARENT, bitmap.getPixel(200, cell.height + 150))
    assertEquals("left of the target", Color.TRANSPARENT, bitmap.getPixel(25, 100 + cell.height / 2))
    assertEquals("right of the target", Color.TRANSPARENT, bitmap.getPixel(375, 100 + cell.height / 2))
  }
}
