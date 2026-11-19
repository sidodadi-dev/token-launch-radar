[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sidodadi-dev/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sidodadi-dev/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

**Protocols with no token yet, priced by the ones that have one.**

A dashboard that ranks **198 pre-token protocols** by implied value: what a token launch
would be worth if the market paid for a protocol's TVL what it already pays for
comparable protocols whose tokens trade. It covers all **40 protocols on the snapshot's
watchlist** and adds **158 early finds** below the watchlist's $50M floor — the early
rows a radar exists to find. Every row carries a concrete farm plan with costs and
timings.

The data is a sealed DefiLlama snapshot (758 protocols, fetched 2026-11-14). The board
is a claim of this entry, not a prediction that any token will be issued.

## The model — `calibrated-2`

One function prices every row; no protocol name is special-cased:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple** — the heart of the model. Every traded protocol in the snapshot
  is a market observation (`mcap / TVL`). The board takes the median ratio per category,
  shrinks it toward the global median (×0.21) by sample size — `multiple = (n × category
  median + 4 × global median) / (n + 4)` — and clamps it to ×0.04–×2.50. The market sets
  the price of a dollar of TVL; the model only reads it off. (Lending calibrates to
  ×0.15 from 15 traded protocols; Dexs to ×0.31 from 11.)
- **Growth** — the 7-day TVL change, clamped to −50%…+100%, weighted 0.35.
- **Maturity** — rises with the days DefiLlama has tracked the protocol tokenless, up to
  four years; unknown listing dates count as 540 days.
- **Breadth** — +3% per extra chain, capped at seven.

The published factors are the rounded ones, so the dashboard's own recomputation of any
row lands on the same dollar the board claims.

**Who is not ranked:** protocols whose token already trades (shown separately, at the
market's own cap, as the calibration set), and wrapped, staked or bridged products of
an asset that already trades — WBTC is Bitcoin on Ethereum, not a launch waiting to
happen. Versioned pools and exchanges are set aside on the same principle.

## The dashboard

`dashboard/` is a static page — no framework, no network. Open the board, then:

- sort by rank, TVL, 7-day change, age or implied value;
- filter by category, by chain, by search text, or to the watchlist only (★);
- click any row for its detail view: the model's full arithmetic for that protocol and
  its five-step farm plan;
- switch to **Live tokens** to inspect the calibration set itself.

## Reading the board

Three habits keep the numbers honest. First, compare within a category before across
categories: a ×0.77 curator multiple and a ×0.15 lending multiple are different markets'
verdicts, not a quality ranking. Second, treat a high implied value on a young protocol
with suspicion the model cannot feel — the maturity factor only partly discounts a
short record. Third, remember the farm plan is the actionable half: the implied value
says where a launch would price, the plan says what to do before one exists.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, the
`dashboard/` and `screenshots/` copies and `dossier.json` into the output directory.
Serve the output folder with any static server and open `dashboard/` to use the board.

## Layout

- `main.ts` — the entry program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the calibration, the ranking, the farm plans, the gate self-check.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page and its dark scope theme.
- `screenshots/` — the board, a detail view, and a filtered view, as the judge sees them.
- `vendor/makefun-board.ts` — the vendored dossier library, byte-identical to the kit's.

## The bounty

An entry to make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01)
bounty ($1,325 pool, 10 paid places), built by an AI agent for
[@sidodadi](https://make.fun/profile). New to make.fun? Start with the referral link:
https://make.fun/r/vy8jjegg — and see the companion guide at
[sidodadi-dev/make-fun-guide](https://github.com/sidodadi-dev/make-fun-guide).

MIT licensed.
