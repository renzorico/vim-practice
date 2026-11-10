import { formatKeyCount, powerPercent } from './labels.js';

interface HeaderProps {
  readonly location: string;
  readonly keysCollected: number;
  readonly keysTotal: number;
  readonly power: number;
  readonly maxPower: number;
}

export function Header({ location, keysCollected, keysTotal, power, maxPower }: HeaderProps) {
  const percent = powerPercent(power, maxPower);
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__wordmark">ESCAPE</span>
        <span className="ui-muted">{location}</span>
      </div>
      <div className="header__stats">
        <span aria-label="Keys collected">keys {formatKeyCount(keysCollected, keysTotal)}</span>
        <span className="power" role="meter" aria-label="Power" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          power
          <span className="power__track">
            <span className="power__fill" style={{ width: `${percent}%` }} />
          </span>
          {percent}%
        </span>
      </div>
    </header>
  );
}
