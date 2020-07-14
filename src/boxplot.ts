export interface IBoxPlot {
  readonly min: number;
  readonly max: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly outlier: readonly number[];
  readonly whiskerLow: number;
  readonly whiskerHigh: number;

  readonly mean: number;

  readonly missing: number;
  readonly count: number;
}

/**
 * computes the boxplot stats using the given interpolation function if needed
 * @param {number[]} arr sorted array of number
 * @param {(i: number, j: number, fraction: number)} interpolate interpolation function
 */
function quantilesInterpolate(
  arr: ArrayLike<number>,
  length: number,
  interpolate: (i: number, j: number, fraction: number) => number
) {
  const n1 = length - 1;
  const compute = (q: number) => {
    const index = q * n1;
    const lo = Math.floor(index);
    const h = index - lo;
    const a = arr[lo];

    return h === 0 ? a : interpolate(a, arr[Math.min(lo + 1, n1)], h);
  };

  return {
    q1: compute(0.25),
    median: compute(0.5),
    q3: compute(0.75),
  };
}

/**
 * Uses R's quantile algorithm type=7.
 * https://en.wikipedia.org/wiki/Quantile#Quantiles_of_a_population
 */
export function quantilesType7(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (a, b, alpha) => a + alpha * (b - a));
}

/**
 * ‘linear’: i + (j - i) * fraction, where fraction is the fractional part of the index surrounded by i and j.
 * (same as type 7)
 */
export function quantilesLinear(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (i, j, fraction) => i + (j - i) * fraction);
}

/**
 * ‘lower’: i.
 */
export function quantilesLower(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (i) => i);
}

/**
 * 'higher': j.
 */
export function quantilesHigher(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (_, j) => j);
}

/**
 * ‘nearest’: i or j, whichever is nearest
 */
export function quantilesNearest(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (i, j, fraction) => (fraction < 0.5 ? i : j));
}

/**
 * ‘midpoint’: (i + j) / 2
 */
export function quantilesMidpoint(arr: ArrayLike<number>, length = arr.length) {
  return quantilesInterpolate(arr, length, (i, j) => (i + j) * 0.5);
}

/**
 * The hinges equal the quartiles for odd n (where n <- length(x))
 * and differ for even n. Whereas the quartiles only equal observations
 * for n %% 4 == 1 (n = 1 mod 4), the hinges do so additionally
 * for n %% 4 == 2 (n = 2 mod 4), and are in the middle of
 * two observations otherwise.
 */
export function quantilesFivenum(arr: ArrayLike<number>, length = arr.length) {
  // based on R fivenum
  const n = length;

  // assuming R 1 index system, so arr[1] is the first element
  const n4 = Math.floor((n + 3) / 2) / 2;
  const compute = (d: number) => 0.5 * (arr[Math.floor(d) - 1] + arr[Math.ceil(d) - 1]);

  return {
    q1: compute(n4),
    median: compute((n + 1) / 2),
    q3: compute(n + 1 - n4),
  };
}

/**
 * alias for quantilesFivenum
 * @param arr
 * @param length
 */
export function quantilesHinges(arr: ArrayLike<number>, length = arr.length) {
  return quantilesFivenum(arr, length);
}

export declare type QuantileMethod = (
  arr: ArrayLike<number>,
  length: number
) => { q1: number; median: number; q3: number };

export declare type BoxplotStatsOptions = {
  /**
   * specify the coefficient for the whiskers, use <=0 for getting min/max instead
   * @default 1.5
   */
  coef?: number;

  /**
   * specify the quantile method to use
   * @default quantilesType7
   */
  quantiles?: QuantileMethod;

  /**
   * defines that it can be assumed that the array is sorted and just contains valid numbers
   */
  validAndSorted?: boolean;
};

function determineStatsOptions(options: Partial<BoxplotStatsOptions> = {}) {
  return {
    coef: options.coef == null ? 1.5 : options.coef,
    quantiles: options.quantiles == null ? quantilesType7 : options.quantiles,
  };
}

function createSortedData(data: readonly number[] | Float32Array | Float64Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let valid = 0;
  let length = data.length;

  const vs = data instanceof Float64Array ? new Float64Array(length) : new Float32Array(length);

  for (let i = 0; i < length; ++i) {
    const v = data[i];
    if (v == null || Number.isNaN(v)) {
      continue;
    }
    vs[valid] = v;
    valid++;

    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
    sum += v;
  }

  const missing = length - valid;

  if (valid === 0) {
    return {
      sum,
      min,
      max,
      missing,
      s: [],
    };
  }

  // add comparator since the polyfill doesn't to a real sorting
  const s = (valid === length ? vs : vs.subarray(0, valid)).sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));

  return {
    sum,
    min,
    max,
    missing,
    s,
  };
}

function withSortedData(data: readonly number[] | Float32Array | Float64Array) {
  if (data.length === 0) {
    return {
      sum: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      missing: 0,
      s: [],
    };
  }
  const min = data[0];
  const max = data[data.length - 1];
  const red = (acc: number, v: number) => acc + v;
  const sum =
    data instanceof Float32Array
      ? data.reduce(red, 0)
      : data instanceof Float64Array
      ? data.reduce(red, 0)
      : data.reduce(red, 0);

  return {
    sum,
    min,
    max,
    missing: 0,
    s: data,
  };
}

export default function boxplot(
  data: readonly number[] | Float32Array | Float64Array,
  options: BoxplotStatsOptions = {}
): IBoxPlot {
  const { quantiles, coef } = determineStatsOptions(options);

  const { missing, s, min, max, sum } = options.validAndSorted ? withSortedData(data) : createSortedData(data);

  const invalid = {
    min: Number.NaN,
    max: Number.NaN,
    mean: Number.NaN,
    missing,
    count: data.length,
    whiskerHigh: Number.NaN,
    whiskerLow: Number.NaN,
    outlier: [],
    median: Number.NaN,
    q1: Number.NaN,
    q3: Number.NaN,
  };

  const valid = data.length - missing;

  if (valid === 0) {
    return invalid;
  }

  const { median, q1, q3 } = quantiles(s, valid);
  const iqr = q3 - q1;
  const coefValid = typeof coef === 'number' && coef > 0;
  const left = coefValid ? Math.max(min, q1 - coef * iqr) : min;
  const right = coefValid ? Math.min(max, q3 + coef * iqr) : max;

  const outlier: number[] = [];
  // look for the closest value which is bigger than the computed left
  let whiskerLow = left;
  for (let i = 0; i < valid; ++i) {
    const v = s[i];
    if (left < v) {
      whiskerLow = v;
      break;
    }
    // outlier
    if (outlier.length === 0 || outlier[outlier.length - 1] !== v) {
      outlier.push(v);
    }
  }
  // look for the closest value which is smaller than the computed right
  let whiskerHigh = right;
  const reversedOutliers: number[] = [];
  for (let i = valid - 1; i >= 0; --i) {
    const v = s[i];
    if (v < right) {
      whiskerHigh = v;
      break;
    }
    // outlier
    if (
      (reversedOutliers.length === 0 || reversedOutliers[reversedOutliers.length - 1] !== v) &&
      (outlier.length === 0 || outlier[outlier.length - 1] !== v)
    ) {
      reversedOutliers.push(v);
    }
  }

  return {
    min,
    max,
    count: data.length,
    missing,
    mean: sum / valid,
    whiskerHigh,
    whiskerLow,
    outlier: outlier.concat(reversedOutliers.reverse()),
    median,
    q1,
    q3,
  };
}
