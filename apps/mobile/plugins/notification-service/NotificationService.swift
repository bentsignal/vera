import Intents
import UIKit
import UserNotifications

/// Turns Vera message pushes into iOS communication notifications: the
/// sender's photo (or an initials monogram) becomes the large icon with the
/// app icon as a badge, the sender is the title, and groups and channels show
/// their name. Reads the push `data` sent by
/// `@decentralized-convex/messages` (`notifications.ts`). Any failure or
/// timeout delivers the push unchanged.
///
/// Installed by `plugins/with-notification-service.cjs`.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    lock.lock()
    self.contentHandler = contentHandler
    original = request.content
    lock.unlock()

    guard let message = IncomingMessage(userInfo: request.content.userInfo) else {
      finish(request.content)
      return
    }
    SenderImage.load(for: message) { image in
      let intent = message.intent(senderImage: image)
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        // Donation only improves suggestions; show the notification either way.
        let updated = try? request.content.updating(from: intent)
        self.finish(Self.keepingBadge(updated ?? request.content, from: request.content))
      }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let content = original
    lock.unlock()
    if let content { finish(content) }
  }

  /// The push's app icon badge, which a closed app relies on entirely. The
  /// copy `updating(from:)` returns may leave it out, so put it back.
  private static func keepingBadge(
    _ content: UNNotificationContent,
    from original: UNNotificationContent
  ) -> UNNotificationContent {
    guard let badge = original.badge, content.badge != badge,
      let copy = content.mutableCopy() as? UNMutableNotificationContent
    else { return content }
    copy.badge = badge
    return copy
  }

  /// Delivers once; later calls (for example after a timeout) are ignored.
  private func finish(_ content: UNNotificationContent) {
    lock.lock()
    let handler = contentHandler
    contentHandler = nil
    lock.unlock()
    handler?(content)
  }
}

/// The fields of a Vera message push that the extension needs.
struct IncomingMessage {
  let accountId: String?
  let body: String
  let conversationId: String
  let conversationName: String?
  let senderAvatarUrl: URL?
  let senderId: String
  let senderName: String

  init?(userInfo: [AnyHashable: Any]) {
    // Expo delivers the push `data` under `body`.
    let data = userInfo["body"] as? [String: Any] ?? [:]
    guard
      let conversationId = data["conversationId"] as? String,
      let senderId = data["senderId"] as? String,
      let senderName = data["senderName"] as? String
    else { return nil }
    let aps = userInfo["aps"] as? [String: Any]
    let alert = aps?["alert"] as? [String: Any]
    self.accountId = data["accountId"] as? String
    self.body = alert?["body"] as? String ?? ""
    self.conversationId = conversationId
    self.conversationName = (data["conversationName"] as? String)
      .flatMap { $0.isEmpty ? nil : $0 }
    self.senderAvatarUrl = (data["senderAvatarUrl"] as? String)
      .flatMap(URL.init(string:))
    self.senderId = senderId
    self.senderName = senderName
  }

  var isGroup: Bool { conversationName != nil }

  func intent(senderImage: INImage) -> INSendMessageIntent {
    let sender = INPerson(
      personHandle: INPersonHandle(value: senderId, type: .unknown),
      nameComponents: nil,
      displayName: senderName,
      image: senderImage,
      contactIdentifier: nil,
      customIdentifier: senderId,
      isMe: false,
      suggestionType: .instantMessageAddress
    )
    let me = INPerson(
      personHandle: INPersonHandle(value: accountId ?? "", type: .unknown),
      nameComponents: nil,
      displayName: nil,
      image: nil,
      contactIdentifier: nil,
      customIdentifier: accountId,
      isMe: true,
      suggestionType: .none
    )
    // iOS shows a group notification only with more than one recipient.
    let intent = INSendMessageIntent(
      recipients: isGroup ? [me, sender] : [me],
      outgoingMessageType: .outgoingMessageText,
      content: body,
      speakableGroupName: conversationName.map {
        INSpeakableString(spokenPhrase: $0)
      },
      conversationIdentifier: conversationId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    if isGroup {
      // Vera groups have no photo; show the sender's, like a direct message.
      intent.setImage(senderImage, forParameterNamed: \.speakableGroupName)
    }
    return intent
  }
}

/// The sender's profile photo, or an initials monogram matching the app's
/// `Avatar`: white initials on iMessage's soft gray gradient.
enum SenderImage {
  private static let size = CGSize(width: 180, height: 180)

  static func load(
    for message: IncomingMessage,
    completion: @escaping (INImage) -> Void
  ) {
    let monogram = { monogramImage(for: message.senderName) }
    guard let url = message.senderAvatarUrl else {
      completion(monogram())
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 10
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard
        (200..<300).contains(status),
        let data,
        let photo = UIImage(data: data),
        let png = scaled(photo).pngData()
      else {
        completion(monogram())
        return
      }
      completion(INImage(imageData: png))
    }.resume()
  }

  /// Square-crops and downsizes so the extension stays within its memory limit.
  private static func scaled(_ photo: UIImage) -> UIImage {
    let side = min(photo.size.width, photo.size.height)
    guard side > 0 else { return photo }
    let scale = max(size.width / side, size.height / side)
    let drawn = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
    let origin = CGPoint(x: (size.width - drawn.width) / 2, y: (size.height - drawn.height) / 2)
    return renderer().image { _ in
      photo.draw(in: CGRect(origin: origin, size: drawn))
    }
  }

  static func monogramImage(for name: String) -> INImage {
    let image = renderer().image { context in
      let colors = [
        UIColor(red: 0xA6 / 255, green: 0xAB / 255, blue: 0xB8 / 255, alpha: 1).cgColor,
        UIColor(red: 0x85 / 255, green: 0x89 / 255, blue: 0x94 / 255, alpha: 1).cgColor,
      ]
      if let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: colors as CFArray,
        locations: [0, 1]
      ) {
        context.cgContext.drawLinearGradient(
          gradient,
          start: .zero,
          end: CGPoint(x: 0, y: size.height),
          options: []
        )
      }
      let text = initials(name) as NSString
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: size.height * 0.42, weight: .semibold),
        .foregroundColor: UIColor.white,
      ]
      let textSize = text.size(withAttributes: attributes)
      text.draw(
        at: CGPoint(
          x: (size.width - textSize.width) / 2,
          y: (size.height - textSize.height) / 2
        ),
        withAttributes: attributes
      )
    }
    return image.pngData().map(INImage.init(imageData:)) ?? INImage(imageData: Data())
  }

  /// Up to two initials, like the app's `Avatar`.
  static func initials(_ name: String) -> String {
    name.split(whereSeparator: \.isWhitespace)
      .prefix(2)
      .compactMap { $0.first.map { String($0).uppercased() } }
      .joined()
  }

  private static func renderer() -> UIGraphicsImageRenderer {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format)
  }
}
