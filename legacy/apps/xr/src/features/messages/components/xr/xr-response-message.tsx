import { Container, Text } from "@react-three/uikit";
import {
  Brain,
  Clock,
  // Code,
  File,
  Globe,
  Newspaper,
  Sun,
} from "@react-three/uikit-lucide";

import type {
  MyUIMessage,
  NoticeCode,
  SystemError,
} from "@acme/features/messages";
import {
  getErrorMessage,
  getNoticeMessage,
  getStatusLabel,
  getVisibleErrors,
} from "@acme/features/messages";

import { TextElement } from "~/components/xr/xr-text";
import { hexColors, xrStyles } from "~/styles/styles";
import { XRMarkdown } from "./xr-markdown";

export function XRResponseMessage({ message }: { message: MyUIMessage }) {
  const visibleErrors = getVisibleErrors(message);
  const notices = message.notices ?? [];
  const hasTextContent = message.text.length > 0;

  return (
    <Container
      flexDirection="column"
      gap={xrStyles.spacingLg}
      flexShrink={0}
      flexWrap="wrap"
    >
      <MessageStatus message={message} />
      {hasTextContent && <XRMarkdown content={message.text} />}
      {notices.map((notice, i) => (
        <NoticeMessage key={`notice-${i}`} code={notice.code} />
      ))}
      {visibleErrors.map((error, i) => (
        <ErrorMessage key={`error-${i}`} error={error} />
      ))}
    </Container>
  );
}

const iconStyles = {
  width: xrStyles.textMd,
  height: xrStyles.textMd,
  color: hexColors.foreground,
};

function MessageStatus({ message }: { message: MyUIMessage }) {
  const statusLabel = getStatusLabel(message.parts);

  return (
    <Container alignItems="center" gap={xrStyles.spacingMd}>
      {statusLabel === "Checking the time" ? (
        <Clock {...iconStyles} />
      ) : statusLabel === "Reasoning" ? (
        <Brain {...iconStyles} />
      ) : statusLabel === "Searching for information" ? (
        <Globe {...iconStyles} />
      ) : statusLabel === "Checking the news" ? (
        <Newspaper {...iconStyles} />
      ) : statusLabel === "Checking the weather" ? (
        <Sun {...iconStyles} />
      ) : statusLabel === "Analyzing files" ? (
        <File {...iconStyles} />
      ) : (
        // ) : statusLabel === "Generating code" ? (
        //   <Code {...iconStyles} />
        <Brain {...iconStyles} />
      )}
      <Text color={hexColors.foreground}>{statusLabel}</Text>
    </Container>
  );
}

function NoticeMessage({ code }: { code: NoticeCode }) {
  return <TextElement>{getNoticeMessage(code)}</TextElement>;
}

function ErrorMessage({ error }: { error: SystemError }) {
  return (
    <TextElement color={hexColors.destructive}>
      {getErrorMessage(error.code)}
      {"\n"}
      code: {error.code}
    </TextElement>
  );
}
