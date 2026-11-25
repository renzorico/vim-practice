import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { FieldScene, type FieldFrame } from './FieldScene.js';
import { FieldLabels, type LabelCamera } from './FieldLabels.js';
import type { FieldSign } from './labelLayout.js';
import { BACKGROUND } from './palette.js';

const NO_SIGNS: readonly FieldSign[] = [];

/** React owns input and simulation. This component only presents snapshots. */
export function FieldView({ signs = NO_SIGNS, ...props }: FieldFrame & { readonly signs?: readonly FieldSign[] }): JSX.Element {
  const camera = useRef<LabelCamera>({ x: 0, y: 0, zoom: 1, follow: null });
  const [view, setView] = useState({ width: 0, height: 0 });
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<FieldScene | null>(null);
  const latest = useRef(props);
  // A label that names the target is the marker: an arrow under it would be one thing too many.
  const named = props.objectiveTarget ? signs.find(sign => sign.line === props.objectiveTarget?.line
    && props.objectiveTarget.col >= sign.from && props.objectiveTarget.col <= sign.to) : undefined;
  const shown: FieldFrame = named ? { ...props, hideArrow: true } : props;
  latest.current = shown;

  useEffect(() => {
    if (!host.current) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const field = new FieldScene(latest.current, media.matches, (x, y, zoom) => {
      Object.assign(camera.current, { x, y, zoom });
      camera.current.follow?.();
    });
    scene.current = field;
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: host.current, backgroundColor: BACKGROUND,
      pixelArt: true, roundPixels: true, antialias: false,
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE, width: host.current.clientWidth, height: host.current.clientHeight },
      scene: field,
    });
    // Keep the canvas's intrinsic size out of its host's layout measurements.
    Object.assign(game.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const changeMotion = (): void => field.setReducedMotion(media.matches);
    media.addEventListener('change', changeMotion);
    const resize = new ResizeObserver(() => {
      if (!host.current) return;
      const { clientWidth: width, clientHeight: height } = host.current;
      game.scale.resize(width, height);
      setView(last => last.width === width && last.height === height ? last : { width, height });
    });
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      media.removeEventListener('change', changeMotion);
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  // The scene decides whether snapshots continue, interrupt, or restore playback.
  useEffect(() => {
    // Layout reads only where the yank slot exists (they force a reflow on every render).
    const yanks = props.stage.id === 'warehouse';
    const slot = yanks ? document.querySelector('[data-yank-slot]')?.getBoundingClientRect() : undefined;
    const field = yanks ? host.current?.getBoundingClientRect() : undefined;
    scene.current?.present({ ...shown, ...(slot && field ? {
      registerTarget: { x: slot.right - field.left - 20, y: slot.top - field.top + slot.height / 2 },
    } : {}) });
  });

  return <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 'min(360px, 60svh)', overflow: 'hidden' }}>
    <div ref={host} role="img" aria-label={`${props.stage.title}. ${props.stage.goalText}`} style={{ position: 'absolute', inset: 0 }} />
    <FieldLabels frame={props} signs={signs} named={named} view={view} camera={camera.current} />
  </div>;
}
