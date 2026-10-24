# Flake

Debt payoff and paycheck budgeting for a household. Plan each paycheck, log spending in a few taps, check in with your bank balance on payday, and see when every debt will be gone.

Local-first web app (Vite + React + TypeScript), planned to become an installable PWA, then an iOS app through Capacitor.

## Status

**Phase 1 — engine (this branch).** All calculations, the data model, and storage. The UI is a placeholder until a design direction is chosen.

| Module | What it does |
|---|---|
| `src/engine/payCalendar.ts` | Paydays for weekly, bi-weekly, semi-monthly, and monthly schedules. Weekend/holiday paydays move to the previous business day; tracks "may deposit early". Builds pay periods from the anchoring paycheck. |
| `src/engine/budget.ts` | Per-paycheck plan: income, bills by due date (or split across paychecks), debt payments, weekly budgets (counted by actual weekday), planned-expense set-asides, the pot, and what's still unassigned. Long-run monthly averages use 52.18 weeks a year. |
| `src/engine/debt.ts` | Month-by-month payoff simulation with interest, minimums, rollover, lump sums, promo and deferred-interest rates. Compares highest-rate-first, smallest-balance-first, custom and minimums-only, then recommends one with reasons. |
| `src/engine/mortgage.ts` | Amortization schedule, Excel-compatible NPER, extra-principal what-ifs. |
| `src/engine/milestones.ts` | Debt paid off, debt-free, total under $X, fund reached, mortgage under $X, each with progress and a projected date. |
| `src/engine/checkin.ts` | Payday check-in: compares the real bank balance to what the plan expected, and works out what's safe to assign. |
| `src/store/` | Pure actions, an observable store, IndexedDB storage, and JSON backup export/import with validation. |

Money is integer cents everywhere. Dates are `YYYY-MM-DD` strings with UTC math.

## Scripts

```bash
npm install
npm test          # engine tests
npm run typecheck
npm run dev       # http://localhost:5173
```

## Private data

The repo is public, so household numbers never go in it. `local/` is gitignored and holds the real household seed, tests that check the engine against the original spreadsheet, and design previews built from the real numbers. `src/data/sample.ts` is a made-up demo household.

## Roadmap

1. ~~Engine and data~~
2. Pick a design direction
3. Build the screens
4. Host it, make it installable on a phone, sync phone and PC through Supabase
5. iOS app through Capacitor
