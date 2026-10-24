import Foundation

/// Which of the list's tap recognizers a touch goes to, decided once from
/// what's under it as it lands (MessageListView `shouldReceive`). Pure, so
/// Tests/ checks it.
///
/// - A reaction (chip or tapback) goes to `reactionTap`: it answers on
///   release, with its haptic, and a double tap there is two taps.
/// - A photo or video, alone or a carousel's card or a deck's front card
///   (`hit` reports `element: "media"`), goes to `mediaPress`: it opens on
///   the first release, with no double-tap wait. A double tap on media no
///   longer opens the menu (approved by Shawn, as the React Native list's
///   own photos behaved); holding it still does.
/// - Everything else, a caption's text included, goes to the message's
///   single tap and double tap: the single tap waits for the double tap,
///   which opens the menu.
///
/// The long press isn't routed: it sees every touch and opens the menu
/// whatever is under it.
enum TapRoute: Equatable {
  case reaction, media, message

  enum Recognizer: CaseIterable {
    case reactionTap, mediaPress, tap, doubleTap
  }

  init(onReaction: Bool, element: String?) {
    if onReaction {
      self = .reaction
    } else if element == "media" {
      self = .media
    } else {
      self = .message
    }
  }

  /// Whether `recognizer` gets a touch routed here.
  func receives(_ recognizer: Recognizer) -> Bool {
    switch (self, recognizer) {
    case (.reaction, .reactionTap), (.media, .mediaPress), (.message, .tap), (.message, .doubleTap):
      return true
    default:
      return false
    }
  }
}
