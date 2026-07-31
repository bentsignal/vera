export function getFileSize(size?: number) {
  if (!size) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function getFileType(fileType?: string) {
  if (fileType?.startsWith("image/")) {
    return "image";
  }
  if (
    fileType?.startsWith("text/") ||
    fileType?.startsWith("application/pdf")
  ) {
    return "document";
  }
  return "file";
}
