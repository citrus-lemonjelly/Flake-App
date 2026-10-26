/**
 * What's new in Flake, newest first. The first entry's version is the app
 * version shown in the app. Add an entry (and bump package.json) with every
 * release to main.
 */
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '0.11.0',
    date: '2026-10-26',
    title: 'Progress: debts and goals in one place',
    items: [
      'Debts, Goals and Tracker are now one Progress page.',
      'Milestones run along the top; every debt and savings goal has its own row to tap into.',
      'The payoff plan shows its order and balance chart; tap Change to pick a strategy or the extra each month.',
      'The house’s “pay extra principal” calculator now lives on the mortgage’s own page.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-10-26',
    title: 'A simpler bottom bar',
    items: [
      'On the phone the bottom bar is now three buttons: Menu, Home and Profile.',
      'Menu pops up every page (Plan, Spending, Debts, Goals, Tracker) so you can jump straight to it.',
      'Profile holds sync, your color scheme, Settings and What’s new.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-26',
    title: 'Tracker',
    items: [
      'A Tracker tab lists every debt and savings goal on its own row, with its progress and estimated finish date.',
      'Tap one to follow it by itself: how much is paid or saved, its projected balance, and every payment or deposit so far.',
      'Savings goals without a due date show when they’ll get there at your last three months’ pace.',
      'The floating + is gone from the phone’s bottom bar. Each section now has its own + (Log on budgets and spending, Add on debts and goals), so the bar holds just the tabs.',
      'A Log spending button sits at the top of Home and the Tracker.',
    ],
  },
  {
    version: '0.8.1',
    date: '2026-10-24',
    title: 'Polish and fixes',
    items: [
      'Fixed: editing a purchase from the day of a check-in could count it twice.',
      'When a new version is out, a banner offers a one-tap update.',
      'Flake notices the new day when you reopen it the next morning.',
      'Deleting something now happens right away with Undo, instead of an "Are you sure?" pop-up.',
      'A shorter Home on the phone: recent spending sits with your budgets, and the next milestone with your debt date.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-24',
    title: 'Setup guide and tips',
    items: [
      'A Getting started checklist on Home walks a new household through setup, one step at a time, ticking steps off as they’re done.',
      '"Set up from scratch" on the welcome screen starts the guide.',
      'Each screen explains itself the first time you open it. Settings → Help brings the guide and tips back.',
    ],
  },
  {
    version: '0.7.2',
    date: '2026-10-24',
    title: 'Sidebar hover highlight',
    items: ['On desktop, sidebar tabs light up in your color scheme when you hover over them.'],
  },
  {
    version: '0.7.1',
    date: '2026-10-24',
    title: 'Version and changelog',
    items: ['The version number and this list of changes, bottom-right on desktop and under Settings on the phone.'],
  },
  {
    version: '0.7.0',
    date: '2026-10-24',
    title: 'Spending screen',
    items: [
      'A Spending screen: look back by paycheck, week or month, with totals against each budget.',
      'Tap any entry to fix it, or to sort spending found at a check-in into a budget.',
      'Home shows your most recent spending; tap a budget to see what went into it.',
    ],
  },
  {
    version: '0.6.2',
    date: '2026-10-24',
    title: 'Quick theme picker',
    items: ['Color scheme and light/dark at the bottom-left of the desktop sidebar.'],
  },
  {
    version: '0.6.1',
    date: '2026-10-24',
    title: 'Purchases land where you can see them',
    items: [
      'Fixed: a purchase logged after a same-day check-in made Safe to spend go up.',
      'A purchase logged as "Other" now lowers Safe to spend.',
      "Home shows what's left in each budget this paycheck.",
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-24',
    title: 'Just type your balance',
    items: [
      'Check-ins work out the difference themselves: bills paid early or not yet, unlogged spending, money left over.',
      '"As soon as I get paid" bill timing, with autopay on the due date for individual bills.',
      'Fewer prompts; a reminder to check in after three days.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-10-24',
    title: 'Money kept in the bank',
    items: ['"Always keep in the bank" replaces "cushion", and Home shows how much it keeps back.'],
  },
  {
    version: '0.5.0',
    date: '2026-10-24',
    title: 'Hourly pay',
    items: ['Hourly paychecks: log hours, see the estimated take-home, and optionally confirm what landed.'],
  },
  {
    version: '0.4.0',
    date: '2026-10-24',
    title: 'Week and month views',
    items: ['The Plan switches between Week, Month and Paycheck.'],
  },
  {
    version: '0.3.0',
    date: '2026-10-24',
    title: 'On your phone, in sync',
    items: ['Install Flake to your home screen, use it offline, and sync between phone and computer.'],
  },
  {
    version: '0.2.0',
    date: '2026-10-24',
    title: 'The app',
    items: ['Home, paycheck plan, debts, goals and settings, with six color schemes and light/dark.'],
  },
  {
    version: '0.1.0',
    date: '2026-10-24',
    title: 'The engine',
    items: ['Pay calendar, paycheck plans, debt payoff and mortgage math, checked against the original spreadsheet.'],
  },
];

export const APP_VERSION = CHANGELOG[0]!.version;
