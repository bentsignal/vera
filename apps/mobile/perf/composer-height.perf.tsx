import { useLayoutEffect } from "react";
import { act, render } from "@testing-library/react-native";

import { useComposerHeight } from "~/features/conversation/composer-height";
import {
  initialInset,
  insetFor,
} from "~/features/native-list/send-inset-state";

jest.mock("~/features/dev/send-timing", () => ({ markSendState: jest.fn() }));

type Height = ReturnType<typeof useComposerHeight>;

/** Exercise the actual hook through the app's React Compiler. */
function ComposerHeight({
  roomCloses,
  onReport,
}: {
  roomCloses: boolean;
  onReport: (height: Height) => void;
}) {
  const height = useComposerHeight({ roomCloses });
  useLayoutEffect(() => {
    onReport(height);
  });
  return null;
}

async function composer(roomCloses = false) {
  const reports = new Array<Height>();
  await render(
    <ComposerHeight
      roomCloses={roomCloses}
      onReport={(height) => reports.push(height)}
    />,
  );
  const height = reports[0];
  if (height === undefined) throw new Error("Composer did not mount");
  // No native layout in Jest. Supply only the host API the real callback reads.
  Object.assign(height.report.bar, {
    current: { getBoundingClientRect: () => ({ height: 98 }) },
  });
  return height;
}

test("a layout callback publishes the current committed height without a UI round trip", async () => {
  const { report } = await composer();
  await act(() => {
    report.onHeight(76);
    // The event scalar can be stale. Native insets use the current host rect.
    expect(report.sendCommit.read().layout?.height).toBe(98);
  });
});

test("ordinary layout never acknowledges or releases a pending send", async () => {
  const { report } = await composer();
  await act(() => {
    const sequence = report.sendCommit.begin(1, []);
    report.sendCommit.expect(sequence, "own-row");
    report.onHeight(98);
    expect(report.sendCommit.read().height).toBeUndefined();
    expect(report.sendCommit.read().published).not.toBe(true);
    expect(report.sendCommit.read().layout?.height).toBe(98);
  });
});

test("the RN list retains its existing UI-thread room ownership", async () => {
  const { report } = await composer(true);
  await act(() => {
    report.onHeight(76);
    expect(report.sendCommit.read().layout).toBeUndefined();
  });
});

test.each(["missing row", "navigation", "frozen"])(
  "direct observation preserves an ACKed send's %s gate",
  async (blocked) => {
    const { report } = await composer();
    const commit = report.sendCommit;
    const initial = initialInset(commit.read(), ["old"], 230);
    await act(() => {
      const sequence = commit.begin(1, []);
      commit.expect(sequence, "own-row");
      commit.requestLatest();
      commit.acknowledge(sequence, 76);
      if (blocked !== "navigation") commit.armLatest(sequence);
      report.onHeight(98);
      const ids = blocked === "missing row" ? ["old"] : ["old", "own-row"];
      const next = insetFor(initial, commit.read(), ids, blocked === "frozen");
      expect(next.pending?.sends).toBe(sequence);
      expect(next.height).toBe(230);
      expect(commit.read().height).toBe(76);
    });
  },
);
