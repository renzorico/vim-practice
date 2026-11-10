import { describe, expect, it } from 'vitest';
import { SKILLS, skillSlug } from './catalog.js';

describe('skillSlug', () => {
  it('makes ids safe for level ids and case-insensitive file systems', () => {
    expect(skillSlug('motion.word')).toBe('motion-word');
    expect(skillSlug('motion.WORD')).toBe('motion-word-caps');
    expect(skillSlug('ex.q!')).toBe('ex-q-force');
  });

  it('gives every catalog skill a distinct, case-insensitively unique slug in level-id format', () => {
    const slugs = SKILLS.map((skill) => skillSlug(skill.id));
    expect(new Set(slugs.map((slug) => slug.toLowerCase())).size).toBe(SKILLS.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});
