/** Computes a projective transform from four source points to four target points. */
export function createHomography(source, target) {
  if (source.length !== 4 || target.length !== 4 || !isValidQuadrilateral(source)) {
    throw new Error("Se necesitan cuatro puntos de calibracion validos.");
  }
  const matrix = [];
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  const solution = solveLinearSystem(matrix, values);
  return [...solution, 1];
}

export function projectPoint(homography, point) {
  const [a, b, c, d, e, f, g, h] = homography;
  const denominator = g * point.x + h * point.y + 1;
  if (Math.abs(denominator) < 1e-8) return null;
  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator
  };
}

export function isValidQuadrilateral(points) {
  if (points.length !== 4 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  let direction = 0;
  for (let index = 0; index < 4; index += 1) {
    const first = points[index];
    const second = points[(index + 1) % 4];
    const third = points[(index + 2) % 4];
    const cross = (second.x - first.x) * (third.y - second.y) - (second.y - first.y) * (third.x - second.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (direction && Math.sign(cross) !== direction) return false;
    direction = Math.sign(cross);
  }
  return Math.abs(polygonArea(points)) > 0.001;
}

function polygonArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function solveLinearSystem(matrix, values) {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < augmented.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < augmented.length; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) throw new Error("Los puntos no permiten calcular una homografia.");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let item = column; item <= augmented.length; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < augmented.length; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= augmented.length; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row) => row[augmented.length]);
}
