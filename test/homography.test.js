import test from "node:test";
import assert from "node:assert/strict";
import { createHomography, isValidQuadrilateral, projectPoint } from "../src/utils/homography.js";

test("maps a rectangular calibration from normalized pixels to meters", () => {
  const homography = createHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 105, y: 0 }, { x: 105, y: 68 }, { x: 0, y: 68 }]
  );
  const point = projectPoint(homography, { x: 0.5, y: 0.5 });
  assert.ok(Math.abs(point.x - 52.5) < 1e-8);
  assert.ok(Math.abs(point.y - 34) < 1e-8);
});

test("rejects a degenerate calibration", () => {
  assert.equal(isValidQuadrilateral([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), false);
});
