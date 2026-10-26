interface AnchorView {
  scrollToRow(id: string, animated: boolean): Promise<void>;
}

/** One initial command before revealing; later rows never recenter the reader. */
export function createAnchorPlacement<View extends AnchorView>() {
  let current: View | undefined;
  let generation = 0;
  let started = false;

  return {
    attach(this: void, view: View | null) {
      if ((view ?? undefined) !== current) {
        current = view ?? undefined;
        generation += 1;
        started = false;
      }
    },
    ready(options: {
      anchor: string | undefined;
      present: boolean;
      show: () => void;
      failed: () => void;
    }) {
      if (started || current === undefined) return;
      started = true;
      const view = current;
      const ticket = generation;
      function valid() {
        return current === view && generation === ticket;
      }
      if (options.anchor === undefined || !options.present) {
        options.show();
        return;
      }
      void view.scrollToRow(options.anchor, false).then(
        () => {
          if (valid()) options.show();
        },
        () => {
          if (!valid()) return;
          options.failed();
          options.show();
        },
      );
    },
  };
}
