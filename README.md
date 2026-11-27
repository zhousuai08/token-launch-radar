# Token Radar — pre-token protocols ranked by implied value

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhousuai08/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhousuai08/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A dashboard that reads DefiLlama's sealed snapshot of every protocol it tracks (758 protocols,
as of 2026-11-14), works out what a token would be worth if each pre-token protocol launched one,
and ranks them. The board covers all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus
138 more pre-token protocols below the floor that pass the watchlist's own exclusions — 178 rows.

## The model

implied value = TVL × category multiple × growth × maturity.

- **Category multiple**: the median mcap/TVL of the listed protocols in the row's own category,
  when at least 3 of them trade; otherwise the median across every listed protocol (0.205).
  Computed from the snapshot at run time, clamped to [0.05, 1.00].
- **Growth**: the 7-day TVL change, clamped to [-40%, +60%], at weight 0.5.
- **Maturity**: 0.70 + min(age, 1095 days)/1095 × 0.30 (age unknown: 0.85).

The same function scores every row. No protocol is special-cased, and the model says nothing
about whether or when a token launches — only what it would be worth if it did.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to
`board.json`, writes the dashboard's data to `data.js`, copies `dashboard/` and `screenshots/` to
the output, and writes `dossier.json` with the vendored make.fun library.

## The dashboard

Open `dashboard/index.html` in a desktop browser (it reads `data.js` beside it, no network):
a ranked board with search, category/chain/TVL filters, a watchlist-only toggle and sortable
columns; click any row for its detail view — the model's own breakdown, a recomputed check
against board.json, and a six-step farm plan. A live-token tab shows the market's own values
for comparison, and a model tab lists every category multiple and its source.

## Farm plans

Each row carries a six-step plan derived from its own record (category, chains, TVL, age):
set up a fresh wallet, take the category's action with sized capital, act weekly, hold long
enough to span snapshots, claim only through the protocol's own published link, and keep a log.
