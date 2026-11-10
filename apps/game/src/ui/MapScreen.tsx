import type { Position } from '@escape/engine';
import { Header } from './Header.js';
import { classifyRow, markerIndex, type MapMarker } from './glyphs.js';
import { KeycapRow } from './Keycap.js';
import { logText, type LogLine } from './labels.js';

export interface MapMove {
  readonly key: string;
  readonly locked: boolean;
}

interface MapScreenProps {
  readonly location: string;
  readonly keysCollected: number;
  readonly keysTotal: number;
  readonly power: number;
  readonly maxPower: number;
  /** Rows to draw, already fogged (visibleLines). */
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly markers: readonly MapMarker[];
  readonly objective: string;
  readonly moves: readonly MapMove[];
  readonly log: readonly LogLine[];
}

interface MapBufferProps {
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly markers: readonly MapMarker[];
}

function MapBuffer({ lines, cursor, markers }: MapBufferProps) {
  const index = markerIndex(markers);
  return (
    <div className="buffer" role="img" aria-label="World map">
      {lines.map((line, lineIndex) => (
        <div className="buffer__line" key={lineIndex}>
          {classifyRow(line, lineIndex, cursor, index).map((run, runIndex) => (
            <span className={`glyph--${run.glyph}`} key={runIndex}>
              {run.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MapScreen(props: MapScreenProps) {
  const locked = new Set(props.moves.filter((move) => move.locked).map((move) => move.key));
  return (
    <div className="ui">
      <Header
        location={props.location}
        keysCollected={props.keysCollected}
        keysTotal={props.keysTotal}
        power={props.power}
        maxPower={props.maxPower}
      />
      <div className="map-layout">
        <MapBuffer lines={props.lines} cursor={props.cursor} markers={props.markers} />
        <aside className="side">
          <section className="ui-panel side__section">
            <h2 className="ui-label">Objective</h2>
            <p>{props.objective}</p>
          </section>
          <section className="ui-panel side__section">
            <h2 className="ui-label">Your moves</h2>
            <KeycapRow keys={props.moves.map((move) => move.key)} locked={locked} />
          </section>
          <section className="ui-panel side__section">
            <h2 className="ui-label">Log</h2>
            <ul>
              {props.log.map((line, lineIndex) => (
                <li key={lineIndex} className={`log__line--${line.speaker}`}>
                  {logText(line)}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
