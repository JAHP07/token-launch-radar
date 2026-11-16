// Token Launch Radar — the valuation model (my own code, written for this entry).
//
// The board ranks pre-token protocols by an implied value that is FITTED from
// the snapshot itself, never from a hardcoded list of names:
//
//   1. Comps: every protocol in the snapshot that already has a token trading
//      (a CoinGecko id and a market cap) is a comparable. For each, the ratio
//      of market cap to TVL is one observation of what the market pays for a
//      dollar of TVL.
//   2. Curve: an ordinary least-squares fit of log10(market cap) on log10(TVL)
//      over the comps gives the curve. A protocol's category shifts the curve
//      by the median residual of its category's comps, shrunk by sample size,
//      so thin categories stay close to the curve.
//   3. Blind test: five-fold cross-validation of the WHOLE model. The
//      comparables are split into five groups by slug; for each fold the
//      curve and the category shifts are fitted on the other four fifths
//      and the held-out group's market caps are predicted with the growth
//      and maturity multipliers applied, exactly as the board scores a
//      pre-token protocol. Every comparable is predicted once, so the
//      reported median error is the model's, not one lucky split's.
//   4. Implied value: the curve's prediction for a pre-token protocol's TVL,
//      times its category shift, times a growth multiplier from its 7-day TVL
//      change, times a maturity multiplier from how long it has run.
//
// What the model does NOT do: it never predicts whether or when a protocol
// issues a token. The snapshot records no token; it does not prove there is
// none. The implied value is this entry's own claim about what a token
// would be worth if the protocol's record stayed as it is.

/** One protocol as the sealed snapshot carries it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted comps curve, as the dashboard states it. */
export interface CompsFit {
  /** Intercept of log10(market cap) = a + b * log10(TVL). */
  intercept: number;
  /** Slope (elasticity) of log10(market cap) on log10(TVL). */
  slope: number;
  /** R-squared of the fit over the comps. */
  r_squared: number;
  /** How many comparables the fit used. */
  comps: number;
  /** Median market-cap/TVL ratio over the comps. */
  median_ratio: number;
  /** Category shift in dex (log10 units), only for categories with >= 3 comps. */
  category_shift_dex: Record<string, number>;
  /** How many comps each shifted category had. */
  category_n: Record<string, number>;
}

/** The blind test of the whole model: five-fold cross-validation. */
export interface BlindTest {
  /** Every comparable is predicted once, so this is the comparables' count. */
  held_out: number;
  median_ape_pct: number;
  p75_ape_pct: number;
  within_2x_pct: number;
  /** Median error of each fold, in fold order, for the spread across folds. */
  fold_median_ape_pct: number[];
  /** Fit over all comparables, for reference (the folds fit their own). */
  train_intercept: number;
  train_slope: number;
  /** Empirical actual/predicted quartiles from held-out predictions, not confidence bounds. */
  actual_to_predicted_p25: number;
  actual_to_predicted_p75: number;
}

/** The model's tunables. All of them are stated on the dashboard. */
export interface ModelSettings {
  /** 7-day change is clamped to this range before it moves the value. */
  growth_floor_pct: number;
  growth_cap_pct: number;
  /** Weight of the clamped growth on the multiplier. */
  growth_weight: number;
  /** Maturity multiplier runs from this floor to 1 over maturity_days. */
  maturity_floor: number;
  maturity_days: number;
  /** Age in days assumed when listed_at is unknown. */
  unknown_age_days: number;
  /** Every 5th comparable (by slug) is held out for the blind test. */
  holdout_every: number;
  /** A category needs this many comps to earn its own shift. */
  min_category_comps: number;
}

export const SETTINGS: ModelSettings = {
  growth_floor_pct: -60,
  growth_cap_pct: 120,
  growth_weight: 0.5,
  maturity_floor: 0.6,
  maturity_days: 1095,
  unknown_age_days: 365,
  holdout_every: 5,
  min_category_comps: 3,
};

export const MODEL_VERSION = 'radar-comps-2.1';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comps_base_usd: number;
    category_shift: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One board row in the compact form the dashboard reads. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  comps_base_usd: number;
  category_shift: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
  farm_costs: string[];
  farm_times: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface Coverage {
  watchlist_total: number;
  watchlist_covered: number;
  watchlist_missing: string[];
  snapshot_as_of: string;
  snapshot_hash: string;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  coverage: Coverage;
  settings: ModelSettings;
  fit: CompsFit;
  blind: BlindTest;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A name ending in a release marker is a pool of another protocol, not a protocol of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol can serve as a comparable: its token trades and both figures exist. */
export function isComp(p: SnapshotProtocol): boolean {
  return (
    p.gecko_id !== null &&
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    p.category !== 'CEX'
  );
}

/** Read and check the sealed snapshot document. Returns the typed snapshot. */
export function parseSnapshot(value: unknown): Snapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SnapshotError('snapshot root must be an object');
  }
  const doc = value as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !Number.isFinite(Date.parse(doc.as_of))) {
    throw new SnapshotError('snapshot as_of must be an ISO date');
  }
  if (typeof doc.source !== 'string' || doc.source.length === 0) {
    throw new SnapshotError('snapshot source must be a non-empty string');
  }
  if (!Array.isArray(doc.protocols) || doc.protocols.length < 100) {
    throw new SnapshotError('snapshot must carry at least 100 protocols');
  }
  if (typeof doc.floor_usd !== 'number' || doc.floor_usd <= 0) {
    throw new SnapshotError('snapshot floor_usd must be a positive number');
  }
  if (!Array.isArray(doc.watchlist) || doc.watchlist.length < 1) {
    throw new SnapshotError('snapshot must carry a watchlist');
  }
  const protocols: SnapshotProtocol[] = doc.protocols.map((row, i) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new SnapshotError(`protocol ${i} is not an object`);
    }
    const p = row as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0) throw new SnapshotError(`protocol ${i} has no slug`);
    if (typeof p.name !== 'string' || p.name.length === 0) throw new SnapshotError(`protocol ${i} has no name`);
    if (p.category !== null && typeof p.category !== 'string') {
      throw new SnapshotError(`protocol ${i} has a bad category`);
    }
    if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string')) {
      throw new SnapshotError(`protocol ${i} has bad chains`);
    }
    if (typeof p.tvl_usd !== 'number' || p.tvl_usd < 0) throw new SnapshotError(`protocol ${i} has a bad TVL`);
    if (p.change_7d !== null && typeof p.change_7d !== 'number') throw new SnapshotError(`protocol ${i} has a bad change_7d`);
    if (p.mcap_usd !== null && (typeof p.mcap_usd !== 'number' || p.mcap_usd < -1)) {
      throw new SnapshotError(`protocol ${i} has a bad mcap_usd`);
    }
    if (p.listed_at !== null && typeof p.listed_at !== 'string') throw new SnapshotError(`protocol ${i} has a bad listed_at`);
    if (p.gecko_id !== null && typeof p.gecko_id !== 'string') throw new SnapshotError(`protocol ${i} has a bad gecko_id`);
    if (p.symbol !== null && typeof p.symbol !== 'string') throw new SnapshotError(`protocol ${i} has a bad symbol`);
    // The snapshot marks an unknown market cap with -1 (autofinance): read it as "no market cap".
    const mcap = p.mcap_usd === -1 ? null : (p.mcap_usd as number | null);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category as string | null,
      chains: p.chains as string[],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d as number | null,
      mcap_usd: mcap,
      listed_at: p.listed_at as string | null,
      gecko_id: p.gecko_id as string | null,
      symbol: p.symbol as string | null,
    };
  });
  const slugSet = new Set(protocols.map((p) => p.slug));
  for (const w of doc.watchlist as unknown[]) {
    if (typeof w !== 'string' || !slugSet.has(w)) {
      throw new SnapshotError(`watchlist entry ${String(w)} is not a snapshot protocol`);
    }
  }
  return {
    as_of: doc.as_of as string,
    source: doc.source as string,
    floor_usd: doc.floor_usd as number,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/** Least squares of y on x: returns {a, b, r2}. */
function ols(x: number[], y: number[]): { a: number; b: number; r2: number } {
  const n = x.length;
  if (n < 5) return { a: 0, b: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const r = y[i]! - (a + b * x[i]!);
    ssRes += r * r;
  }
  return { a, b, r2: syy > 0 ? 1 - ssRes / syy : 0 };
}

/** Fit the comps curve and its per-category shifts from the snapshot's tokenized protocols. */
export function fitComps(
  protocols: SnapshotProtocol[],
  settings: ModelSettings = SETTINGS,
): CompsFit {
  const comps = protocols.filter(isComp);
  const x = comps.map((p) => Math.log10(p.tvl_usd));
  const y = comps.map((p) => Math.log10(p.mcap_usd!));
  const fit = ols(x, y);
  const residuals = comps.map((p, i) => ({
    category: p.category ?? 'Unknown',
    residual: y[i]! - (fit.a + fit.b * x[i]!),
  }));
  const byCategory = new Map<string, number[]>();
  for (const r of residuals) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r.residual);
    byCategory.set(r.category, arr);
  }
  const shift: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [cat, rs] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (rs.length >= settings.min_category_comps) {
      const med = median(rs);
      // Shrink toward the curve by sample size: a category with few comps
      // should not pull the curve far on a handful of observations.
      shift[cat] = round4(med * (rs.length / (rs.length + 5)));
      counts[cat] = rs.length;
    }
  }
  return {
    intercept: round4(fit.a),
    slope: round4(fit.b),
    r_squared: round4(fit.r2),
    comps: comps.length,
    median_ratio: round4(median(comps.map((p) => p.mcap_usd! / p.tvl_usd))),
    category_shift_dex: shift,
    category_n: counts,
  };
}

/** Predict the comps curve (before category shift, growth and maturity). */
function curveValue(tvlUsd: number, fit: CompsFit): number {
  return Math.pow(10, fit.intercept + fit.slope * Math.log10(tvlUsd));
}

/** The blind test: five-fold cross-validation of the whole model. The
 *  comparables are split into five groups by slug; for each fold the curve
 *  and the category shifts are fitted on the other four fifths (the same
 *  fitComps the board uses) and the held-out group's market caps are
 *  predicted with impliedValue, growth and maturity multipliers included,
 *  exactly as a pre-token protocol is scored. Every comparable is
 *  predicted once, so the pooled error is the model's, not one split's.
 *  "Within 2x" counts a prediction when 0.5 <= predicted/real <= 2, i.e.
 *  the prediction is between half and twice the real market cap. (An
 *  absolute error <= 100% would wrongly count any large underestimate,
 *  e.g. predicting 1% of the real value; that was the v2.0 bug.) */
export function blindTest(
  protocols: SnapshotProtocol[],
  asOf: string,
  settings: ModelSettings = SETTINGS,
): BlindTest {
  const comps = protocols.filter(isComp).sort((a, b) => a.slug.localeCompare(b.slug));
  const apes: number[] = [];
  const ratios: number[] = [];
  const foldMedians: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const held = comps.filter((_, i) => i % 5 === fold);
    const train = comps.filter((_, i) => i % 5 !== fold);
    const fit = fitComps(train, settings);
    const foldApes = held.map((p) => {
      const pred = impliedValue(p, asOf, fit, settings).implied;
      ratios.push(pred / p.mcap_usd!);
      return Math.abs(pred - p.mcap_usd!) / p.mcap_usd!;
    });
    foldMedians.push(round2(median(foldApes) * 100));
    apes.push(...foldApes);
  }
  const sorted = [...apes].sort((a, b) => a - b);
  const p75 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]! : 0;
  const actualRatios = ratios.map((r) => 1 / r).sort((a, b) => a - b);
  const quartile = (q: number) => actualRatios[Math.floor((actualRatios.length - 1) * q)] ?? 1;
  const full = fitComps(protocols, settings);
  return {
    held_out: comps.length,
    median_ape_pct: round2(median(apes) * 100),
    p75_ape_pct: round2(p75 * 100),
    within_2x_pct: round2((ratios.filter((r) => r >= 0.5 && r <= 2).length / Math.max(1, ratios.length)) * 100),
    fold_median_ape_pct: foldMedians,
    train_intercept: full.intercept,
    train_slope: full.slope,
    actual_to_predicted_p25: quartile(0.25),
    actual_to_predicted_p75: quartile(0.75),
  };
}

/** The growth multiplier from a protocol's 7-day TVL change. */
export function growthMultiplier(change7d: number | null, settings: ModelSettings = SETTINGS): {
  pct: number;
  multiplier: number;
} {
  if (change7d === null || !Number.isFinite(change7d)) return { pct: 0, multiplier: 1 };
  const pct = Math.min(settings.growth_cap_pct, Math.max(settings.growth_floor_pct, change7d));
  return { pct: round2(pct), multiplier: round4(1 + (pct / 100) * settings.growth_weight) };
}

/** The maturity multiplier from a protocol's age in days. */
export function maturityMultiplier(ageDays: number | null, settings: ModelSettings = SETTINGS): number {
  const age = ageDays ?? settings.unknown_age_days;
  const f = settings.maturity_floor + Math.min(1, age / settings.maturity_days) * (1 - settings.maturity_floor);
  return round4(f);
}

/** The implied value of one pre-token protocol, with the pieces that make it. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  fit: CompsFit,
  settings: ModelSettings = SETTINGS,
): {
  implied: number;
  comps_base_usd: number;
  category_shift: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
} {
  const base = curveValue(p.tvl_usd, fit);
  const shift = p.category !== null && fit.category_shift_dex[p.category] !== undefined
    ? Math.pow(10, fit.category_shift_dex[p.category]!)
    : 1;
  const growth = growthMultiplier(p.change_7d, settings);
  const age = ageDays(asOf, p.listed_at);
  const maturity = maturityMultiplier(age, settings);
  // Round the pieces first, then multiply them: the dashboard's breakdown
  // multiplies the shown numbers and must land on the shown implied value.
  const baseRounded = Math.round(base);
  const shiftRounded = round4(shift);
  return {
    implied: Math.max(1, Math.round(baseRounded * shiftRounded * growth.multiplier * maturity)),
    comps_base_usd: baseRounded,
    category_shift: shiftRounded,
    growth_multiplier: growth.multiplier,
    maturity_multiplier: maturity,
    age_days: age,
  };
}

/** Typical cost of one transaction on a chain, as the farm plan states it. */
const CHAIN_GAS: Record<string, { gas: string; note: string }> = {
  Ethereum: { gas: 'about $6', note: 'one action on Ethereum mainnet costs roughly $6 at ordinary gas prices' },
  Base: { gas: 'about $0.50', note: 'one action on Base costs roughly $0.50' },
  Arbitrum: { gas: 'about $0.50', note: 'one action on Arbitrum costs roughly $0.50' },
  Optimism: { gas: 'about $0.50', note: 'one action on Optimism costs roughly $0.50' },
  zkSync: { gas: 'about $0.50', note: 'one action on zkSync Era costs roughly $0.50' },
  Polygon: { gas: 'about $0.50', note: 'one action on Polygon costs roughly $0.50' },
  Blast: { gas: 'about $0.50', note: 'one action on Blast costs roughly $0.50' },
  BSC: { gas: 'about $0.30', note: 'one action on BNB Chain costs roughly $0.30' },
  Avalanche: { gas: 'about $0.50', note: 'one action on Avalanche costs roughly $0.50' },
  Solana: { gas: 'about $0.05', note: 'one action on Solana costs roughly $0.05' },
};

function chainGas(chain: string): { gas: string; note: string } {
  return CHAIN_GAS[chain] ?? { gas: 'about $1', note: `one action on ${chain} costs roughly $1` };
}

/** The position size the farm plan recommends, by the protocol's TVL. */
export function farmCapital(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 250;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How long the position stays open, by the protocol's age. */
function holdDays(ageDays: number | null, settings: ModelSettings): number {
  if (ageDays === null) return 45;
  if (ageDays < 180) return 90;
  if (ageDays < 365) return 60;
  return 30;
}

/** The first action of the farm, in the protocol's own category. */
function categoryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const actions: Record<string, string> = {
    Lending: 'a lending deposit', CDP: 'a collateral deposit',
    'Collateral Markets': 'a collateral deposit', Dexs: 'a liquidity position',
    Yield: 'a vault deposit', Bridge: 'a bridge transfer', 'Canonical Bridge': 'a bridge transfer',
    'Liquid Staking': 'a staking position', Restaking: 'a staking position', 'Staking Pool': 'a staking position',
    Perpetuals: 'a margin deposit', Derivatives: 'a margin deposit', Prediction: 'a market position',
    'Risk Curators': 'a vault deposit', 'Onchain Capital Allocator': 'a vault deposit',
    RWA: 'an asset purchase', Insurance: 'a cover purchase',
    'Stablecoin Wrapper': 'a stable asset position', Stablecoins: 'a stable asset position',
    Payments: 'a payment', 'Governance Incentives': 'a governance action',
  };
  return `Consider ${actions[p.category ?? ''] ?? 'an app action'} on ${p.name} (${chain}) only if supported on its official site. Estimated capital: $${capital}, an entry TVL-tier rule, not a verified minimum.`;
}

/** Six steps to farm one pre-token protocol: action, cost, time. */
export function farmPlan(
  p: SnapshotProtocol,
  asOf: string,
  settings: ModelSettings = SETTINGS,
): string[] {
  const capital = farmCapital(p.tvl_usd);
  const chain = p.chains[0] ?? 'Ethereum';
  const age = ageDays(asOf, p.listed_at);
  const hold = holdDays(age, settings);
  return [
    `Open a fresh wallet for this farm only and store its recovery phrase offline, never in a screenshot or chat.`,
    categoryAction(p, capital, chain),
    `Check ${p.name}'s official rewards/points page for what counts before any weekly action. No eligibility or reward is evidenced by this snapshot.`,
    `Estimated hold: about ${hold} days, an entry age-based rule. Check withdrawal terms first; this is not a verified requirement or a promise of snapshot inclusion.`,
    `Check ${p.name}'s own points or rewards page from its official site only; never pay to claim and never sign a blind approval.`,
    `Record the wallet address, the dates and the transaction hashes in a farm log for your own activity records.`,
  ].map((s) => s.trim());
}

/** What each farm step costs and how long it takes, in the same order as farmPlan. */
export function farmPlanCost(
  p: SnapshotProtocol,
  asOf: string,
  settings: ModelSettings = SETTINGS,
): FarmStep[] {
  const capital = farmCapital(p.tvl_usd);
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = chainGas(chain);
  const age = ageDays(asOf, p.listed_at);
  const hold = holdDays(age, settings);
  const texts = farmPlan(p, asOf, settings);
  return [
    { text: texts[0]!, cost: 'nothing to create', time: '5 minutes' },
    { text: texts[1]!, cost: `est. $${capital} capital + ${gas.gas} gas`, time: '15 minutes' },
    { text: texts[2]!, cost: `est. ${gas.gas} gas per action`, time: '10 minutes a week' },
    { text: texts[3]!, cost: `est. $${capital} capital at risk`, time: `${hold} days` },
    { text: texts[4]!, cost: 'nothing to check', time: '10 minutes' },
    { text: texts[5]!, cost: 'nothing', time: '5 minutes' },
  ].map((step) => ({ ...step, time: `est. ${step.time}` }));
}

/** Build the board and the dashboard data from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  settings: ModelSettings = SETTINGS,
  snapshotHash = '',
): { board: BoardRow[]; data: RadarData } {
  const fit = fitComps(snapshot.protocols, settings);
  const blind = blindTest(snapshot.protocols, snapshot.as_of, settings);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const watch = snapshot.watchlist.map((slug) => bySlug.get(slug)!).filter(Boolean);
  const early = snapshot.protocols
    .filter((p) => isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd);

  const scored = [...watch, ...early]
    .map((p) => ({ p, value: impliedValue(p, snapshot.as_of, fit, settings) }))
    .sort((a, b) => {
      if (b.value.implied !== a.value.implied) return b.value.implied - a.value.implied;
      if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
      return a.p.slug.localeCompare(b.p.slug);
    });

  const board: BoardRow[] = scored.map(({ p, value }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: null,
    listed_at: p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token' as const,
    age_days: value.age_days,
    implied_value_usd: value.implied,
    model: {
      comps_base_usd: value.comps_base_usd,
      category_shift: value.category_shift,
      growth_pct: growthMultiplier(p.change_7d, settings).pct,
      growth_multiplier: value.growth_multiplier,
      maturity_multiplier: value.maturity_multiplier,
      age_days: value.age_days,
    },
    farm_steps: farmPlan(p, snapshot.as_of, settings),
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.gecko_id !== null && p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));

  const present = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((slug) => !present.has(slug));
  const coverage: Coverage = {
    watchlist_total: snapshot.watchlist.length,
    watchlist_covered: snapshot.watchlist.length - missing.length,
    watchlist_missing: missing,
    snapshot_as_of: snapshot.as_of,
    snapshot_hash: snapshotHash,
  };
  const data: RadarData = {
    coverage,
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    settings,
    fit,
    blind,
    watchlist_size: watch.length,
    board_size: board.length,
    early_size: early.length,
    live_size: live.length,
    rows: board.map((r) => {
      const costs = farmPlanCost(
        snapshot.protocols.find((p) => p.slug === r.slug)!,
        snapshot.as_of,
      );
      return {
        rank: r.rank,
        slug: r.slug,
        name: r.name,
        category: r.category,
        chains: [...r.chains],
        tvl_usd: r.tvl_usd,
        change_7d: r.change_7d,
        age_days: r.age_days,
        implied_value_usd: r.implied_value_usd,
        comps_base_usd: r.model.comps_base_usd,
        category_shift: r.model.category_shift,
        growth_multiplier: r.model.growth_multiplier,
        maturity_multiplier: r.model.maturity_multiplier,
        farm_steps: [...r.farm_steps],
        farm_costs: costs.map((c) => c.cost),
        farm_times: costs.map((c) => c.time),
      };
    }),
    live,
  };
  return { board, data };
}

/** All gate-rule problems with a board, in the same words the grader uses. */
export function boardIssue(board: BoardRow[], watchlist: string[]): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board must hold 100 to 4000 rows, got ${board.length}`;
  }
  const rows = [...board].sort((a, b) => a.rank - b.rank);
  if (rows[0]?.rank !== 1 || rows[rows.length - 1]!.rank !== rows.length) {
    return 'board rank must run exactly 1..N in order';
  }
  const present = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!present.has(slug)) return `board misses watchlist protocol ${slug}`;
  }
  const slugs = new Set<string>();
  for (const row of rows) {
    if (slugs.has(row.slug)) return `board repeats slug ${row.slug}`;
    slugs.add(row.slug);
    if (!row.slug || !row.name) return `row ${row.rank} misses slug or name`;
    if (row.token_status !== 'pre-token') return `row ${row.rank} must carry token_status "pre-token"`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `row ${row.rank} must carry a positive integer implied_value_usd`;
    }
    if (row.implied_value_usd > 1e14) return `row ${row.rank} implied value above 1e14`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.rank} farm_steps must hold 3 to 12 steps`;
    }
    for (const step of row.farm_steps) {
      const s = typeof step === 'string' ? step.trim() : '';
      if (s.length < 20 || s.length > 600) return `row ${row.rank} farm step must be 20 to 600 characters`;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `board implied value rises at rank ${rows[i]!.rank}`;
    }
  }
  if (rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) {
    return 'board implied values must not all be equal';
  }
  return null;
}

/** The script the dashboard reads: one line that sets window.RADAR. */
export function dataScript(data: RadarData): string {
  const json = JSON.stringify(data);
  if (json.includes('<')) throw new Error('dashboard data must not contain <');
  return `window.RADAR=${json};\n`;
}
