// Token Launch Radar — the model. One sealed snapshot in, one ranked board out.
//
// What this board claims: if a protocol that records no token issued one today, at the
// valuation the market already pays for comparable token-bearing protocols, what would
// that token be worth? The answer is a claim of this entry, derived only from the
// snapshot's own figures — never from a hardcoded list of names.
//
// How the implied value is built (model "calibrated-2"):
//
//   1. Calibration. Every protocol in the snapshot whose token already trades gives a
//      market observation: ratio = mcap_usd / tvl_usd. The board takes the median ratio
//      of all of them (the global multiple) and the median per category, then shrinks
//      each category's multiple toward the global one by its sample size:
//      multiple = (n x category median + 4 x global median) / (n + 4), clamped to
//      [0.04, 2.5]. A category with no traded member uses the global median. The market
//      itself sets the price of a dollar of TVL; the model only reads it off.
//   2. Growth. change_7d, clamped to [-50, +100] per cent, moves the value by
//      1 + 0.35 x change/100: a protocol adding TVL fast is worth more than a shrinking
//      one with the same stock. Unreported growth counts as neutral.
//   3. Maturity. A protocol DefiLlama has tracked longer has survived longer without a
//      token: 0.75 + 0.45 x min(age_days, 1460)/1460. Unknown listing dates count as
//      540 days, a deliberately middling age.
//   4. Breadth. Each extra chain past the first adds 3%, capped at seven: distribution
//      is part of what a launch would sell.
//
//   implied = round(tvl x multiple x growth x maturity x breadth), at least $1.
//
// The board ranks every rankable pre-token protocol in the snapshot (342 record no
// token; versioned pools, exchanges and wrapped, staked or bridged products of assets
// that already trade — WBTC and its kin — are set aside as someone else's token), the
// watchlist first among equals: the watchlist is the floor, and this radar's job is
// the whole sky above it.
// Protocols whose token already trades are never ranked — they are shown apart, at the
// market's own market cap, as the calibration set the model learned from.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One category's calibration: the median market multiple and how many traded protocols set it. */
export interface CategoryCalibration {
  category: string;
  traded: number;
  median_ratio: number;
  multiple: number;
}

/** The calibration the snapshot itself produced: the multiples the board prices with. */
export interface Calibration {
  global_median: number;
  traded_protocols: number;
  categories: CategoryCalibration[];
}

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'calibrated-2';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 32;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The model's arithmetic for one row, shown in the detail view so a reader can audit it. */
export interface ModelBreakdown {
  category_multiple: number;
  calibration_traded: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One row of board.json: the ranked board's row. */
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
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the calibration behind it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The market's own pricing, read off the snapshot: for every category with traded
 * members, the shrunk median mcap/TVL multiple a pre-token protocol in it is priced at.
 */
export function calibrate(snapshot: Snapshot): Calibration {
  const traded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalMedian = traded.length > 0 ? median(traded.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of traded) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, ratios]) => {
      const med = median(ratios);
      const multiple = clamp((ratios.length * med + 4 * globalMedian) / (ratios.length + 4), 0.04, 2.5);
      return { category, traded: ratios.length, median_ratio: round4(med), multiple: round4(multiple) };
    })
    .sort((a, b) => (a.category < b.category ? -1 : 1));
  return { global_median: round4(globalMedian), traded_protocols: traded.length, categories };
}

/** The multiple one protocol is priced at: its category's, or the global median when uncalibrated. */
function multipleFor(p: SnapshotProtocol, calibration: Calibration): { multiple: number; traded: number } {
  const hit = calibration.categories.find((c) => c.category === (p.category ?? 'Uncategorised'));
  return hit !== undefined ? { multiple: hit.multiple, traded: hit.traded } : { multiple: calibration.global_median, traded: 0 };
}

/** The four factors and the implied value one protocol gets under the calibration. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, traded } = multipleFor(protocol, calibration);
  const growthPct = protocol.change_7d === null ? 0 : clamp(protocol.change_7d, -50, 100);
  // The factors are rounded to the four decimals the board publishes before they are
  // multiplied, so the dashboard's own recomputation from the published figures lands
  // on the same dollar the board claims — the page and the board cannot drift apart.
  const growthMult = round4(1 + (growthPct / 100) * 0.35);
  const ageForModel = age ?? 540;
  const maturityMult = round4(0.75 + 0.45 * (clamp(ageForModel, 0, 1460) / 1460));
  const breadthMult = round4(1 + 0.03 * Math.min(Math.max(protocol.chains.length - 1, 0), 7));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    breakdown: {
      category_multiple: multiple,
      calibration_traded: traded,
      growth_multiplier: growthMult,
      maturity_multiplier: maturityMult,
      breadth_multiplier: breadthMult,
      age_days: age,
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are by construction a product of another protocol or asset, not a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking is a wrapped or staked product. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name is that exchange's product, not its own protocol. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is a wrapped, staked or bridged product of an asset that already
 * trades (WBTC is Bitcoin on Ethereum; an exchange's staked ETH is ETH). The snapshot
 * carries no parent field, so the test uses what the record does carry — the same
 * signals the watchlist's own rule names: the product categories, a wrapped or staked
 * word in the name, an exchange's name at its head. A bridge entry in this dataset is a
 * pool of bridged assets, so the Bridge category is set aside with the rest.
 */
export function isProductOfAnother(p: SnapshotProtocol): boolean {
  return (
    (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) ||
    PRODUCT_WORD.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name)
  );
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not a product of another, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProductOfAnother(p) && !VERSIONED.test(p.name);
}

/** The protocols the board ranks, strongest first, with ranks 1..n and the watchlist always covered. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration = calibrate(snapshot)): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isRankable(p) || watch.has(p.slug));
  const scored = chosen.map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, calibration);
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain: mainnet is dear, rollups cheap, Solana nearly free. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$6 to $12 of gas on Ethereum mainnet';
  if (chain === 'Solana') return 'a few cents of Solana fees';
  if (chain === 'Bitcoin') return 'about $1 to $3 of Bitcoin fees';
  return 'under $1.50 of gas on its rollup';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action and its follow-up, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit open.`,
      second: `Borrow a small amount (under 30% of the supply's value) against the deposit and repay it a week later, so the wallet shows both sides of the market.`,
    };
  }
  if (c.includes('dex') || c.includes('aggregator')) {
    return {
      core: `Swap about $${capital} of volume through ${name} on ${chain}, split across at least three separate days.`,
      second: `Add $${Math.max(25, Math.floor(capital / 2))} of liquidity to ${name}'s busiest pool and keep the position open.`,
    };
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) {
    return {
      core: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`,
      second: `Make a second, smaller deposit two weeks later so the wallet's history is not a single touch.`,
    };
  }
  if (c.includes('bridge') || c.includes('chain abstraction') || c.includes('interoperability')) {
    return {
      core: `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in one app there.`,
      second: `Bridge a smaller amount back a week later; round trips are what a bridge's own usage record shows.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      core: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`,
      second: `Claim or compound the staking rewards once, so the wallet records a full staking cycle.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      core: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position (long and short of similar size).`,
      second: `Close the position after a few days and leave the margin in the account; volume plus a resting balance is the usage that counts.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund $${capital} on ${name} and take positions in at least three different markets.`,
      second: `Settle or sell one position to completion so the wallet shows a resolved trade, not only entries.`,
    };
  }
  if (c.includes('stable')) {
    return {
      core: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`,
      second: `Use the stable asset once inside the protocol's own app (a swap, a deposit or a payment), not only in the wallet.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it past one full yield period.`,
      second: `Redeem a small part once, so the wallet records both the mint and the redemption path.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to expiry.`,
      second: `Renew or extend the cover once; a second policy period is the repeat usage insurers record.`,
    };
  }
  if (c.includes('launch')) {
    return {
      core: `Register the farming wallet on ${name} and complete its current participation round with about $${capital}.`,
      second: `Take part in one more round or one community task the platform itself lists; one touch rarely qualifies.`,
    };
  }
  return {
    core: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    second: `Repeat the deposit with a smaller amount two weeks later, so the wallet's history is not a single touch.`,
  };
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const { core, second } = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm ${p.name} with, and keep its seed phrase offline.`,
      cost: 'nothing to create, and never pay anyone to set one up',
      time: '5 minutes',
    },
    {
      text: core,
      cost: `$${capital} of capital plus ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about ${gas}`,
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action each week and hold the position for at least ${hold} days, so the activity lands in more than one weekly snapshot.`,
      cost: `about $2 of gas a week, and the $${capital} stays in the position`,
      time: `${hold} days in total`,
    },
    {
      text: `Check ${p.name}'s own points or rewards page before you withdraw, claim only from the link the protocol itself publishes, and log every transaction so you can unwind the position cleanly.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view — the calibration set. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the figures plus the farm plan the detail view renders. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot);
  const board = buildBoard(snapshot, calibration);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
