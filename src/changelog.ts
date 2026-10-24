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
