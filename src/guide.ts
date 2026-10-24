import { DEFAULT_SETTINGS } from './model/factory';
import type { AppData } from './model/types';
import { live } from './engine';
import { updateSettings } from './store/actions';

/**
 * The setup guide: what a new household needs for Flake's numbers to mean
 * something, in the order it's easiest to do. Each step ticks itself off from
 * the data; the few that can't be detected are confirmed by hand.
 */
export type GuideStepId = 'names' | 'paychecks' | 'timing' | 'bills' | 'budgets' | 'debts' | 'keep' | 'checkin' | 'sync';

export interface GuideStep {
  id: GuideStepId;
  title: string;
  why: string;
  action: string;
  done: boolean;
  optional?: boolean;
}

export function guideSteps(data: AppData, signedIn: boolean): GuideStep[] {
  const confirmed = new Set(data.settings.guide?.confirmed ?? []);
  const people = data.household.people.filter((p) => p && p !== 'Me');
  const paychecks = live(data.incomes).filter((s) => s.amount > 0 || (s.hourly?.rate ?? 0) > 0);
  return [
    { id: 'names', title: 'Who’s in the household', why: 'Names for greetings and for whose paycheck, card or bill is whose.', action: 'Add names', done: people.length > 0 },
    { id: 'paychecks', title: 'Add your paychecks', why: 'Take-home pay and payday for each one. Everything else is planned around these.', action: 'Add a paycheck', done: paychecks.length > 0 },
    {
      id: 'timing',
      title: 'When you pay bills',
      why: 'As soon as you get paid, or on each due date. Flake uses this to know when money leaves.',
      action: 'Choose',
      done: confirmed.has('timing') || data.settings.billTiming === 'payday',
    },
    { id: 'bills', title: 'Add your bills', why: 'Power, phone, insurance… with due days. Mark any on autopay.', action: 'Add a bill', done: live(data.bills).length > 0 },
    { id: 'budgets', title: 'Set spending budgets', why: 'Groceries, gas, fun money. What you plan to spend each week or paycheck.', action: 'Add a budget', done: live(data.categories).length > 0 },
    {
      id: 'debts',
      title: 'Add your debts',
      why: 'Cards and loans with balances and rates give you a debt-free date.',
      action: 'Add a debt',
      done: live(data.debts).length > 0 || confirmed.has('debts'),
    },
    {
      id: 'keep',
      title: 'How much to always keep in the bank',
      why: 'A floor that’s never counted as safe to spend.',
      action: 'Set it',
      done: confirmed.has('keep') || data.settings.cashBuffer !== DEFAULT_SETTINGS.cashBuffer,
    },
    { id: 'checkin', title: 'Do your first check-in', why: 'Type your checking balance. From then on it’s the only thing you need to enter.', action: 'Check in', done: live(data.checkIns).length > 0 },
    { id: 'sync', title: 'Sync your phone and computer', why: 'Optional: sign in on both to keep them in step.', action: 'Set up', done: signedIn || confirmed.has('sync'), optional: true },
  ];
}

/** Mark a step that can't be detected (or doesn't apply) as done. */
export function confirmStep(data: AppData, id: GuideStepId): AppData {
  const guide = data.settings.guide ?? {};
  const confirmed = [...new Set([...(guide.confirmed ?? []), id])];
  return updateSettings(data, { guide: { ...guide, confirmed } });
}

export function setGuide(data: AppData, fields: { started?: boolean; dismissed?: boolean }): AppData {
  return updateSettings(data, { guide: { ...(data.settings.guide ?? {}), ...fields } });
}
