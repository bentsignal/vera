/**
 * Times one send by phase (waiting for an upload slot, shrinking,
 * uploading, the server confirming), for Metro's log in development
 * builds. Each line says how long since the send started.
 */
export function sendTimer(messageId: string) {
  const started = Date.now();
  return (line: string) => {
    if (!__DEV__) return;
    const since = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[send-timing] ${messageId.slice(0, 8)} +${since}s ${line}`);
  };
}
