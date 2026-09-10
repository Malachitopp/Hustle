/**
 * Notification tests: the schedule the phone is given, if nothing else happens. Like the other
 * core tests they reach the core only through its entry point, pass every time in explicitly
 * and write each one with its UTC offset.
 */
import { apply, initialState, view, type NotificationSwitches, type ScheduledNotification, type State } from '@/core';

const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';

/** An instant from an ISO string with an explicit offset. */
const at = (iso: string): number => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Bad time in test: ${iso}`);
  return ms;
};

let nextId = 1;
const start = (state: State, when: string): State =>
  apply(state, { type: 'start', at: at(when), sessionId: `session-${nextId++}`, timeZone: LONDON });
const pause = (state: State, when: string): State => apply(state, { type: 'pause', at: at(when) });
const resume = (state: State, when: string): State => apply(state, { type: 'resume', at: at(when) });
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const switched = (state: State, switches: Partial<NotificationSwitches>): State =>
  apply(state, { type: 'set-notification-switches', at: at('2026-09-01T09:00:00+01:00'), switches });
const scheduleAt = (state: State, when: string, timeZone = LONDON): ScheduledNotification[] =>
  view(state, at(when), timeZone).notifications;

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** An hour of work on the morning of `date`, on top of `state`. */
const workedOn = (state: State, date: string): State =>
  worked(state, `${date}T09:00:00+01:00`, `${date}T10:00:00+01:00`);

const PAUSE_WARNING = 'Your session ends in 1 hour and your rose will die. Resume to save it.';
const AUTO_END = 'Your session ended automatically. Your rose has died.';
const streakText = (days: number) => `Your ${days}-day streak ends at midnight. Start a session to keep it.`;

describe('the pause warning and the auto-end notice', () => {
  // Only the pause notifications are on, so a day's work cannot add a streak reminder.
  const base = switched(initialState, { streakReminder: false });

  it('are due 5 and 6 hours into a pause', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T11:00:00+01:00')).toEqual([
      { kind: 'pause-warning', at: at('2026-09-10T16:00:00+01:00'), text: PAUSE_WARNING },
      { kind: 'auto-end', at: at('2026-09-10T17:00:00+01:00'), text: AUTO_END },
    ]);
  });

  it('count from the latest pause', () => {
    let state = start(base, '2026-09-10T09:00:00+01:00');
    state = pause(state, '2026-09-10T10:00:00+01:00');
    state = resume(state, '2026-09-10T10:30:00+01:00');
    state = pause(state, '2026-09-10T12:00:00+01:00');
    expect(scheduleAt(state, '2026-09-10T12:00:00+01:00').map((n) => n.at)).toEqual([
      at('2026-09-10T17:00:00+01:00'),
      at('2026-09-10T18:00:00+01:00'),
    ]);
  });

  it('are not due while a session is running', () => {
    expect(scheduleAt(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T09:00:00+01:00')).toEqual([]);
  });

  it('leave only the notice once the warning has passed', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T16:00:00+01:00')).toEqual([
      { kind: 'auto-end', at: at('2026-09-10T17:00:00+01:00'), text: AUTO_END },
    ]);
  });

  it('are gone once the session has auto-ended', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T17:00:00+01:00')).toEqual([]);
  });

  it('are cancelled by resuming', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    const resumed = resume(paused, '2026-09-10T12:00:00+01:00');
    expect(scheduleAt(resumed, '2026-09-10T12:00:00+01:00')).toEqual([]);
  });

  it('are cancelled by End', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    const ended = end(paused, '2026-09-10T12:00:00+01:00');
    expect(scheduleAt(ended, '2026-09-10T12:00:00+01:00')).toEqual([]);
  });
});

describe('the streak reminder', () => {
  // Only the streak reminder is on, so a pause cannot add its own notifications.
  const base = switched(initialState, { pauseWarnings: false });

  it('is not due when there has never been any work', () => {
    expect(scheduleAt(base, '2026-09-10T09:00:00+01:00')).toEqual([]);
  });

  it('is due at 9pm today when there is a streak and no work yet today', () => {
    const state = workedOn(base, '2026-09-09');
    expect(scheduleAt(state, '2026-09-10T09:00:00+01:00')).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-10T21:00:00+01:00'), text: streakText(1) },
    ]);
  });

  it('names the length of the streak', () => {
    const state = workedOn(workedOn(workedOn(base, '2026-09-07'), '2026-09-08'), '2026-09-09');
    expect(scheduleAt(state, '2026-09-10T09:00:00+01:00')[0].text).toBe(
      'Your 3-day streak ends at midnight. Start a session to keep it.',
    );
  });

  it('moves to 9pm tomorrow once today has work, counting today', () => {
    const state = workedOn(workedOn(base, '2026-09-09'), '2026-09-10');
    expect(scheduleAt(state, '2026-09-10T12:00:00+01:00')).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-11T21:00:00+01:00'), text: streakText(2) },
    ]);
  });

  it('is due tomorrow after the first ever session, which starts a streak of 1', () => {
    const state = worked(base, '2026-09-10T09:00:00+01:00', '2026-09-10T09:02:00+01:00');
    expect(scheduleAt(state, '2026-09-10T09:02:00+01:00')).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-11T21:00:00+01:00'), text: streakText(1) },
    ]);
  });

  it('is not due while a session is running', () => {
    const running = start(workedOn(base, '2026-09-09'), '2026-09-10T09:00:00+01:00');
    expect(scheduleAt(running, '2026-09-10T09:00:00+01:00')).toEqual([]);
    expect(scheduleAt(running, '2026-09-10T12:00:00+01:00')).toEqual([]);
  });

  it('is due tomorrow while a session is paused, since the pause counts as work today', () => {
    const paused = pause(start(workedOn(base, '2026-09-09'), '2026-09-10T09:00:00+01:00'), '2026-09-10T10:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T10:00:00+01:00')).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-11T21:00:00+01:00'), text: streakText(2) },
    ]);
  });

  it('is gone once 9pm has passed', () => {
    const state = workedOn(base, '2026-09-09');
    expect(scheduleAt(state, '2026-09-10T20:59:00+01:00')).toHaveLength(1);
    expect(scheduleAt(state, '2026-09-10T21:00:00+01:00')).toEqual([]);
    expect(scheduleAt(state, '2026-09-10T23:00:00+01:00')).toEqual([]);
  });

  it('is not due once a whole day has passed with no work, because the streak is gone', () => {
    const state = workedOn(base, '2026-09-08');
    expect(scheduleAt(state, '2026-09-10T09:00:00+01:00')).toEqual([]);
  });

  it("is at 9pm in the phone's zone", () => {
    const state = workedOn(base, '2026-09-09');
    expect(scheduleAt(state, '2026-09-10T09:00:00+09:00', TOKYO)).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-10T21:00:00+09:00'), text: streakText(1) },
    ]);
  });

  it('is at 9pm on the day the clocks go back', () => {
    // London leaves summer time at 2am on 25 October 2026.
    const state = workedOn(base, '2026-10-24');
    expect(scheduleAt(state, '2026-10-25T09:00:00+00:00').map((n) => n.at)).toEqual([
      at('2026-10-25T21:00:00+00:00'),
    ]);
  });

  it('is at 9pm on the day the clocks go forward', () => {
    // London enters summer time at 1am on 29 March 2026.
    const state = workedOn(base, '2026-03-28');
    expect(scheduleAt(state, '2026-03-29T09:00:00+01:00').map((n) => n.at)).toEqual([
      at('2026-03-29T21:00:00+01:00'),
    ]);
  });
});

describe('quiet hours', () => {
  const base = switched(initialState, { streakReminder: false });

  it('drop anything due at 10pm or later', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T17:00:00+01:00');
    // The warning would be at 10pm and the notice at 11pm.
    expect(scheduleAt(paused, '2026-09-10T17:00:00+01:00')).toEqual([]);
  });

  it('keep what is due before 10pm', () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T16:59:00+01:00');
    // The warning is at 9:59pm, the notice at 10:59pm.
    expect(scheduleAt(paused, '2026-09-10T16:59:00+01:00')).toEqual([
      { kind: 'pause-warning', at: at('2026-09-10T21:59:00+01:00'), text: PAUSE_WARNING },
    ]);
  });

  it('drop anything due before 8am', () => {
    const paused = pause(start(base, '2026-09-10T01:00:00+01:00'), '2026-09-10T02:30:00+01:00');
    // The warning would be at 7:30am; the notice at 8:30am gets through.
    expect(scheduleAt(paused, '2026-09-10T02:30:00+01:00')).toEqual([
      { kind: 'auto-end', at: at('2026-09-10T08:30:00+01:00'), text: AUTO_END },
    ]);
  });

  it('end at 8am exactly', () => {
    const paused = pause(start(base, '2026-09-10T01:00:00+01:00'), '2026-09-10T03:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T03:00:00+01:00').map((n) => n.at)).toEqual([
      at('2026-09-10T08:00:00+01:00'),
      at('2026-09-10T09:00:00+01:00'),
    ]);
  });

  it("are the phone's own 10pm to 8am", () => {
    const paused = pause(start(base, '2026-09-10T09:00:00+01:00'), '2026-09-10T12:00:00+01:00');
    // 5pm and 6pm in London are 1am and 2am in Tokyo.
    expect(scheduleAt(paused, '2026-09-10T12:00:00+01:00', LONDON)).toHaveLength(2);
    expect(scheduleAt(paused, '2026-09-10T12:00:00+01:00', TOKYO)).toEqual([]);
  });
});

describe('the Settings switches', () => {
  /** Paused at 11am with a streak from yesterday: all three notifications are in play. */
  const paused = pause(start(workedOn(initialState, '2026-09-09'), '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
  const kinds = (state: State) => scheduleAt(state, '2026-09-10T11:00:00+01:00').map((n) => n.kind);

  it('both start on, so everything is scheduled', () => {
    expect(initialState.notificationSwitches).toEqual({ pauseWarnings: true, streakReminder: true });
    expect(kinds(paused)).toEqual(['pause-warning', 'auto-end', 'streak-reminder']);
  });

  it('Pause warnings off takes the warning and the notice off the schedule', () => {
    expect(kinds(switched(paused, { pauseWarnings: false }))).toEqual(['streak-reminder']);
  });

  it('Streak reminder off takes the reminder off the schedule', () => {
    expect(kinds(switched(paused, { streakReminder: false }))).toEqual(['pause-warning', 'auto-end']);
  });

  it('both off means nothing is scheduled', () => {
    expect(kinds(switched(paused, { pauseWarnings: false, streakReminder: false }))).toEqual([]);
  });

  it('can be turned back on', () => {
    const off = switched(paused, { pauseWarnings: false, streakReminder: false });
    expect(kinds(switched(off, { pauseWarnings: true, streakReminder: true }))).toHaveLength(3);
  });

  it('leave a switch not named as it is', () => {
    const state = switched(initialState, { pauseWarnings: false });
    expect(state.notificationSwitches).toEqual({ pauseWarnings: false, streakReminder: true });
  });

  it('change nothing when set to where they already are', () => {
    expect(switched(initialState, { pauseWarnings: true })).toBe(initialState);
    expect(switched(initialState, {})).toBe(initialState);
  });
});

describe('the schedule', () => {
  it('is in time order', () => {
    const paused = pause(start(workedOn(initialState, '2026-09-09'), '2026-09-10T09:00:00+01:00'), '2026-09-10T14:00:00+01:00');
    expect(scheduleAt(paused, '2026-09-10T14:00:00+01:00')).toEqual([
      { kind: 'pause-warning', at: at('2026-09-10T19:00:00+01:00'), text: PAUSE_WARNING },
      { kind: 'auto-end', at: at('2026-09-10T20:00:00+01:00'), text: AUTO_END },
      { kind: 'streak-reminder', at: at('2026-09-11T21:00:00+01:00'), text: streakText(2) },
    ]);
  });

  it("holds nothing about the session after End but tomorrow's streak reminder", () => {
    const paused = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    const ended = end(paused, '2026-09-10T12:00:00+01:00');
    expect(scheduleAt(ended, '2026-09-10T12:00:00+01:00')).toEqual([
      { kind: 'streak-reminder', at: at('2026-09-11T21:00:00+01:00'), text: streakText(1) },
    ]);
  });

  it('is never stored', () => {
    const paused = pause(start(initialState, '2026-09-10T09:00:00+01:00'), '2026-09-10T11:00:00+01:00');
    expect(JSON.stringify(paused)).not.toContain(PAUSE_WARNING);
    expect(JSON.stringify(paused)).not.toContain('pause-warning');
  });
});
