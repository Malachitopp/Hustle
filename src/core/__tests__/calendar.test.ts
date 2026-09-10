/**
 * Calendar tests: splitting sessions at midnight, totals for the week, month and year, what a
 * day lists, and how a month is laid out. Like the session tests, they reach the core only
 * through its entry point and write every time with its UTC offset.
 */
import {
  apply,
  formatDate,
  formatMonth,
  formatWorkTimeShort,
  initialState,
  monthOf,
  view,
  type State,
} from '@/core';

const LONDON = 'Europe/London';
const TOKYO = 'Asia/Tokyo';
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
const end = (state: State, when: string): State => apply(state, { type: 'end', at: at(when) });
const seenAt = (state: State, when: string, timeZone = LONDON) => view(state, at(when), timeZone);

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string, timeZone = LONDON): State =>
  end(start(state, from, timeZone), to);

describe('splitting a session at midnight', () => {
  it('puts 2h on each day for a 10pm to 2am session, stored with the session when it ends', () => {
    const state = worked(initialState, '2026-09-10T22:00:00+01:00', '2026-09-11T02:00:00+01:00');
    expect(state.record[0].days).toEqual([
      { date: '2026-09-10', workTime: 2 * HOUR },
      { date: '2026-09-11', workTime: 2 * HOUR },
    ]);
    const { calendar } = seenAt(state, '2026-09-11T09:00:00+01:00');
    expect(calendar.days['2026-09-10']?.workTime).toBe(2 * HOUR);
    expect(calendar.days['2026-09-11']?.workTime).toBe(2 * HOUR);
  });

  it('splits in the zone the session started in, wherever it is looked at from', () => {
    // Started in London at 10pm; by the end the phone is in Tokyo, where it is already the 11th.
    const state = worked(initialState, '2026-09-10T22:00:00+01:00', '2026-09-11T02:00:00+01:00');
    const { calendar } = seenAt(state, '2026-09-11T12:00:00+09:00', TOKYO);
    expect(calendar.days['2026-09-10']?.workTime).toBe(2 * HOUR);
    expect(calendar.days['2026-09-11']?.workTime).toBe(2 * HOUR);
    expect(calendar.totals.week).toBe(4 * HOUR);
  });

  it('counts only the part after midnight as today while a session is still running', () => {
    const state = start(initialState, '2026-09-09T23:00:00+01:00');
    const v = seenAt(state, '2026-09-10T01:30:00+01:00');
    expect(v.todayWorkTime).toBe(HOUR + 30 * MINUTE);
    expect(v.calendar.days['2026-09-09']?.workTime).toBe(HOUR);
    expect(v.calendar.days['2026-09-10']?.workTime).toBe(HOUR + 30 * MINUTE);
    expect(v.calendar.totals.week).toBe(2 * HOUR + 30 * MINUTE);
  });

  it('keeps a session that measured no time on the day it started', () => {
    // The clock was set back between Start and End.
    const state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T08:00:00+01:00');
    expect(state.record[0].days).toEqual([{ date: '2026-09-10', workTime: 0 }]);
    const { calendar } = seenAt(state, '2026-09-10T12:00:00+01:00');
    expect(calendar.days['2026-09-10']?.sessions).toHaveLength(1);
  });

  it('gives every day a share of a session that runs for days', () => {
    const state = worked(initialState, '2026-09-09T22:00:00+01:00', '2026-09-11T02:00:00+01:00');
    expect(state.record[0].days).toEqual([
      { date: '2026-09-09', workTime: 2 * HOUR },
      { date: '2026-09-10', workTime: 24 * HOUR },
      { date: '2026-09-11', workTime: 2 * HOUR },
    ]);
  });
});

describe('clock changes', () => {
  it('totals correctly on the night the UK clocks go forward', () => {
    // 29 March 2026: 01:00 GMT becomes 02:00 BST, so the day has 23 hours.
    const state = worked(initialState, '2026-03-28T23:00:00+00:00', '2026-03-29T04:00:00+01:00');
    expect(state.record[0].days).toEqual([
      { date: '2026-03-28', workTime: HOUR },
      { date: '2026-03-29', workTime: 3 * HOUR },
    ]);
    expect(seenAt(state, '2026-03-29T12:00:00+01:00').calendar.totals.month).toBe(4 * HOUR);
  });

  it('totals correctly on the night the UK clocks go back', () => {
    // 25 October 2026: 02:00 BST becomes 01:00 GMT, so the day has 25 hours.
    const state = worked(initialState, '2026-10-24T23:00:00+01:00', '2026-10-25T02:30:00+00:00');
    expect(state.record[0].days).toEqual([
      { date: '2026-10-24', workTime: HOUR },
      { date: '2026-10-25', workTime: 3 * HOUR + 30 * MINUTE },
    ]);
    expect(seenAt(state, '2026-10-25T12:00:00+00:00').todayWorkTime).toBe(3 * HOUR + 30 * MINUTE);
  });
});

describe('totals', () => {
  it('start the week on Monday', () => {
    // Sunday 6 September 2026 is the last day of its week; Monday 7 September starts the next.
    const sunday = worked(initialState, '2026-09-06T09:00:00+01:00', '2026-09-06T10:00:00+01:00');
    expect(seenAt(sunday, '2026-09-06T20:00:00+01:00').calendar.totals.week).toBe(HOUR);

    const monday = worked(sunday, '2026-09-07T09:00:00+01:00', '2026-09-07T11:00:00+01:00');
    expect(seenAt(monday, '2026-09-07T12:00:00+01:00').calendar.totals.week).toBe(2 * HOUR);

    const nextSunday = worked(monday, '2026-09-13T09:00:00+01:00', '2026-09-13T12:00:00+01:00');
    expect(seenAt(nextSunday, '2026-09-13T20:00:00+01:00').calendar.totals.week).toBe(5 * HOUR);
    expect(seenAt(nextSunday, '2026-09-14T09:00:00+01:00').calendar.totals.week).toBe(0);
  });

  it('cover the calendar month and year that contain today', () => {
    let state = worked(initialState, '2025-12-31T09:00:00+00:00', '2025-12-31T10:00:00+00:00');
    state = worked(state, '2026-08-31T09:00:00+01:00', '2026-08-31T11:00:00+01:00');
    state = worked(state, '2026-09-01T09:00:00+01:00', '2026-09-01T12:00:00+01:00');
    const { totals } = seenAt(state, '2026-09-10T09:00:00+01:00').calendar;
    expect(totals).toEqual({ week: 0, month: 3 * HOUR, year: 5 * HOUR });
    expect(seenAt(state, '2026-09-30T23:00:00+01:00').calendar.totals.month).toBe(3 * HOUR);
    expect(seenAt(state, '2026-10-01T09:00:00+01:00').calendar.totals.month).toBe(0);
  });

  it('include the session in progress', () => {
    const state = start(initialState, '2026-09-10T09:00:00+01:00');
    const { totals } = seenAt(state, '2026-09-10T10:00:00+01:00').calendar;
    expect(totals).toEqual({ week: HOUR, month: HOUR, year: HOUR });
  });

  it("use the phone's zone to decide which week, month and year today is in", () => {
    // 11pm on 30 September in London is already 1 October in Tokyo... but the session's own
    // London date is what the calendar shows, so from Tokyo it belongs to last month.
    const state = worked(initialState, '2026-09-30T21:00:00+01:00', '2026-09-30T23:00:00+01:00');
    expect(seenAt(state, '2026-09-30T23:30:00+01:00', LONDON).calendar.totals.month).toBe(2 * HOUR);
    expect(seenAt(state, '2026-10-01T07:30:00+09:00', TOKYO).calendar.totals.month).toBe(0);
  });
});

describe('a day on the calendar', () => {
  it('lists its sessions with start, end and its share of their work time', () => {
    let state = worked(initialState, '2026-09-10T09:00:00+01:00', '2026-09-10T10:00:00+01:00');
    state = worked(state, '2026-09-10T22:00:00+01:00', '2026-09-11T01:00:00+01:00');
    state = pause(start(state, '2026-09-11T09:00:00+01:00'), '2026-09-11T09:30:00+01:00');
    const { calendar } = seenAt(state, '2026-09-11T10:00:00+01:00');

    expect(calendar.days['2026-09-10']).toEqual({
      date: '2026-09-10',
      workTime: 3 * HOUR,
      sessions: [
        {
          id: expect.any(String),
          timeZone: LONDON,
          startedAt: at('2026-09-10T09:00:00+01:00'),
          endedAt: at('2026-09-10T10:00:00+01:00'),
          status: 'ended',
          workTime: HOUR,
        },
        {
          id: expect.any(String),
          timeZone: LONDON,
          startedAt: at('2026-09-10T22:00:00+01:00'),
          endedAt: at('2026-09-11T01:00:00+01:00'),
          status: 'ended',
          workTime: 2 * HOUR,
        },
      ],
    });
    expect(calendar.days['2026-09-11']).toEqual({
      date: '2026-09-11',
      workTime: HOUR + 30 * MINUTE,
      sessions: [
        {
          id: expect.any(String),
          timeZone: LONDON,
          startedAt: at('2026-09-10T22:00:00+01:00'),
          endedAt: at('2026-09-11T01:00:00+01:00'),
          status: 'ended',
          workTime: HOUR,
        },
        {
          id: expect.any(String),
          timeZone: LONDON,
          startedAt: at('2026-09-11T09:00:00+01:00'),
          endedAt: null,
          status: 'paused',
          workTime: 30 * MINUTE,
        },
      ],
    });
    expect(calendar.days['2026-09-12']).toBeUndefined();
  });

  it('shows a running session as running', () => {
    const state = start(initialState, '2026-09-10T09:00:00+01:00');
    const { calendar } = seenAt(state, '2026-09-10T09:20:00+01:00');
    expect(calendar.days['2026-09-10']?.sessions[0]).toMatchObject({
      status: 'running',
      endedAt: null,
      workTime: 20 * MINUTE,
    });
  });

  it('says which date the calendar starts on, and what today is', () => {
    expect(seenAt(initialState, '2026-09-10T09:00:00+01:00').calendar).toMatchObject({
      today: '2026-09-10',
      firstDate: '2026-09-10',
    });
    const running = start(initialState, '2026-09-08T09:00:00+01:00');
    expect(seenAt(running, '2026-09-10T09:00:00+01:00').calendar.firstDate).toBe('2026-09-08');
    const state = worked(running, '2026-09-10T10:00:00+01:00', '2026-09-10T11:00:00+01:00');
    expect(seenAt(state, '2026-09-11T09:00:00+01:00').calendar).toMatchObject({
      today: '2026-09-11',
      firstDate: '2026-09-08',
    });
  });
});

describe('a month on the calendar', () => {
  it('is laid out in rows of seven starting on Monday', () => {
    const month = monthOf('2026-09-10');
    expect(month.first).toBe('2026-09-01');
    expect(month.title).toBe('September 2026');
    expect(month.weeks).toEqual([
      [null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'],
      ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'],
      ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'],
      ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'],
      ['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null],
    ]);
  });

  it('puts a month that starts on a Sunday at the end of its first row', () => {
    const month = monthOf('2026-02-14');
    expect(month.weeks[0]).toEqual([null, null, null, null, null, null, '2026-02-01']);
    expect(month.weeks).toHaveLength(5);
    expect(month.weeks.flat().filter(Boolean)).toHaveLength(28);
  });

  it('gives February its extra day in a leap year', () => {
    expect(monthOf('2028-02-01').weeks.flat().filter(Boolean)).toHaveLength(29);
  });

  it('knows the months either side, across the turn of the year', () => {
    expect(monthOf('2026-09-10')).toMatchObject({ previous: '2026-08-01', next: '2026-10-01' });
    expect(monthOf('2026-01-15')).toMatchObject({ previous: '2025-12-01', next: '2026-02-01' });
    expect(monthOf('2026-12-31')).toMatchObject({ previous: '2026-11-01', next: '2027-01-01' });
  });
});

describe('formatting', () => {
  it('shortens work time for a calendar cell', () => {
    expect(formatWorkTimeShort(0)).toBe('0m');
    expect(formatWorkTimeShort(45 * MINUTE)).toBe('45m');
    expect(formatWorkTimeShort(2 * HOUR)).toBe('2h');
    expect(formatWorkTimeShort(2 * HOUR + 14 * MINUTE + 59_000)).toBe('2h 14m');
  });

  it('names a date and a month', () => {
    expect(formatDate('2026-09-10')).toBe('Thursday 10 September');
    expect(formatDate('2026-01-01')).toBe('Thursday 1 January');
    expect(formatDate('2026-02-01')).toBe('Sunday 1 February');
    expect(formatMonth('2026-09-10')).toBe('September 2026');
    expect(formatMonth('2025-12-31')).toBe('December 2025');
  });
});
