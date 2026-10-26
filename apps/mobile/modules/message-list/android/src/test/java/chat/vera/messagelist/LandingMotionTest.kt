package chat.vera.messagelist

import android.animation.ValueAnimator
import android.app.Activity
import android.content.Context
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import java.time.Duration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.util.ReflectionHelpers

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
class LandingMotionTest {
  private class MovingView(context: Context) : View(context) {
    var translationWrites = 0
    override fun setTranslationY(value: Float) {
      translationWrites++
      super.setTranslationY(value)
    }
  }

  private class Holder(val view: MovingView) : RecyclerView.ViewHolder(view)

  private class Rows : RecyclerView.Adapter<Holder>() {
    override fun getItemCount() = 10
    override fun onCreateViewHolder(parent: ViewGroup, type: Int) = Holder(MovingView(parent.context).apply {
      layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 129)
    })
    override fun onBindViewHolder(holder: Holder, position: Int) {}
  }

  private fun checkLanding(change: Boolean, running: Boolean) {
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val animator = ListItemAnimator(Units(activity))
    val list = RecyclerView(activity).apply {
      layoutManager = ListLayoutManager(activity)
      adapter = Rows()
      itemAnimator = animator
    }
    // Keep the RecyclerView's dimensions fixed when the activity's first
    // scheduled traversal runs, instead of resizing it to the test display.
    activity.setContentView(FrameLayout(activity).apply {
      addView(list, FrameLayout.LayoutParams(1080, 2424))
    })
    shadowOf(Looper.getMainLooper()).idle()
    list.layoutInPlace(1080, 2424)
    val held = list.findViewHolderForAdapterPosition(0) as Holder
    val neighbor = list.findViewHolderForAdapterPosition(1) as Holder
    val finalHome = IntArray(2).also { held.view.getLocationOnScreen(it) }
    assertEquals(1f, ValueAnimator.getDurationScale(), 0f)
    fun move(holder: Holder) {
      val top = holder.view.top
      assertTrue(if (change) animator.animateChange(holder, holder, 0, top - 168, 0, top)
        else animator.animateMove(holder, 0, top - 168, 0, top))
    }
    try {
      move(held)
      move(neighbor)
      if (running) animator.runPendingAnimations()
      val presentation = IntArray(2).also { held.view.getLocationOnScreen(it) }
      assertEquals(finalHome[1] - 168, presentation[1])

      // This is the production Lifter's destination capture, before its
      // 240 ms landing and the frame-commit handback drawing.
      val destination = landingDestination(held)
      assertEquals(finalHome[1], destination[1])
      assertEquals(0f, held.view.translationY, 0f)
      assertEquals(-168f, neighbor.view.translationY, 0f)
      assertEquals(420L, animator.moveMs)
      val heldWrites = held.view.translationWrites
      animator.runPendingAnimations()
      val neighborClock = ReflectionHelpers.getField<Map<RecyclerView.ViewHolder, ValueAnimator>>(animator, "running")[neighbor]!!
      // Seek the actual neighbor clock deterministically. Robolectric's
      // traversal/vsync work can advance farther than idleFor requests.
      neighborClock.currentPlayTime = 100
      assertEquals(420L, neighborClock.duration)
      assertTrue(neighborClock.isRunning)
      assertTrue(neighbor.view.translationY < 0f && neighbor.view.translationY > -168f)
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(100))
      // A queued runner or canceled running clock must not revive the held
      // row, even while the neighbor's remaining clock is drained.
      assertEquals(heldWrites, held.view.translationWrites)
      assertEquals(0f, held.view.translationY, 0f)
      val returnedHome = IntArray(2).also { held.view.getLocationOnScreen(it) }
      assertEquals(destination[1], returnedHome[1])
    } finally {
      animator.endAnimations()
      controller.pause().stop().destroy()
    }
  }

  @Test fun pendingMoveCapturesFinalHomeWithoutRestartingItsQueuedAnimation() = checkLanding(change = false, running = false)
  @Test fun pendingChangeCapturesFinalHomeWithoutRestartingItsQueuedAnimation() = checkLanding(change = true, running = false)
  @Test fun runningMoveCapturesFinalHomeWhileNeighborKeepsAnimating() = checkLanding(change = false, running = true)
  @Test fun runningChangeCapturesFinalHomeWhileNeighborKeepsAnimating() = checkLanding(change = true, running = true)
}
