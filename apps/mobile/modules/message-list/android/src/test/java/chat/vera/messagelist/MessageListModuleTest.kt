package chat.vera.messagelist

import android.view.View
import expo.modules.kotlin.modules.DEFAULT_MODULE_VIEW
import expo.modules.kotlin.views.ViewManagerDefinition
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class MessageListModuleTest {
  @Test fun defaultExportRemainsTheListWhenTheNamedComposerHostIsRegistered() {
    // Build the real Expo definition: its first declared View gets DEFAULT.
    // No views or React runtime are constructed by this registration test.
    val definitions = MessageListModule().definition().viewManagerDefinitions
    val default = requireNotNull(definitions[DEFAULT_MODULE_VIEW])
    val list = requireNotNull(definitions["MessageListView"])
    val composer = requireNotNull(definitions["MessageListComposer"])
    assertEquals(MessageListView::class.java, viewType(default))
    assertEquals(MessageListComposer::class.java, viewType(composer))
    assertSame(list, default)
    assertNotSame(composer, default)
  }

  // Expo marks this definition property internal to its Kotlin module.
  // Inspect the actual registered class, without invoking the view factory.
  private fun viewType(definition: ViewManagerDefinition): Class<out View> {
    val field = ViewManagerDefinition::class.java.getDeclaredField("viewType")
    field.isAccessible = true
    @Suppress("UNCHECKED_CAST")
    return field.get(definition) as Class<out View>
  }
}
