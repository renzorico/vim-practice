export interface PixelSprite {
  readonly frames: readonly (readonly string[])[];
  readonly palette: Readonly<Record<string, string>>;
}
export const PALETTE: Readonly<Record<string, string>> = {
  '.': 'transparent', k: '#20252b', s: '#dfad80', y: '#fabd2f',
  w: '#f6efd4', g: '#647b65', G: '#344e43', b: '#66788d',
  r: '#ad5544', R: '#713b36', t: '#936a4b', T: '#594332',
  a: '#a9b56d', c: '#74a9b0', C: '#426b80', d: '#1b3030',
};
