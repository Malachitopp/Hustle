import { isUnlocked } from '@/entitlements';

describe('entitlements', () => {
  it('reports every feature as free', () => {
    expect(isUnlocked('anything')).toBe(true);
  });
});
