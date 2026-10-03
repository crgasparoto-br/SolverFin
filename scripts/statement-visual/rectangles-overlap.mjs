/** Detect a real intersection, not shared horizontal space in different rows. */
export function rectanglesOverlap(first, second, tolerance = 0.5) {
  for (const rect of [first, second]) {
    if (![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)) {
      throw new TypeError("Expected finite rectangle coordinates.");
    }
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new TypeError("Expected a nonnegative finite tolerance.");
  }
  return (
    Math.min(first.right, second.right) - Math.max(first.left, second.left) > tolerance &&
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > tolerance
  );
}
