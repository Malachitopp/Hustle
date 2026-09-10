import { defaultSettings, parseSettings } from '@/settings';

describe('settings read back from the phone', () => {
  it('keep a recognised petal colour', () => {
    expect(parseSettings({ petalColour: 'violet' })).toEqual({ petalColour: 'violet' });
  });

  it('fall back to red for a colour the app does not know', () => {
    expect(parseSettings({ petalColour: 'mauve' })).toEqual({ petalColour: 'red' });
    expect(parseSettings({ petalColour: 7 })).toEqual({ petalColour: 'red' });
  });

  it('fall back to the defaults when nothing usable was saved', () => {
    expect(parseSettings({})).toEqual(defaultSettings);
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings('red')).toEqual(defaultSettings);
    expect(defaultSettings).toEqual({ petalColour: 'red' });
  });

  it('ignore settings they do not know, so a newer copy still reads', () => {
    expect(parseSettings({ petalColour: 'blue', displayName: 'Mal' })).toEqual({ petalColour: 'blue' });
  });
});
