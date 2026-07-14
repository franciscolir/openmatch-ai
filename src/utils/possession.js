export function resolvePossessionFrame(ballTrack, playerTracks, fieldLength) {
  if (!ballTrack?.fieldPosition || !playerTracks?.length) return null;
  const mid = fieldLength / 2;
  const distances = { a: Infinity, b: Infinity };
  for (const player of playerTracks) {
    if (!player.fieldPosition) continue;
    const team = player.fieldPosition.x < mid ? "a" : "b";
    const distance = Math.hypot(
      player.fieldPosition.x - ballTrack.fieldPosition.x,
      player.fieldPosition.y - ballTrack.fieldPosition.y
    );
    if (distance < distances[team]) distances[team] = distance;
  }
  if (!isFinite(distances.a) && !isFinite(distances.b)) return null;
  return distances.a <= distances.b ? "a" : "b";
}
