// A fingertip can't aim as precisely as a mouse, and a map pin is smaller than
// the 44pt tap target Apple recommends. On touch screens a tap counts if it
// lands within this distance of the visible edge of a pin or cluster.
export const TOUCH_TAP_REACH_PX = 11;

export type TapCandidate<T> = {
  target: T;
  x: number;
  y: number;
  // Visible radius in pixels, including any stroke.
  radius: number;
};

// Returns the candidate whose visible edge is closest to the tap, or null if
// none is within reach. A tap inside a circle has a negative edge distance, so
// overlapping circles resolve to the one the tap is deepest inside.
export function findClosestTapTarget<T>(
  tapX: number,
  tapY: number,
  candidates: TapCandidate<T>[],
  reach: number = TOUCH_TAP_REACH_PX
): T | null {
  let closest: T | null = null;
  let closestDistance = Infinity;
  for (const { target, x, y, radius } of candidates) {
    const edgeDistance = Math.hypot(x - tapX, y - tapY) - radius;
    if (edgeDistance <= reach && edgeDistance < closestDistance) {
      closest = target;
      closestDistance = edgeDistance;
    }
  }
  return closest;
}
