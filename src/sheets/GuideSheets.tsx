import { useState } from 'react';
import type { PaidOn } from '../model/types';
import { updateHousehold, updateSettings } from '../store/actions';
import { confirmStep } from '../guide';
import { useData, useUpdate } from '../state/store';
import { useUI } from '../state/ui';
import { SelectField, Segmented, Sheet, TextField } from '../ui/components';
import { WEEKDAYS } from '../ui/format';

/** Who's in the household, and which day weekly budgets reset. */
export function HouseholdSheet() {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const [people, setPeople] = useState(data.household.people.filter((p) => p !== 'Me').join(', '));
  const [weekStartsOn, setWeekStartsOn] = useState(String(data.household.weekStartsOn));
  return (
    <Sheet
      title="Who's in the household"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          disabled={!people.trim()}
          onClick={() => {
            update((d) => updateHousehold(d, { people: people.split(',').map((p) => p.trim()).filter(Boolean), weekStartsOn: Number(weekStartsOn) }));
            ui.close();
          }}
        >
          Save
        </button>
      }
    >
      <TextField label="Names" value={people} onChange={setPeople} placeholder="e.g. Alex, Sam" hint="Separate with commas. The first name is used in greetings." />
      <SelectField
        label="Weekly budgets reset on"
        value={weekStartsOn}
        options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))}
        onChange={setWeekStartsOn}
        hint="Usually the day a weekly paycheck lands, so each week's groceries line up with pay."
      />
    </Sheet>
  );
}

/** When bills leave the bank. */
export function TimingSheet() {
  const data = useData();
  const update = useUpdate();
  const ui = useUI();
  const [timing, setTiming] = useState<PaidOn>(data.settings.billTiming);
  return (
    <Sheet
      title="When do you pay bills?"
      onClose={ui.close}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            update((d) => confirmStep(updateSettings(d, { billTiming: timing }), 'timing'));
            ui.close();
          }}
        >
          Save
        </button>
      }
    >
      <Segmented
        label="When do you pay bills"
        value={timing}
        onChange={setTiming}
        options={[
          { value: 'payday', label: 'As soon as I get paid' },
          { value: 'due-date', label: 'On each due date' },
        ]}
      />
      <p className="muted" style={{ fontSize: 14 }}>
        {timing === 'payday'
          ? 'Each bill is paid the day the paycheck that covers it lands, so Flake takes it out of your balance then.'
          : 'Bills come out on their due dates, like autopay. Flake keeps that money held back until then.'}
      </p>
      <p className="faint" style={{ fontSize: 13 }}>
        Individual bills can be different: open a bill and change "Leaves the bank", e.g. one on autopay.
      </p>
    </Sheet>
  );
}
