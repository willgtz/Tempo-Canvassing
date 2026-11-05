import { describe, expect, it } from "vitest";
import { findClosestTapTarget, isTapGesture, TOUCH_TAP_REACH_PX } from "./map-tap-target";

const pin = (target: string, x: number, y: number, radius = 13.5) => ({ target, x, y, radius });

describe("findClosestTapTarget", () => {
  it("finds a pin when the tap is inside it", () => {
    expect(findClosestTapTarget(100, 100, [pin("a", 105, 100)])).toBe("a");
  });

  it("finds a pin when the tap is just outside its visible edge", () => {
    expect(findClosestTapTarget(100 + 13.5 + TOUCH_TAP_REACH_PX, 100, [pin("a", 100, 100)])).toBe("a");
  });

  it("ignores a pin beyond the reach", () => {
    expect(findClosestTapTarget(100 + 13.5 + TOUCH_TAP_REACH_PX + 1, 100, [pin("a", 100, 100)])).toBeNull();
  });

  it("picks the closer of two pins within reach, in either order", () => {
    const left = pin("left", 80, 100);
    const right = pin("right", 110, 100);
    expect(findClosestTapTarget(100, 100, [left, right])).toBe("right");
    expect(findClosestTapTarget(100, 100, [right, left])).toBe("right");
  });

  it("picks the pin the tap is deepest inside when pins overlap", () => {
    expect(findClosestTapTarget(100, 100, [pin("near", 102, 100), pin("far", 108, 100)])).toBe("near");
  });

  it("measures to a large cluster's edge rather than its center", () => {
    const cluster = pin("cluster", 100, 100, 28.5);
    const smallPin = pin("pin", 135, 100);
    expect(findClosestTapTarget(130, 100, [cluster, smallPin])).toBe("pin");
    expect(findClosestTapTarget(115, 100, [cluster, smallPin])).toBe("cluster");
  });

  it("returns null with nothing nearby", () => {
    expect(findClosestTapTarget(100, 100, [])).toBeNull();
  });
});

describe("isTapGesture", () => {
  it("accepts a still, quick, one-finger touch", () => {
    expect(isTapGesture({ movedPx: 0, heldMs: 161, maxFingers: 1 })).toBe(true);
  });

  it("accepts a little finger movement", () => {
    expect(isTapGesture({ movedPx: 10, heldMs: 120, maxFingers: 1 })).toBe(true);
  });

  it("rejects a drag", () => {
    expect(isTapGesture({ movedPx: 11, heldMs: 120, maxFingers: 1 })).toBe(false);
  });

  it("rejects a long press", () => {
    expect(isTapGesture({ movedPx: 0, heldMs: 501, maxFingers: 1 })).toBe(false);
  });

  it("rejects a pinch", () => {
    expect(isTapGesture({ movedPx: 0, heldMs: 100, maxFingers: 2 })).toBe(false);
  });
});
