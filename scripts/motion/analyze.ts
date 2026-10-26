// Finds jank in a simulator recording of the message list.
//
//   node --experimental-strip-types scripts/motion/analyze.ts <video.mp4> [--allow-snaps] [--json]
//
// Works on the message area (below the header, above the composer), cut
// into short horizontal bands in three columns, so a bubble, a chip, or a
// tapback moves as its own band. Between each recorded frame and the next
// it finds how far each band moved, and flags:
//
// - snap: a band at rest that moves a long way in one frame: a plain
//   layout jump, or a move that lands a frame before (or after) the space
//   it makes up for. `--allow-snaps` for what's meant to (a firehose, a
//   fling).
// - jump-back: a band that moves and moves back within two frames.
// - flicker: a frame unlike both of its neighbours while they're alike (a
//   row gone for a frame, a flash, an opacity that lands late).
// - blank: a tall empty band between rows (rows drawn too late).
//
// Simulator recordings keep only frames that changed, so "a frame" here is
// the next recorded one, and a change after a pause counts from rest.
// Exits 1 when anything major is flagged (see `major`).

import { spawnSync } from "node:child_process";

/** The frame, downscaled to points (a 3x simulator screen). */
const W = 402;
const H = 874;
/** The message area, as fractions of the height. */
const TOP = 0.16;
const BOTTOM = 0.89;
/** A band's height in points, and the columns bands are cut into. */
const BAND = 24;
const COLUMNS = 3;
/**
 * Each column's rows are matched by this many strips across it, so rows
 * of the same kind (a line of text and a chip) tell apart by where their
 * text ends.
 */
const STRIPS = 4;
/** The furthest a band is looked for between frames, in points. */
const MAX_MOVE = 40;
/** Moves up to this are looked for first (see `move`). */
const SMALL = 24;
/** A move from rest this far in one frame is a snap, not the start of an ease. */
const SNAP = 6;
/** Mean differences (0-255) that count as a different frame, and the same. */
const DIFFERENT = 5;
const SAME = 1.5;
/** An empty run this tall between content is a blank band, in points. */
const BLANK = 90;

interface Frame {
  readonly t: number;
  /**
   * Each column's row profiles: the mean brightness of each row in each of
   * its strips, `STRIPS` values a row.
   */
  readonly columns: readonly Float32Array[];
  /** The same across the whole width, `COLUMNS * STRIPS` values a row. */
  readonly wide: Float32Array;
  /** Whether each row has anything drawn in it, across the width. */
  readonly ink: readonly boolean[];
}

export interface Flag {
  readonly t: number;
  readonly kind: "blank" | "flicker" | "jump-back" | "snap";
  readonly where: string;
  readonly by: number;
}

/**
 * Below these, a jump-back or a flicker is minor: reported, not failed.
 * One frame a few points off mid-move is what any commit of React's while
 * the rows move can draw (a server's answer landing then), which the app
 * can't hold off; one past these is something the list did.
 */
const MAJOR_JUMP_BACK = 8;
/**
 * A band of text a fraction of a point off for a frame (as rows settle)
 * scores up to the low 30s; a row gone or half faded for a frame, 38 and
 * up.
 */
const MAJOR_FLICKER = 35;

/** Whether `flag` fails the check, or is only reported. */
export function major(flag: Flag) {
  if (flag.kind === "jump-back") return Math.abs(flag.by) >= MAJOR_JUMP_BACK;
  if (flag.kind === "flicker") return flag.by >= MAJOR_FLICKER;
  return true;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { maxBuffer: 2 ** 31 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

function readFrames(video: string) {
  const times = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
    "-of", "csv=p=0", video,
  ])
    .toString()
    .split(/\s+/)
    .map((line) => Number.parseFloat(line.replace(",", "")))
    .filter((t) => !Number.isNaN(t));
  const raw = run("ffmpeg", [
    "-v", "error", "-i", video, "-vf", `scale=${W}:${H},format=gray`,
    "-fps_mode", "passthrough", "-f", "rawvideo", "-",
  ]);
  const top = Math.round(H * TOP);
  const bottom = Math.round(H * BOTTOM);
  const rows = bottom - top;
  const size = W * H;
  const frames: Frame[] = [];
  const columnWidth = Math.floor(W / COLUMNS);
  const stripWidth = Math.floor(columnWidth / STRIPS);
  for (let index = 0; index * size + size <= raw.length; index += 1) {
    const base = index * size;
    const columns = Array.from(
      { length: COLUMNS },
      () => new Float32Array(rows * STRIPS),
    );
    const ink: boolean[] = [];
    for (let y = 0; y < rows; y += 1) {
      const line = base + (top + y) * W;
      let low = 255;
      let high = 0;
      for (let c = 0; c < COLUMNS; c += 1) {
        const column = columns[c];
        for (let strip = 0; strip < STRIPS; strip += 1) {
          let sum = 0;
          const from = c * columnWidth + strip * stripWidth;
          for (let x = from; x < from + stripWidth; x += 1) {
            const value = raw[line + x] ?? 0;
            sum += value;
            if (x > 4 && x < W - 4) {
              low = Math.min(low, value);
              high = Math.max(high, value);
            }
          }
          if (column !== undefined) column[y * STRIPS + strip] = sum / stripWidth;
        }
      }
      ink.push(high - low > 8);
    }
    const wide = new Float32Array(rows * COLUMNS * STRIPS);
    for (let y = 0; y < rows; y += 1) {
      for (let c = 0; c < COLUMNS; c += 1) {
        for (let strip = 0; strip < STRIPS; strip += 1) {
          wide[(y * COLUMNS + c) * STRIPS + strip] =
            columns[c]?.[y * STRIPS + strip] ?? 0;
        }
      }
    }
    frames.push({ columns, ink, t: times[index] ?? times.at(-1) ?? 0, wide });
  }
  return frames;
}

function meanDifference(a: Float32Array, b: Float32Array, start: number, end: number) {
  let sum = 0;
  for (let i = start * STRIPS; i < end * STRIPS; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum / Math.max(1, (end - start) * STRIPS);
}

/** Values a row in a profile: one column's strips, or the whole width's. */
type Per = number;

function errorAt(
  a: Float32Array,
  b: Float32Array,
  { start, end, per }: { start: number; end: number; per: Per },
  d: number,
) {
  const rows = a.length / per;
  let sum = 0;
  let count = 0;
  for (let y = start; y < end; y += 1) {
    const y2 = y + d;
    if (y2 < 0 || y2 >= rows) continue;
    for (let i = 0; i < per; i += 1) {
      sum += Math.abs((a[y * per + i] ?? 0) - (b[y2 * per + i] ?? 0));
    }
    count += per;
  }
  return count < ((end - start) * per) / 2 ? Number.POSITIVE_INFINITY : sum / count;
}

/** Whether rows start..end of a profile have anything in them. */
function hasContent(profile: Float32Array, start: number, end: number) {
  let low = 255;
  let high = 0;
  for (let i = start * STRIPS; i < end * STRIPS; i += 1) {
    const value = profile[i] ?? 0;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return high - low > 3;
}

/**
 * How far rows start..end of `a` moved to in `b`, in points (positive:
 * down), or undefined when they changed rather than moved. Small moves win
 * ties: rows of the same kind repeat down the list, and a big move matches
 * a neighbour's rows nearly as well as a small one matches its own.
 */
function move(
  a: Float32Array,
  b: Float32Array,
  band: { start: number; end: number; per: Per },
) {
  const still = errorAt(a, b, band, 0);
  if (still < 0.6) return 0;
  const errors = new Map<number, number>();
  for (let d = -MAX_MOVE; d <= MAX_MOVE; d += 1) {
    errors.set(d, errorAt(a, b, band, d));
  }
  const best = (within: number) => {
    let found = 0;
    let error = still;
    for (const [d, e] of errors) {
      if (Math.abs(d) <= within && e < error - 0.05) {
        found = d;
        error = e;
      }
    }
    return { d: found, error };
  };
  // Ambiguous when another move, well apart, fits nearly as well: rows of
  // the same kind repeating down the list.
  const ambiguous = (d: number, error: number) => {
    for (const [other, e] of errors) {
      if (Math.abs(other - d) >= 5 && e < error * 1.25 + 0.3) return true;
    }
    return false;
  };
  const small = best(SMALL);
  if (small.error < 1.2) return ambiguous(small.d, small.error) ? undefined : small.d;
  const big = best(MAX_MOVE);
  if (big.error < 1.0 && big.error < 0.4 * small.error && !ambiguous(big.d, big.error)) {
    return big.d;
  }
  return undefined;
}

function blankRuns(frame: Frame) {
  const runs: number[] = [];
  let run = 0;
  let seen = false;
  for (const ink of frame.ink) {
    if (!ink) {
      run += 1;
      continue;
    }
    if (seen && run >= BLANK) runs.push(run);
    run = 0;
    seen = true;
  }
  return runs;
}

export function analyze(video: string, { allowSnaps = false } = {}) {
  const frames = readFrames(video);
  const flags: Flag[] = [];
  const first = frames[0];
  if (first === undefined) return { flags, frames: 0 };
  const rows = (first.columns[0]?.length ?? 0) / STRIPS;
  const bands: { column: number; start: number; end: number }[] = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    for (let start = 0; start + BAND <= rows; start += BAND) {
      bands.push({ column, end: start + BAND, start });
    }
  }
  // Each band's move between each frame and the next.
  const moves = frames.slice(1).map((frame, index) => {
    const before = frames[index];
    return bands.map(({ column, start, end }) => {
      const a = before?.columns[column];
      const b = frame.columns[column];
      if (a === undefined || b === undefined || !hasContent(a, start, end)) return 0;
      return move(a, b, { end, per: STRIPS, start });
    });
  });
  // The same rows across the whole width, where a row's text tells it
  // from its neighbours: a column's big move that the width doesn't agree
  // with is a neighbour's rows matching, not a move.
  const wideMoves = frames.slice(1).map((frame, index) => {
    const before = frames[index];
    return bands.map(({ start, end }) =>
      before === undefined
        ? 0
        : move(before.wide, frame.wide, { end, per: COLUMNS * STRIPS, start }),
    );
  });
  const where = (band: number) => {
    const { column, start } = bands[band] ?? { column: 0, start: 0 };
    return `${["left", "middle", "right"][column] ?? column} ${Math.round(H * TOP + start)}pt`;
  };
  // Whether nothing on screen moved between two frames: a snap only counts
  // from rest, as a layout jump starts, so a band matching its neighbour's
  // rows mid-move isn't one.
  // (A band that changed in place, as something fades or pops, isn't
  // moving.)
  const atRest = (step: readonly (number | undefined)[] | undefined) =>
    step === undefined ||
    step.every((d) => d === undefined || Math.abs(d) <= 1);
  moves.forEach((step, index) => {
    const t = frames[index + 1]?.t ?? 0;
    const previous = moves[index - 1];
    const next = moves[index + 1];
    const fromRest = atRest(previous);
    step.forEach((d, band) => {
      if (d === undefined) return;
      const before = previous?.[band] ?? 0;
      const across = wideMoves[index]?.[band];
      const agreed = across !== undefined && Math.abs(across - d) <= 3;
      if (!allowSnaps && Math.abs(d) >= SNAP && before === 0 && fromRest && agreed) {
        flags.push({ by: d, kind: "snap", t, where: where(band) });
      }
      const after = next?.[band];
      if (after !== undefined && Math.abs(d) >= 3 && Math.abs(after) >= 3 && Math.abs(d + after) <= 1) {
        flags.push({ by: d, kind: "jump-back", t, where: where(band) });
      }
      // Mid-move, a frame the wrong way: a commit of React's drawing the
      // rows where they were a few frames before.
      // The last way it moved, a frame or two before (one can hold still).
      const lastMove = [previous?.[band], moves[index - 2]?.[band]].find(
        (m) => m !== undefined && m !== 0,
      );
      const prior = lastMove;
      if (
        prior !== undefined &&
        after !== undefined &&
        Math.abs(prior) >= 1 &&
        Math.abs(after) >= 1 &&
        Math.sign(prior) === Math.sign(after) &&
        Math.sign(d) === -Math.sign(prior) &&
        Math.abs(d) >= 2
      ) {
        flags.push({ by: d, kind: "jump-back", t, where: where(band) });
      }
    });
  });
  for (let index = 1; index + 1 < frames.length; index += 1) {
    const [before, now, after] = [frames[index - 1], frames[index], frames[index + 1]];
    if (before === undefined || now === undefined || after === undefined) continue;
    bands.forEach(({ column, start, end }, band) => {
      const a = before.columns[column];
      const b = now.columns[column];
      const c = after.columns[column];
      if (a === undefined || b === undefined || c === undefined) return;
      const away = meanDifference(a, b, start, end);
      // Not a band that moved a little and back (a jump-back): one whose
      // middle frame no move explains.
      const moved = moves[index - 1]?.[band];
      if (
        moved === undefined &&
        away > DIFFERENT &&
        meanDifference(b, c, start, end) > DIFFERENT &&
        meanDifference(a, c, start, end) < SAME
      ) {
        flags.push({ by: Math.round(away), kind: "flicker", t: now.t, where: where(band) });
      }
    });
  }
  for (const frame of frames) {
    for (const run of blankRuns(frame)) {
      flags.push({ by: run, kind: "blank", t: frame.t, where: "list" });
    }
  }
  // One flag per kind and moment, the biggest.
  const kept = new Map<string, Flag>();
  for (const flag of flags) {
    const key = `${flag.t.toFixed(3)} ${flag.kind}`;
    const held = kept.get(key);
    if (held === undefined || Math.abs(flag.by) > Math.abs(held.by)) kept.set(key, flag);
  }
  return {
    flags: [...kept.values()].sort((a, b) => a.t - b.t),
    frames: frames.length,
  };
}

const isMain = process.argv[1]?.endsWith("analyze.ts") === true;
if (isMain) {
  const video = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (video === undefined) {
    console.error("usage: analyze.ts <video.mp4> [--allow-snaps] [--json]");
    process.exit(2);
  }
  const result = analyze(video, { allowSnaps: process.argv.includes("--allow-snaps") });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result));
  } else {
    const failing = result.flags.filter(major).length;
    console.log(`${video}: ${result.frames} frames, ${failing} failing, ${result.flags.length - failing} minor`);
    for (const flag of result.flags) {
      const level = major(flag) ? "FAIL " : "minor";
      console.log(`  ${level} ${flag.t.toFixed(3)}s ${flag.kind.padEnd(9)} ${flag.where.padEnd(12)} ${flag.by}`);
    }
  }
  process.exit(result.flags.some(major) ? 1 : 0);
}
