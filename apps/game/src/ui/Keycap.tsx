interface KeycapProps {
  readonly label: string;
  readonly locked?: boolean;
  /** The newly taught key: text in the `--you` colour. */
  readonly isNew?: boolean;
  readonly large?: boolean;
}

interface KeycapFlags {
  readonly locked: boolean;
  readonly isNew: boolean;
  readonly large: boolean;
}

export function keycapClass({ locked, isNew, large }: KeycapFlags): string {
  const classes = ['keycap'];
  if (locked) classes.push('keycap--locked');
  if (isNew && !locked) classes.push('keycap--new');
  if (large) classes.push('keycap--large');
  return classes.join(' ');
}

export function Keycap({ label, locked = false, isNew = false, large = false }: KeycapProps) {
  return (
    <kbd className={keycapClass({ locked, isNew, large })} title={locked ? 'Locked' : undefined}>
      {label}
    </kbd>
  );
}

interface KeycapRowProps {
  readonly keys: readonly string[];
  /** Keys that are not available yet: drawn dashed. */
  readonly locked?: ReadonlySet<string>;
}

export function KeycapRow({ keys, locked }: KeycapRowProps) {
  return (
    <div className="keycaps">
      {keys.map((key) => (
        <Keycap key={key} label={key} locked={locked?.has(key) ?? false} />
      ))}
    </div>
  );
}
