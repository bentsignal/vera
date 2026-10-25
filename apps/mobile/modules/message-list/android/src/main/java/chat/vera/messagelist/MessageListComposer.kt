package chat.vera.messagelist

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import android.view.View
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UIManager
import com.facebook.react.bridge.UIManagerListener
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicLong

/** Ordinary Fabric/Yoga container. Fabric lays out its existing Bar child. */
@SuppressLint("ViewConstructor")
class MessageListComposer(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  internal var owner = ""
    set(value) {
      if (field == value) return
      ComposerHosts.remove(this)
      field = value
      lifetime = nextLifetime.incrementAndGet()
      ComposerHosts.add(this)
    }
  internal var registration: ComposerHosts.Registration? = null
  internal var sequence = 0L
  internal var lifetime = nextLifetime.incrementAndGet()
    private set

  init {
    clipChildren = false
    clipToPadding = false
  }

  // Fabric owns both frames. LinearLayout must not remeasure or reposition Bar.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  override fun onAttachedToWindow() {
    lifetime = nextLifetime.incrementAndGet()
    super.onAttachedToWindow()
    ComposerHosts.add(this)
  }

  override fun onDetachedFromWindow() {
    ComposerHosts.remove(this)
    super.onDetachedFromWindow()
  }

  companion object { private val nextLifetime = AtomicLong() }
}

/** Module-local weak index. No window traversal or global React/Expo hook. */
@OptIn(UnstableReactNativeAPI::class)
internal object ComposerHosts {
  data class Key(val surface: Int, val owner: String, val window: android.os.IBinder)
  data class Registration(val root: WeakReference<View>, val key: Key)
  private val roots = WeakHashMap<View, MutableMap<Key, WeakHosts<MessageListComposer>>>()

  fun add(host: MessageListComposer) {
    remove(host)
    if (!host.isAttachedToWindow || host.owner.isEmpty()) return
    val window = host.windowToken ?: return
    val surface = UIManagerHelper.getSurfaceId(host)
    if (surface < 0) return
    val key = Key(surface, host.owner, window)
    val root = host.rootView
    roots.getOrPut(root) { mutableMapOf() }.getOrPut(key) { WeakHosts() }.add(host)
    host.registration = Registration(WeakReference(root), key)
  }

  fun remove(host: MessageListComposer) {
    val registration = host.registration ?: return
    host.registration = null
    val root = registration.root.get() ?: return
    val owners = roots[root] ?: return
    val hosts = owners[registration.key] ?: return
    hosts.remove(host)
    if (hosts.empty) owners.remove(registration.key)
    if (owners.isEmpty()) roots.remove(root)
  }

  /** Ordinary lookup is one map access and one weak dereference. Checking
   * the bucket each time also prevents a cached host hiding a live duplicate. */
  fun find(list: View, owner: String): MessageListComposer? {
    val window = list.windowToken ?: return null
    val surface = UIManagerHelper.getSurfaceId(list)
    if (surface < 0 || !list.isAttachedToWindow) return null
    val key = Key(surface, owner, window)
    val hosts = roots[list.rootView]?.get(key) ?: return null
    return hosts.single { host ->
      host.isAttachedToWindow && host.rootView === list.rootView && host.owner == owner &&
        host.windowToken == window && UIManagerHelper.getSurfaceId(host) == surface
    }
  }
}

/** Per-list listener; registered and removed with that list's native lifetime. */
@OptIn(UnstableReactNativeAPI::class)
internal class ComposerMounts(private val list: View, private val before: () -> Unit, private val after: (ComposerSample?) -> Unit) : UIManagerListener {
  var owner: String? = null
  private var manager: UIManager? = null
  private var sealedHost: WeakReference<MessageListComposer>? = null

  fun attach(context: ReactContext?) {
    if (manager != null || context == null) return
    manager = UIManagerHelper.getUIManager(context, UIManagerType.FABRIC)?.also { it.addUIManagerEventListener(this) }
  }

  fun detach() {
    manager?.removeUIManagerEventListener(this)
    manager = null
    sealedHost = null
  }

  /** Revalidate presence, never discover or read new geometry between seals. */
  fun valid(sample: ComposerSample?): Boolean {
    if (sample == null) return true
    val host = sealedHost?.get() ?: return false
    return owner?.let { ComposerHosts.find(list, it) } === host && host.isAttachedToWindow && list.isAttachedToWindow && host.owner == owner &&
      host.lifetime == sample.lifetime && host.sequence == sample.sequence &&
      host.windowToken == list.windowToken && UIManagerHelper.getSurfaceId(host) == UIManagerHelper.getSurfaceId(list) &&
      host.height / host.resources.displayMetrics.density == sample.height
  }

  override fun willMountItems(uiManager: UIManager) {
    if (manager === uiManager && list.isAttachedToWindow) before()
  }
  override fun didMountItems(uiManager: UIManager) {
    if (manager === uiManager && list.isAttachedToWindow) after(find())
  }
  override fun willDispatchViewUpdates(uiManager: UIManager) = Unit
  override fun didDispatchMountItems(uiManager: UIManager) = Unit
  override fun didScheduleMountItems(uiManager: UIManager) = Unit

  private fun find(): ComposerSample? {
    val name = owner ?: run { sealedHost = null; return null }
    val host = ComposerHosts.find(list, name) ?: run {
      sealedHost = null
      composerTrace(list) { "fallback owner=$name missingOrAmbiguousHost=true" }
      return null
    }
    val bar = if (host.childCount == 1) host.getChildAt(0) else return null
    if (bar.left != 0 || bar.top != 0 || bar.height != host.height || bar.width != host.width) {
      sealedHost = null
      composerTrace(list) { "fallback owner=$name sequence=${host.sequence} host=${host.width}x${host.height} bar=${bar.left},${bar.top},${bar.width}x${bar.height}" }
      return null
    }
    // Keep the valid weak cache. The registry lookup above detects duplicates
    // in O(1) for the ordinary single-host case without scanning any view tree.
    if (sealedHost?.get() !== host) sealedHost = WeakReference(host)
    return ComposerSample(host.lifetime, host.sequence, host.height / host.resources.displayMetrics.density)
  }

}

internal inline fun composerTrace(view: View, message: () -> String) {
  if ((view.context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0 &&
    Log.isLoggable("VeraComposerLayout", Log.DEBUG)) Log.d("VeraComposerLayout", "uptime=${android.os.SystemClock.uptimeMillis()} ${message()}")
}
