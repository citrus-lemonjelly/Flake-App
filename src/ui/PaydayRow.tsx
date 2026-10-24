import { byId, today, type Payday } from '../engine';
import { useData } from '../state/store';
import { useUI } from '../state/ui';
import { PaycheckSheet } from '../sheets/EditSheets';
import { money, shortDate, weekdayDate } from './format';

/** Where a paycheck's amount came from, in a few words. */
export function basisText(p: Payday, usualHours?: number): string | null {
  switch (p.basis) {
    case 'actual':
      return '✓ Confirmed';
    case 'hours':
      return `est. from ${p.hours} hrs`;
    case 'average':
      return 'est. from recent paychecks';
    case 'usual':
      return `est. at usual ${usualHours ?? ''} hrs`;
    default:
      return null;
  }
}

/** A paycheck in a Plan list. Hourly or confirmable ones open their paycheck sheet. */
export function PaydayRow({ p }: { p: Payday }) {
  const data = useData();
  const ui = useUI();
  const source = byId(data.incomes, p.sourceId);
  const editable = !!source && (!!source.hourly || (source.confirmOnPayday ?? false));
  const estimate = p.basis !== 'fixed' && p.basis !== 'actual';
  const landed = p.payday <= today();
  const basis = basisText(p, source?.hourly?.usualHours);
  const body = (
    <>
      <div className="grow">
        {p.name}
        <div className="explain">
          {weekdayDate(p.payday)}
          {p.earliestDeposit !== p.payday && ` · your bank usually posts it ${shortDate(p.earliestDeposit)}`}
          {p.scheduled !== p.payday && ` · moved from ${shortDate(p.scheduled)} (weekend or holiday)`}
          {basis && ` · ${basis}`}
          {editable && estimate && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {landed ? 'Confirm' : !source?.hourly ? 'Edit' : p.basis === 'hours' ? 'Edit hours' : 'Log hours'}</span>}
        </div>
      </div>
      <span>
        {estimate ? '≈ ' : ''}
        {money(p.amount)}
      </span>
    </>
  );
  return (
    <li>
      {editable ? (
        <button className="rowbtn" onClick={() => ui.open(<PaycheckSheet sourceId={p.sourceId} payday={p.payday} focus={landed ? 'amount' : 'hours'} />)}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}
