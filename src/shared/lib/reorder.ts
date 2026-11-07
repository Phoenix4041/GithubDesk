export interface RowBounds {
  top: number;
  bottom: number;
}

export function indexAtPosition(rows: readonly RowBounds[], y: number): number {
  if (rows.length === 0) {
    return 0;
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first && y <= first.top) {
    return 0;
  }
  if (last && y >= last.bottom) {
    return rows.length - 1;
  }
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (y >= row.top && y < row.bottom) {
      return index;
    }
    const distance = Math.abs((row.top + row.bottom) / 2 - y);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}
