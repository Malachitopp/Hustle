/**
 * Core tests. They reach the core only through its entry point, pass every time in explicitly
 * and never read the real clock. Times are written with their UTC offset so the machine's own
 * time zone can't affect them.
 */
import {
  apply,
  formatClockTime,
  formatWorkTime,
  initialState,
  view,
  type Action,
  type State,
} from '@/core';

const LONDON = 'Europe/London';
const HOUR = 60 * 60_000;
const MINUTE = 60_000;

/** An instant from an ISO string with an explicit offset. */
const at = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad time in test: ${iso}`);
  return ms;
};

let nextId = 1;
const start = (state: State, when: string, timeZone = LONDON): State =>
  apply(state, { type: 'start', at: at(when), sessionId: `session-${nextId++}`, timeZone });
const pause = (state: State, when: string): State => apply(state, { type: 'pause', at: at(when) });
const resume = (state: State, when: string): State => apply(state, { type: 'resume', at: at(when) });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const seenAt = (state: State, when: string, timeZone = LONDON) => view(state, at(when), timeZone);

describe('before any session', () => {
  it('is idle, with no work today, and invites the first session', () => {
    const v = seenAt(initialState, '2026-09-10T09:00:00+01:00');
    expect(v.session).toEqual({ state: 'idle' });
    expect(v.todayWorkTime).toBe(0);
    expect(v.header).toEqual({
      situation: 'first-session',
      text: 'Welcome. Start a session to plant your first rose.',
    });
  });
});

describe('start', () => {
  it('begins a running session with the id and time zone it was given', () => {
    const state = apply(initialState, {
      type: 'start',
      at: at('2026-09-10T09:00:00+01:00'),
      sessionId: 'abc-123',
      timeZone: 'Europe/London',
    });
    const v = seenAt(state, '2026-09-10T09:00:00+01:00');
    expect(v.session).toEqual({
      state: 'running',
      id: 'abc-123',
      startedAt: at('2026-09-10T09:00:00+01:00'),
      workTime: 0,
    });
    expect(state.record).toHaveLength(0);
  });

  it('counts work time as the session runs', () => {
    const state = start(initialState, '2026-09-10T09:00:00+01:00');
    const v = seenAt(state, '2026-09-10T10:20:00+01:00');
    expect(v.session).toMatchObject({ state: 'running', workTime: 80 * MINUTE });
    expect(v.todayWorkTime).toBe(80 * MINUTE);
  });

  it('is ignored while a session is already running', () => {
    const running = start(initialState, '2026-09-10T09:00:00+01:00');
    const again = start(running, '2026-09-10T09:30:00+01:00');
    expect(again).toBe(running);
  });

  it('never mutates the state it was given', () => {
    const before = JSON.stringify(initialState);
    start(initialState, '2026-09-10T09:00:00+01:00');
    expect(JSON.stringify(initialState)).toBe(before);
  });
});

describe('end', () => {
  it('moves the session into the record with its one running period', () => {
    const state = end(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T15:40:00+01:00');
    expect(seenAt(state, '2026-09-10T15:40:00+01:00').session).toEqual({ state: 'idle' });
    expect(state.record).toEqual([
      {
        id: expect.stringMatching(/^session-\d+$/),
        timeZone: LONDON,
        startedAt: at('2026-09-10T09:00:00+01:00'),
        endedAt: at('2026-09-10T15:40:00+01:00'),
        periods: [{ from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T15:40:00+01:00') }],
        days: [{ date: '2026-09-10', workTime: 6 * HOUR + 40 * MINUTE }],
      },
    ]);
  });

  it('keeps sessions of any length, even a few seconds', () => {
    const state = end(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T09:00:03+01:00');
    expect(state.record).toHaveLength(1);
    expect(state.record[0].periods[0].to - state.record[0].periods[0].from).toBe(3000);
  });

  it('is ignored when no session is running', () => {
    expect(end(initialState, '2026-09-10T09:00:00+01:00')).toBe(initialState);
  });

  it('records a zero-length period if the clock was set back before the end', () => {
    const state = end(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T08:00:00+01:00');
    expect(state.record[0].periods).toEqual([
      { from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T09:00:00+01:00') },
    ]);
    expect(state.record[0].endedAt).toBe(at('2026-09-10T09:00:00+01:00'));
  });

  it('keeps ended sessions in the order they ended', () => {
    let state = end(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    state = end(start(state, '2026-09-10T11:00:00+01:00'), '2026-09-10T12:00:00+01:00');
    expect(state.record.map((s) => s.startedAt)).toEqual([
      at('2026-09-10T09:00:00+01:00'),
      at('2026-09-10T11:00:00+01:00'),
    ]);
  });
});

describe('pause and resume', () => {
  it('freezes the count while paused and says when the session will end by itself', () => {
    const state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    const v = seenAt(state, '2026-09-10T11:00:00+01:00');
    expect(v.session).toEqual({
      state: 'paused',
      id: expect.any(String),
      startedAt: at('2026-09-10T09:00:00+01:00'),
      workTime: HOUR,
      pausedAt: at('2026-09-10T10:00:00+01:00'),
      autoEndsAt: at('2026-09-10T16:00:00+01:00'),
    });
    expect(v.todayWorkTime).toBe(HOUR);
    expect(v.header.text).toBe('You have worked 1h 0m today');
  });

  it('can pause and resume any number of times, counting only the running periods', () => {
    let state = start(initialState, '2026-09-10T09:00:00+01:00');
    state = pause(state, '2026-09-10T10:00:00+01:00');
    state = resume(state, '2026-09-10T10:30:00+01:00');
    state = pause(state, '2026-09-10T12:00:00+01:00');
    state = resume(state, '2026-09-10T12:15:00+01:00');
    expect(seenAt(state, '2026-09-10T13:00:00+01:00').session).toMatchObject({
      state: 'running',
      workTime: 3 * HOUR + 15 * MINUTE,
    });

    state = end(state, '2026-09-10T13:00:00+01:00');
    expect(state.record[0].periods).toEqual([
      { from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T10:00:00+01:00') },
      { from: at('2026-09-10T10:30:00+01:00'), to: at('2026-09-10T12:00:00+01:00') },
      { from: at('2026-09-10T12:15:00+01:00'), to: at('2026-09-10T13:00:00+01:00') },
    ]);
    expect(seenAt(state, '2026-09-10T13:00:00+01:00').todayWorkTime).toBe(3 * HOUR + 15 * MINUTE);
  });

  it('ends a paused session when End is pressed, without adding a running period', () => {
    let state = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    state = end(state, '2026-09-10T11:00:00+01:00');
    expect(state.record[0]).toMatchObject({
      endedAt: at('2026-09-10T11:00:00+01:00'),
      periods: [{ from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T10:00:00+01:00') }],
    });
  });

  it('ignores a pause when nothing is running, and a resume when nothing is paused', () => {
    expect(pause(initialState, '2026-09-10T09:00:00+01:00')).toBe(initialState);
    expect(resume(initialState, '2026-09-10T09:00:00+01:00')).toBe(initialState);
    const running = start(initialState, '2026-09-10T09:00:00+01:00');
    expect(resume(running, '2026-09-10T09:30:00+01:00')).toBe(running);
    const paused = pause(running, '2026-09-10T10:00:00+01:00');
    expect(pause(paused, '2026-09-10T10:30:00+01:00')).toBe(paused);
  });

  it('never starts a running period before the pause if the clock was set back', () => {
    const paused = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    const resumed = resume(paused, '2026-09-10T09:30:00+01:00');
    expect(seenAt(resumed, '2026-09-10T10:30:00+01:00').session).toMatchObject({
      state: 'running',
      workTime: HOUR + 30 * MINUTE,
    });
  });
});

describe('auto-end', () => {
  const pausedAtTen = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');

  it('ends a session paused for 6 hours, at the pause time plus 6 hours, not a minute before', () => {
    expect(seenAt(pausedAtTen, '2026-09-10T15:59:00+01:00').session).toMatchObject({ state: 'paused' });
    const v = seenAt(pausedAtTen, '2026-09-10T16:00:00+01:00');
    expect(v.session).toEqual({ state: 'idle' });
    expect(v.todayWorkTime).toBe(HOUR);
    expect(v.header.text).toBe('Your rose has died. Start working to plant a new one.');
  });

  it('puts the auto-ended session in the record at the next action', () => {
    const state = start(pausedAtTen, '2026-09-10T17:00:00+01:00');
    expect(state.record).toHaveLength(1);
    expect(state.record[0]).toMatchObject({
      endedAt: at('2026-09-10T16:00:00+01:00'),
      periods: [{ from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T10:00:00+01:00') }],
    });
    expect(seenAt(state, '2026-09-10T17:00:00+01:00').session).toMatchObject({ state: 'running', workTime: 0 });
  });

  it('treats End pressed after the auto-end as already done', () => {
    const state = end(pausedAtTen, '2026-09-10T20:00:00+01:00');
    expect(state.current).toBeNull();
    expect(state.record).toHaveLength(1);
    expect(state.record[0].endedAt).toBe(at('2026-09-10T16:00:00+01:00'));
  });

  it('keeps the session when it is resumed just before the auto-end', () => {
    const state = resume(pausedAtTen, '2026-09-10T15:59:00+01:00');
    expect(seenAt(state, '2026-09-10T17:00:00+01:00').session).toMatchObject({
      state: 'running',
      workTime: 2 * HOUR + MINUTE,
    });
  });

  it('is noticed long after it happened', () => {
    const v = seenAt(pausedAtTen, '2026-09-12T09:00:00+01:00');
    expect(v.session).toEqual({ state: 'idle' });
    expect(v.header).toEqual({
      situation: 'new-day',
      text: 'New day. Start a session to plant a new rose.',
    });
    expect(seenAt(pausedAtTen, '2026-09-10T23:00:00+01:00').todayWorkTime).toBe(HOUR);
  });

  it('never ends a running session, however long it runs', () => {
    const state = start(initialState, '2026-09-10T00:00:00+01:00');
    expect(seenAt(state, '2026-09-11T12:00:00+01:00').session).toMatchObject({
      state: 'running',
      workTime: 36 * HOUR,
    });
  });
});

describe('clock times', () => {
  it('are formatted as a 12-hour time of day in the given zone', () => {
    expect(formatClockTime(at('2026-09-10T23:40:00+01:00'), LONDON)).toBe('11:40pm');
    expect(formatClockTime(at('2026-09-11T00:40:00+01:00'), LONDON)).toBe('12:40am');
    expect(formatClockTime(at('2026-09-10T12:05:00+01:00'), LONDON)).toBe('12:05pm');
    expect(formatClockTime(at('2026-09-10T09:07:00+01:00'), LONDON)).toBe('9:07am');
    expect(formatClockTime(at('2026-09-10T09:07:00+01:00'), 'Asia/Tokyo')).toBe('5:07pm');
  });
});

describe('work time', () => {
  it('is formatted as hours and minutes', () => {
    expect(formatWorkTime(0)).toBe('0m');
    expect(formatWorkTime(45 * MINUTE)).toBe('45m');
    expect(formatWorkTime(HOUR)).toBe('1h 0m');
    expect(formatWorkTime(6 * HOUR + 40 * MINUTE)).toBe('6h 40m');
    expect(formatWorkTime(26 * HOUR + 5 * MINUTE)).toBe('26h 5m');
  });

  it('shows whole minutes only, rounding down', () => {
    expect(formatWorkTime(2 * HOUR + 14 * MINUTE + 59_000)).toBe('2h 14m');
  });
});

describe("today's work time", () => {
  it("adds up every session on today's date, including the one running", () => {
    let state = end(start(initialState, '2026-09-10T08:00:00+01:00'), '2026-09-10T09:00:00+01:00');
    state = end(start(state, '2026-09-10T10:00:00+01:00'), '2026-09-10T10:30:00+01:00');
    state = start(state, '2026-09-10T12:00:00+01:00');
    const v = seenAt(state, '2026-09-10T12:44:00+01:00');
    expect(v.todayWorkTime).toBe(HOUR + 30 * MINUTE + 44 * MINUTE);
    expect(v.header).toEqual({
      situation: 'worked-today',
      text: 'You have worked 2h 14m today',
    });
  });

  it('congratulates once today reaches 5 hours of work, and not a minute before', () => {
    const state = start(initialState, '2026-09-10T08:00:00+01:00');
    expect(seenAt(state, '2026-09-10T12:59:00+01:00').header.text).toBe('You have worked 4h 59m today');
    expect(seenAt(state, '2026-09-10T13:00:00+01:00').header.text).toBe(
      'Congratulations, you have worked 5h 0m today',
    );
  });

  it('counts every session on the day toward the 5 hours', () => {
    let state = end(start(initialState, '2026-09-10T06:00:00+01:00'), '2026-09-10T09:00:00+01:00');
    state = start(state, '2026-09-10T10:00:00+01:00');
    expect(seenAt(state, '2026-09-10T12:30:00+01:00').header.text).toBe(
      'Congratulations, you have worked 5h 30m today',
    );
  });

  it('leaves out work from earlier days', () => {
    const state = end(start(initialState, '2026-09-09T08:00:00+01:00'), '2026-09-09T12:00:00+01:00');
    const v = seenAt(state, '2026-09-10T09:00:00+01:00');
    expect(v.todayWorkTime).toBe(0);
    expect(v.header).toEqual({
      situation: 'new-day',
      text: 'New day. Start a session to plant a new rose.',
    });
  });

  it('shows the count from the moment a session starts, even at 0m', () => {
    const state = start(initialState, '2026-09-10T09:00:00+01:00');
    const v = seenAt(state, '2026-09-10T09:00:20+01:00');
    expect(v.header.text).toBe('You have worked 0m today');
  });

  it('counts only the part of a session that falls on today', () => {
    // The calendar ticket covers crossing midnight in full; this pins down what "today" means.
    const state = start(initialState, '2026-09-09T23:00:00+01:00');
    const v = seenAt(state, '2026-09-10T01:30:00+01:00');
    expect(v.session).toMatchObject({ workTime: 2 * HOUR + 30 * MINUTE });
    expect(v.todayWorkTime).toBe(HOUR + 30 * MINUTE);
  });

  it("uses the phone's date for today and the session's own zone for its days", () => {
    // A session in Tokyo, viewed from London: it ran on 10 September in Tokyo,
    // which is still the evening of 9 September in London.
    const state = end(
      start(initialState, '2026-09-10T02:00:00+09:00', 'Asia/Tokyo'),
      '2026-09-10T04:00:00+09:00',
    );
    expect(seenAt(state, '2026-09-09T22:00:00+01:00', LONDON).todayWorkTime).toBe(0);
    expect(seenAt(state, '2026-09-10T08:00:00+01:00', LONDON).todayWorkTime).toBe(2 * HOUR);
  });

  it('handles the night the UK clocks go back', () => {
    // 25 October 2026: 02:00 BST becomes 01:00 GMT, so the day has 25 hours.
    const state = start(initialState, '2026-10-25T00:30:00+01:00');
    const v = seenAt(state, '2026-10-25T02:30:00+00:00');
    expect(v.session).toMatchObject({ workTime: 3 * HOUR });
    expect(v.todayWorkTime).toBe(3 * HOUR);
  });
});

describe('the stored history', () => {
  it('survives a trip through JSON unchanged, so the phone can save it', () => {
    let state = end(start(initialState, '2026-09-10T08:00:00+01:00'), '2026-09-10T09:00:00+01:00');
    state = start(state, '2026-09-10T10:00:00+01:00');
    const restored = JSON.parse(JSON.stringify(state)) as State;
    expect(restored).toEqual(state);
    expect(seenAt(restored, '2026-09-10T10:30:00+01:00')).toEqual(seenAt(state, '2026-09-10T10:30:00+01:00'));
  });

  it('keeps a running session counting across a restart', () => {
    const state = start(initialState, '2026-09-10T09:00:00+01:00');
    const restored = JSON.parse(JSON.stringify(state)) as State;
    const later: Action = { type: 'end', at: at('2026-09-10T11:00:00+01:00') };
    expect(seenAt(restored, '2026-09-10T10:00:00+01:00').session).toMatchObject({ workTime: HOUR });
    expect(apply(restored, later).record[0].periods).toEqual([
      { from: at('2026-09-10T09:00:00+01:00'), to: at('2026-09-10T11:00:00+01:00') },
    ]);
  });
});
