import { ROOT_FRAME, type FrameWorld } from "./types";

/**
 * Resolve a light's frame to its live world transform, or null when the frame
 * isn't measured yet / has unmounted (the light is skipped for that frame).
 */
export function resolveFrame(
  frames: Record<string, FrameWorld>,
  frameId: string,
  scroll: number,
): FrameWorld | null {
  "worklet";
  if (frameId === ROOT_FRAME) {
    return { ox: 0, oy: -scroll, s: 1, a: 1, ready: true };
  }
  const f = frames[frameId];
  return f && f.ready ? f : null;
}
