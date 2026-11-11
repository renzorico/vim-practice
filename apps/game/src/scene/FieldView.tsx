import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { FieldScene, type FieldFrame } from './FieldScene.js';
import { BACKGROUND } from './palette.js';

/** React owns input and simulation. This component only presents snapshots. */
export function FieldView(props: FieldFrame): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FieldScene | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!host.current) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const field = new FieldScene(latest.current, media.matches);
    scene.current = field;
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: host.current, backgroundColor: BACKGROUND,
      pixelArt: true, roundPixels: true, antialias: false,
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.RESIZE, width: host.current.clientWidth, height: host.current.clientHeight },
      scene: field,
    });
    const changeMotion = (): void => field.setReducedMotion(media.matches);
    media.addEventListener('change', changeMotion);
    const resize = new ResizeObserver(() => {
      if (host.current) game.scale.resize(host.current.clientWidth, host.current.clientHeight);
    });
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      media.removeEventListener('change', changeMotion);
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  // Run after every parent render: even a partial command finishes the prior animation.
  useEffect(() => { scene.current?.present(props); });

  return <div ref={host} role="img" aria-label={`${props.stage.title}. ${props.stage.goalText}`}
    style={{ width: '100%', height: '100%', minHeight: 240, overflow: 'hidden' }} />;
}
