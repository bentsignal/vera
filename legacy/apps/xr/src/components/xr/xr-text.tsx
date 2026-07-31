import type { TextProperties } from "@react-three/uikit";
import type { ReactNode } from "react";
import { Text } from "@react-three/uikit";

import { extractTextFromChildren } from "@acme/features/messages/extract-text";

import { hexColors, xrStyles } from "~/styles/styles";

export function TextElement({
  children,
  color = hexColors.foreground,
  ...props
}: {
  children: ReactNode;
} & TextProperties) {
  return (
    <Text color={color} width="100%" flexShrink={0} flexWrap="wrap" {...props}>
      {extractTextFromChildren(children)}
    </Text>
  );
}

function Heading({
  children,
  size,
  ...props
}: {
  children: ReactNode;
  size: number;
} & TextProperties) {
  return (
    <TextElement fontSize={size} fontWeight="bold" {...props}>
      {children}
    </TextElement>
  );
}

export function H1({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.text2xl} {...props}>
      {children}
    </Heading>
  );
}

export function H2({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.textXl} {...props}>
      {children}
    </Heading>
  );
}

export function H3({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.textMd} {...props}>
      {children}
    </Heading>
  );
}

export function H4({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.textSm} {...props}>
      {children}
    </Heading>
  );
}

export function H5({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.textXs} {...props}>
      {children}
    </Heading>
  );
}

export function H6({
  children,
  ...props
}: { children: ReactNode } & TextProperties) {
  return (
    <Heading size={xrStyles.textXs - 2} {...props}>
      {children}
    </Heading>
  );
}
