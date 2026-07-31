import type { ReactNode } from "react";

export function extractTextFromChildren(children: ReactNode) {
  return extractText(children);
}

// eslint-disable-next-line no-restricted-syntax -- explicit return type required for recursive function
function extractText(node: ReactNode): string {
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    let result = "";
    for (const child of node) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Array.isArray narrows ReactNode to any[], cast needed
      result += extractText(child as ReactNode);
    }
    return result;
  }
  if (
    typeof node === "object" &&
    node !== null &&
    "props" in node &&
    typeof node.props === "object" &&
    node.props !== null &&
    "children" in node.props
  ) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ReactElement.props.children is typed as unknown, safe narrowing to ReactNode
    return extractText(node.props.children as ReactNode);
  }
  return "";
}
