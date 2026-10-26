import type { Lift } from "./contract";
import {
  BAR_HEIGHT,
  BAR_WIDTH,
  MENU_WIDTH,
  menuHeight,
} from "~/features/conversation/glass-menu-parts";
import { menuLayout } from "~/features/conversation/menu-layout";

const ACTION_COUNT = 4;

export interface DevHold {
  readonly rowId: string;
  /**
   * Plain text (a stacked row): native lifts it on a card reaching 10 past
   * it at the sides and 8 above and below, so the menu lays out around that.
   */
  readonly card?: boolean;
  readonly part?: string;
  readonly index?: number;
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Where the menu puts the held part, as the native list's `lift`. */
export function devLift(
  hold: DevHold,
  screen: { width: number; height: number },
  insets: { top: number; bottom: number },
) {
  const align =
    hold.frame.x + hold.frame.width / 2 > screen.width / 2 ? "end" : "start";
  const { frame } = hold;
  const layout = menuLayout({
    align,
    bar: { height: BAR_HEIGHT, width: BAR_WIDTH },
    frame: hold.card
      ? {
          height: frame.height + 16,
          width: frame.width + 20,
          x: frame.x - 10,
          y: frame.y - 8,
        }
      : frame,
    insets,
    menu: { height: menuHeight(ACTION_COUNT), width: MENU_WIDTH },
    screen,
  });
  const lift = {
    index: hold.index,
    origin: layout.fromMiddle ? "middle" : align,
    part: hold.part,
    rowId: hold.rowId,
    scale: layout.scale,
    shift: layout.shift,
  } satisfies Lift;
  return { layout, lift };
}
