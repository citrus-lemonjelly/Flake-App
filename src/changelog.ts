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
    version: '0.19.0',
    date: '2026-11-10',
    title: 'Send left over to a debt',
    items: [
      'The Left over card has “Send left over to a debt”: pick how much and which debt (the one up next in your plan is chosen for you).',
      'Before sending, see the new debt-free date, when that debt is paid off, and the interest saved. It works for the mortgage too.',
      'If the payment would take checking below $0 before payday, Flake warns you.',
      'The payment is logged on the debt, lowers its balance, and comes out of Left over and the bank balance.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-11-10',
    title: 'Spending: recent amounts, rollover, trends and who logged it',
    items: [
      'A bucket’s + shows your recent purchases (like Shell $38.40) to log again in a tap.',
      'Update your bank balance and if it’s lower than Flake expected, you can log the difference into a bucket, so the week stays right.',
      'Turn on Roll over for a bucket and what’s left carries into next week (overspending comes out of it). Good for clothes or gifts.',
      'Each bucket shows its last eight weeks as tiny bars and its average.',
      'Swipe a purchase right to edit it, left to delete it (with Undo).',
      'Purchases say who logged them, and the week shows each person’s total. Each phone remembers who uses it.',
      'At the start of each week, Home shows how last week went, bucket by bucket.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-11-10',
    title: 'Bills: autopay, changing amounts, swipe, and yearly bills',
    items: [
      'Turn on Autopay for a bill and it ticks itself off on its due date. Next time you open Flake it shows what was ticked off, with Undo on each; an undone bill isn’t ticked again.',
      'Tap a bill to set this month’s amount, for bills that change, like a higher power bill. It counts everywhere for that month only.',
      'Swipe a bill to the right to mark it paid (or not paid).',
      'Bills can repeat every 3, 6 or 12 months, and be saved for with an even share from every paycheck so it’s all there when it’s due.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-11-10',
    title: 'Sleeker and livelier',
    items: [
      'Tighter, calmer layout: less padding, lighter shadows, and the “How this works” banners are now a small ? beside each page title.',
      'The setup guide disappears once everything is set up.',
      'Ticking a bill pops a check (with a tiny buzz on Android); numbers count up, bars fill in and charts draw themselves.',
      'Pay the last bill of the month and Flake celebrates.',
      'Anyone who asks their phone for reduced motion gets none of the movement.',
      'Fixed: Home could be wider than the phone screen and slide sideways (the bank balance line couldn’t wrap). Every page now fits, down to small phones like the iPhone SE.',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-11-10',
    title: 'Bank balance, now and ahead',
    items: [
      'Home has a Bank balance card: type in what’s in checking and Flake carries it forward with your pay, bills, set-asides and what you log in each bucket.',
      'A chart shows the next 30 days, with the lowest point, the balance after the next payday and at the end of the month. Point at a day to read it.',
      'If checking is headed below $0, Home says when.',
      'Extra debt payments and money moved into savings goals now count as money out.',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-11-10',
    title: 'Spending buckets',
    items: [
      'Spending is a set of weekly buckets, like Groceries, Gas, Eating out, Clothes or Other. Make one with + New bucket; common ones are a tap away.',
      'Each bucket has its own + to log a purchase straight into it, on Spending and on Home. The general Log spending button is gone.',
      'Other money in and hourly hours are logged from Log pay on Home.',
    ],
  },
  {
    version: '0.13.1',
    date: '2026-11-10',
    title: 'Totals on the Bills page',
    items: ['Each payday group under Still to pay shows its total, and the whole list shows what’s still to pay.'],
  },
  {
    version: '0.13.0',
    date: '2026-11-10',
    title: 'A simpler Flake: Home, Bills, Spending and Debt',
    items: [
      'Home shows what’s left over this month: money in against everything going out, with a small chart you can flip between six months and this month day by day.',
      'Log pay sits right on that card: type what each paycheck really was as it’s deposited.',
      'New Bills page: every bill and card payment for the month, grouped by the payday that pays it. Tap the circle to mark it paid for that month.',
      'Save for a bill in parts: set money aside from two paychecks into its own bucket, then log the payment when it goes out (great for a mortgage paid on the 1st).',
      'Spending is week by week: each budget, the purchases, and the bills leaving the bank that week. Budgets are all weekly now.',
      'Debts and savings goals live on the Debt page. Balance check-ins are gone; logging pay and ticking off bills keeps the numbers right.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-10-26',
    title: 'Money: your plan and spending in one place',
    items: [
      'Plan and Spending are now one Money page, by paycheck, week or month.',
      'Tap a budget to see just its purchases; tap a purchase to fix it or sort it into a budget.',
      'The tabs reach back to earlier paychecks, weeks and months as well as ahead.',
      'The phone’s bottom bar is now Home, Money, Progress and Profile, so every page is one tap away.',
      'Home is shorter: safe to spend, what to do next, your budgets and the debt-free date. Upcoming bills are in Money, and monthly averages in its Month view.',
    ],
  },
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
