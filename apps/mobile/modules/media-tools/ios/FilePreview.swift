import QuickLook
import UIKit

/// One file for Quick Look. Its URL is nil while the file downloads, which
/// Quick Look shows as loading.
private final class PreviewItem: NSObject, QLPreviewItem {
  var previewItemURL: URL?
  var previewItemTitle: String?

  init(url: URL?, title: String?) {
    previewItemURL = url
    previewItemTitle = title
  }
}

/// Shows one file in Quick Look, the system's viewer. `begin` opens it at
/// once, loading, so a tap answers before the file has downloaded; `show`
/// then fills it in (or opens it, when nothing is waiting).
final class FilePreview: NSObject, QLPreviewControllerDataSource {
  private var item: PreviewItem?
  private weak var controller: QLPreviewController?

  func begin(title: String, from presenter: UIViewController) {
    present(PreviewItem(url: nil, title: title), from: presenter)
  }

  func show(_ url: URL, from presenter: UIViewController) {
    if let item, item.previewItemURL == nil, let controller, controller.presentingViewController != nil {
      item.previewItemURL = url
      controller.reloadData()
      return
    }
    present(PreviewItem(url: url, title: nil), from: presenter)
  }

  /// Closes a viewer still waiting for its file, when the download failed.
  func cancel() {
    guard let item, item.previewItemURL == nil else { return }
    controller?.dismiss(animated: true)
  }

  private func present(_ item: PreviewItem, from presenter: UIViewController) {
    self.item = item
    let controller = QLPreviewController()
    controller.dataSource = self
    self.controller = controller
    presenter.present(controller, animated: true)
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    item == nil ? 0 : 1
  }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
    -> QLPreviewItem
  {
    item ?? PreviewItem(url: nil, title: nil)
  }
}
