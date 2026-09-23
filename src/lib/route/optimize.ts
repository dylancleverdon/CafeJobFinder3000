/**
 * Orders stops to keep total travel short.
 *  - up to EXACT_LIMIT stops: exact answer (Held–Karp dynamic programming)
 *  - more: nearest-neighbour start, then 2-opt improvement
 * `cost(i, j)` is the cost between node i and j, where node 0 is the start
 * point and nodes 1..n are the stops. Returns stop indices (1..n) in order.
 */
export const EXACT_LIMIT = 11;

export type CostFn = (i: number, j: number) => number;

export function orderStops(n: number, cost: CostFn, opts: { returnToStart?: boolean } = {}): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  return n <= EXACT_LIMIT ? heldKarp(n, cost, !!opts.returnToStart) : twoOpt(nearestNeighbour(n, cost), cost, !!opts.returnToStart);
}

export function pathCost(order: number[], cost: CostFn, returnToStart = false): number {
  let total = 0;
  let prev = 0;
  for (const s of order) {
    total += cost(prev, s);
    prev = s;
  }
  if (returnToStart && order.length) total += cost(prev, 0);
  return total;
}

function heldKarp(n: number, cost: CostFn, returnToStart: boolean): number[] {
  const full = (1 << n) - 1;
  // dp[mask][j]: cheapest path from start visiting `mask`, ending at stop j (0-based)
  const dp = Array.from({ length: 1 << n }, () => new Float64Array(n).fill(Infinity));
  const parent = Array.from({ length: 1 << n }, () => new Int8Array(n).fill(-1));
  for (let j = 0; j < n; j++) dp[1 << j][j] = cost(0, j + 1);
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < n; j++) {
      const cur = dp[mask][j];
      if (!(mask & (1 << j)) || cur === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const c = cur + cost(j + 1, k + 1);
        if (c < dp[next][k]) {
          dp[next][k] = c;
          parent[next][k] = j;
        }
      }
    }
  }
  let best = Infinity;
  let end = 0;
  for (let j = 0; j < n; j++) {
    const c = dp[full][j] + (returnToStart ? cost(j + 1, 0) : 0);
    if (c < best) {
      best = c;
      end = j;
    }
  }
  const order: number[] = [];
  let mask = full;
  let j = end;
  while (j !== -1) {
    order.push(j + 1);
    const p = parent[mask][j];
    mask &= ~(1 << j);
    j = p;
  }
  return order.reverse();
}

export function nearestNeighbour(n: number, cost: CostFn): number[] {
  const left = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const order: number[] = [];
  let cur = 0;
  while (left.size) {
    let best = -1;
    let bestCost = Infinity;
    for (const s of left) {
      const c = cost(cur, s);
      if (c < bestCost) {
        bestCost = c;
        best = s;
      }
    }
    order.push(best);
    left.delete(best);
    cur = best;
  }
  return order;
}

export function twoOpt(order: number[], cost: CostFn, returnToStart: boolean): number[] {
  let best = order.slice();
  let bestCost = pathCost(best, cost, returnToStart);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const c = pathCost(candidate, cost, returnToStart);
        if (c < bestCost - 1e-9) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}
