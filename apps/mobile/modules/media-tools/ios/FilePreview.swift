import QuickLook
import UIKit

/// Shows one local file in Quick Look, the system's viewer.
final class FilePreview: NSObject, QLPreviewControllerDataSource {
  private var url: URL?

  func show(_ url: URL, from presenter: UIViewController) {
    self.url = url
    let controller = QLPreviewController()
    controller.dataSource = self
    presenter.present(controller, animated: true)
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    url == nil ? 0 : 1
  }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
    -> QLPreviewItem
  {
    (url ?? URL(fileURLWithPath: "/")) as NSURL
  }
}
