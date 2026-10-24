package chat.vera.messagelist

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TypingAndPartsTest {
  private val maya = Person("maya", "Maya", null, "M")

  private fun message(blocks: List<Block>, stacked: Boolean = false, reactions: List<Reaction> = emptyList()) =
    MessageRow("m1", stacked, maya, false, true, true, true, 0.0, "9:41", blocks, reactions, emptyList(), null, false, true, "")

  private fun text(value: String, jumbo: Boolean = false) = TextBlock(listOf(Span(value, null, null, null)), jumbo, "text")

  private fun reaction(key: String, count: Int = 1) = Reaction(key, "👍", null, null, count, false)

  private fun photo(index: Int, reactions: List<Reaction> = emptyList()) =
    MediaItem("p$index", false, "https://example.com/$index.jpg", null, null, 1200, 900, null, "part-$index", reactions, false)

  @Test fun onlyTextBubblesGrowOutOfTheTypingBubble() {
    assertTrue(morphs(message(listOf(text("hi")))))
    assertTrue(morphs(message(listOf(text("one"), text("two")))))
    // As the React Native list's morphs(): no photos, quote, link card.
    assertFalse(morphs(message(listOf(MediaBlock(listOf(photo(0)), null), text("caption")))))
    assertFalse(morphs(message(listOf(QuoteBlock(maya, "earlier", null, "m0", null), text("reply")))))
    assertFalse(morphs(message(listOf(text("look"), LinkCardBlock("https://vera.chat", null, null, null, null, null, "vera.chat", null)))))
    assertFalse(morphs(message(listOf(text("👋", jumbo = true)))))
    assertFalse(morphs(message(listOf(text("hi")), stacked = true)))
    assertFalse(morphs(message(emptyList())))
  }

  @Test fun aDecksTapbacksAreItsFrontPhotosOwn() {
    // Before: every photo's reactions merged on the front card, so a tap
    // could toggle a reaction on a photo out of view.
    val deck = MediaBlock(listOf(photo(0, listOf(reaction("part-0|👍"))), photo(1, listOf(reaction("part-1|❤️", 2)))), "deck")
    assertEquals(listOf("part-0|👍"), tapbackReactions(deck, 0, emptyList()).map { it.key })
    assertEquals(listOf("part-1|❤️"), tapbackReactions(deck, 1, emptyList()).map { it.key })
    // The message's own reactions follow when they sit on this part.
    val own = listOf(reaction("message|😂"))
    assertEquals(listOf("part-1|❤️", "message|😂"), tapbackReactions(deck, 1, own).map { it.key })
    // A front index past the end (the group shrank) falls back to the first.
    assertEquals(listOf("part-0|👍"), tapbackReactions(deck, 5, emptyList()).map { it.key })
    assertEquals(own, tapbackReactions(text("hi"), null, own))
  }

  private fun typing(extra: Map<String, Any>): TypingRow {
    val people = JavaOnlyArray.of(JavaOnlyMap.of("id", "maya", "name", "Maya", "initials", "M"))
    val fields = mutableListOf<Any>("id", "typing", "kind", "typing", "layout", "bubbles", "label", "Maya is typing", "people", people)
    for ((key, value) in extra) {
      fields.add(key)
      fields.add(value)
    }
    return decodeRow(JavaOnlyMap.of(*fields.toTypedArray())) as TypingRow
  }

  @Test fun typingFacesFollowShowFacesAndDefaultToShown() {
    assertTrue(typing(emptyMap()).showFaces)
    assertTrue(typing(mapOf("showFaces" to true)).showFaces)
    val dm = typing(mapOf("showFaces" to false))
    assertFalse(dm.showFaces)
    // Still sent, for the hand-off to their message.
    assertEquals(listOf("maya"), dm.people.map { it.id })
    // A mistyped value is ignored, not a crash.
    assertTrue(typing(mapOf("showFaces" to "no")).showFaces)
  }
}
