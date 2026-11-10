interface TitleScreenProps {
  readonly onStart: () => void;
  /** The Prologue skip test. */
  readonly onSkipTest: () => void;
}

export function TitleScreen({ onStart, onSkipTest }: TitleScreenProps) {
  return (
    <main className="ui title-screen">
      <h1 className="title-screen__wordmark">ESCAPE</h1>
      <p className="ui-quote">You are trapped inside a text editor. The only way out is to learn it.</p>
      <div className="title-screen__actions">
        <button type="button" className="ui-btn ui-btn--primary" onClick={onStart}>
          Start
        </button>
        <button type="button" className="ui-btn" onClick={onSkipTest}>
          I know how to quit Vim
        </button>
      </div>
    </main>
  );
}
