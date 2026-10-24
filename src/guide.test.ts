import { describe, expect, it } from 'vitest';
import { sampleData } from './data/sample';
import { emptyData } from './model/factory';
import { updateSettings } from './store/actions';
import { confirmStep, guideSteps } from './guide';

const done = (steps: ReturnType<typeof guideSteps>) => steps.filter((s) => s.done).map((s) => s.id);

describe('setup guide', () => {
  it('starts with nothing done for a new household', () => {
    expect(done(guideSteps(emptyData(), false))).toEqual([]);
  });

  it('ticks steps off from the data', () => {
    const steps = guideSteps(sampleData(), false);
    expect(done(steps)).toEqual(expect.arrayContaining(['names', 'paychecks', 'bills', 'budgets', 'debts', 'keep', 'checkin']));
    expect(done(steps)).not.toContain('timing'); // still the default, never chosen
    expect(done(guideSteps(sampleData(), true))).toContain('sync');
  });

  it('takes a hand confirmation for steps it cannot detect', () => {
    let data = emptyData();
    data = confirmStep(data, 'timing');
    data = confirmStep(data, 'debts'); // "I don't have any debts"
    data = confirmStep(data, 'timing'); // no duplicates
    expect(data.settings.guide?.confirmed).toEqual(['timing', 'debts']);
    expect(done(guideSteps(data, false))).toEqual(['timing', 'debts']);
  });

  it('choosing "as soon as I get paid" counts as choosing a timing', () => {
    expect(done(guideSteps(updateSettings(emptyData(), { billTiming: 'payday' }), false))).toContain('timing');
  });
});
