/**
 * Restore tests: how the account's sessions, downloaded on a new phone or after a reinstall, join
 * the record, and that the rose, streak and totals come out the same as on the phone that
 * recorded them. Like the other core tests they reach the core only through its entry point,
 * pass every time in explicitly and write each one with its UTC offset.
 */
import { apply, initialState, view, type EndedSession, type State } from '@/core';

const LONDON = 'Europe/London';
const HOUR = 60 * 60_000;

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
const signIn = (state: State, when: string, userId = 'user-1'): State =>
  apply(state, { type: 'sign-in', at: at(when), userId, provider: 'apple' });
const signOut = (state: State, when: string): State => apply(state, { type: 'sign-out', at: at(when) });
const confirm = (state: State, when: string, ...sessionIds: string[]): State =>
  apply(state, { type: 'confirm-uploaded', at: at(when), sessionIds });
const restore = (state: State, when: string, sessions: EndedSession[], userId = 'user-1'): State =>
  apply(state, { type: 'restore', at: at(when), userId, sessions, goals: [], deletedGoalIds: [], settings: null });
const addDownloaded = (state: State, when: string, sessions: EndedSession[], userId = 'user-1'): State =>
  apply(state, { type: 'add-downloaded', at: at(when), userId, sessions });
const seenAt = (state: State, when: string) => view(state, at(when), LONDON);

/** An ended session from `from` to `to` on top of `state`. */
const worked = (state: State, from: string, to: string): State => end(start(state, from), to);

/** An hour of work on the morning of `date`, on top of `state`. */
const workedOn = (state: State, date: string): State =>
  worked(state, `${date}T09:00:00+01:00`, `${date}T10:00:00+01:00`);

const ids = (state: State): string[] => state.record.map((session) => session.id);
const uploadsAt = (state: State, when: string): string[] => seenAt(state, when).uploads.map((session) => session.id);

/** What the account holds of another phone's record, as it comes off the wire: a copy. */
const download = (phone: State): EndedSession[] => JSON.parse(JSON.stringify(phone.record)) as EndedSession[];

const T0 = '2026-09-10T08:00:00+01:00';

describe('a sign-in', () => {
  it("wants the account's record restored until the download has been merged in", () => {
    expect(seenAt(initialState, T0).restoreWanted).toBe(false);
    const signedIn = signIn(initialState, T0);
    expect(seenAt(signedIn, T0).restoreWanted).toBe(true);
    const restored = restore(signedIn, T0, []);
    expect(seenAt(restored, T0).restoreWanted).toBe(false);
    expect(restored.record).toEqual([]);
  });

  it('as the same account again keeps the restore done; as another account wants a new one', () => {
    const restored = restore(signIn(initialState, T0), T0, []);
    expect(signIn(restored, '2026-09-10T09:00:00+01:00')).toBe(restored);
    const other = signIn(restored, '2026-09-10T09:00:00+01:00', 'user-2');
    expect(seenAt(other, '2026-09-10T09:00:00+01:00').restoreWanted).toBe(true);
  });

  it('after a sign-out wants a restore again', () => {
    let state = restore(signIn(initialState, T0), T0, []);
    state = signOut(state, '2026-09-10T09:00:00+01:00');
    expect(seenAt(state, '2026-09-10T09:00:00+01:00').restoreWanted).toBe(false);
    state = signIn(state, '2026-09-10T10:00:00+01:00');
    expect(seenAt(state, '2026-09-10T10:00:00+01:00').restoreWanted).toBe(true);
  });
});

describe('merging downloaded sessions', () => {
  it('combines local and downloaded sessions by id, oldest first, without doubling', () => {
    // This phone backed up a session on the 10th, then recorded one on the 12th that has not
    // uploaded yet. Meanwhile another phone on the same account recorded one on the 11th.
    let phone = signIn(initialState, T0);
    phone = workedOn(phone, '2026-09-10');
    const [first] = ids(phone);
    phone = confirm(phone, '2026-09-10T10:00:01+01:00', first);
    const other = workedOn(initialState, '2026-09-11');
    const account = [...download(phone), ...download(other)];
    phone = workedOn(phone, '2026-09-12');
    const [, third] = ids(phone);

    const NOW = '2026-09-12T12:00:00+01:00';
    const merged = restore(phone, NOW, account);
    expect(ids(merged)).toEqual([first, ...ids(other), third]);
    // A session the phone already had is untouched, not replaced by its downloaded copy.
    expect(merged.record[0]).toBe(phone.record[0]);
    // Downloaded sessions never queue for upload: the account has them already.
    expect(uploadsAt(merged, NOW)).toEqual([third]);
    expect(seenAt(merged, NOW).restoreWanted).toBe(false);
  });

  it('takes a downloaded session off the upload queue, since the account plainly has it', () => {
    // The upload went through but its confirmation never arrived, so the session is still queued.
    let phone = signIn(initialState, T0);
    phone = workedOn(phone, '2026-09-10');
    const NOW = '2026-09-10T12:00:00+01:00';
    expect(uploadsAt(phone, NOW)).toEqual(ids(phone));

    const merged = addDownloaded(phone, NOW, download(phone));
    expect(uploadsAt(merged, NOW)).toEqual([]);
    expect(merged.record).toEqual(phone.record);
  });

  it('changes nothing when the download holds nothing the phone lacks', () => {
    let state = workedOn(initialState, '2026-09-10');
    state = signIn(state, '2026-09-10T11:00:00+01:00');
    state = confirm(state, '2026-09-10T11:00:01+01:00', ...ids(state));
    state = restore(state, '2026-09-10T11:00:02+01:00', []);
    expect(addDownloaded(state, '2026-09-10T12:00:00+01:00', download(state))).toBe(state);
    expect(addDownloaded(state, '2026-09-10T12:00:00+01:00', [])).toBe(state);
    expect(restore(state, '2026-09-10T12:00:00+01:00', download(state))).toBe(state);
  });

  it('ignores a download for a guest, or for an account other than the one signed in', () => {
    const other = download(workedOn(initialState, '2026-09-10'));
    const guest = workedOn(initialState, '2026-09-11');
    const NOW = '2026-09-11T12:00:00+01:00';
    expect(restore(guest, NOW, other)).toBe(guest);
    expect(addDownloaded(guest, NOW, other)).toBe(guest);

    const signedIn = signIn(guest, NOW);
    expect(restore(signedIn, NOW, other, 'user-2')).toBe(signedIn);
    expect(addDownloaded(signedIn, NOW, other, 'user-2')).toBe(signedIn);
    expect(seenAt(signedIn, NOW).restoreWanted).toBe(true);
  });

  it('merges a month of sessions without finishing the restore', () => {
    const signedIn = signIn(initialState, T0);
    const some = addDownloaded(signedIn, T0, download(workedOn(initialState, '2026-09-10')));
    expect(some.record).toHaveLength(1);
    expect(seenAt(some, T0).restoreWanted).toBe(true);
  });

  it("lists a day's sessions from two phones earliest first, whichever arrived first", () => {
    // Another phone worked in the morning; this one worked in the afternoon and downloads later.
    const morning = worked(initialState, '2026-09-11T09:00:00+01:00', '2026-09-11T10:00:00+01:00');
    let phone = worked(initialState, '2026-09-11T14:00:00+01:00', '2026-09-11T15:00:00+01:00');
    phone = restore(signIn(phone, '2026-09-11T15:00:00+01:00'), '2026-09-11T15:00:00+01:00', download(morning));
    // A session this phone ends afterwards, but that started in between, finds its place too.
    phone = worked(phone, '2026-09-11T11:00:00+01:00', '2026-09-11T12:00:00+01:00');

    const day = seenAt(phone, '2026-09-11T16:00:00+01:00').calendar.days['2026-09-11'];
    expect(day?.sessions.map((session) => session.startedAt)).toEqual([
      at('2026-09-11T09:00:00+01:00'),
      at('2026-09-11T11:00:00+01:00'),
      at('2026-09-11T14:00:00+01:00'),
    ]);
    expect(day?.workTime).toBe(3 * HOUR);
  });
});

describe('a restored record', () => {
  // The phone that did the work: an hour on each of the 10th and 11th, then two hours this
  // morning, an hour ago.
  const NOW = '2026-09-12T12:00:00+01:00';
  const phoneA = worked(
    workedOn(workedOn(initialState, '2026-09-10'), '2026-09-11'),
    '2026-09-12T09:00:00+01:00',
    '2026-09-12T11:00:00+01:00',
  );
  // A new phone, signed in and restored, with nothing of its own.
  const newPhone = restore(signIn(initialState, NOW), NOW, download(phoneA));

  it('grows the same rose as the phone that recorded it', () => {
    const plant = seenAt(newPhone, NOW).plant;
    expect(plant).toEqual(seenAt(phoneA, NOW).plant);
    // Two hours of work is 20% life; an hour of wilting since takes a sixth of it away.
    if (plant.state !== 'alive') throw new Error(`Expected an alive plant, got ${plant.state}`);
    expect(plant.life).toBeCloseTo(20 * (5 / 6), 6);
    expect(plant).toMatchObject({
      look: 'wilting',
      plantedAt: at('2026-09-12T09:00:00+01:00'),
      diesAt: at('2026-09-12T17:00:00+01:00'),
    });
  });

  it('keeps the streak, the totals and the calendar', () => {
    const v = seenAt(newPhone, NOW);
    expect(v.streak).toBe(3);
    expect(v.todayWorkTime).toBe(2 * HOUR);
    expect(v.header.situation).toBe('worked-today');
    expect(v.calendar.totals).toEqual({ week: 4 * HOUR, month: 4 * HOUR, year: 4 * HOUR });
    expect(v.calendar).toEqual(seenAt(phoneA, NOW).calendar);
  });

  it('has nothing to upload: the account has it all already', () => {
    expect(uploadsAt(newPhone, NOW)).toEqual([]);
  });

  it('counts work that two phones did at the same time once, in time order, for the rose', () => {
    // Phone A worked 9 to 10, paused, and worked 12 to 1. Phone B worked 10:30 to 11:30 in the gap.
    let phoneA = start(initialState, '2026-09-11T09:00:00+01:00');
    phoneA = pause(phoneA, '2026-09-11T10:00:00+01:00');
    phoneA = resume(phoneA, '2026-09-11T12:00:00+01:00');
    phoneA = end(phoneA, '2026-09-11T13:00:00+01:00');
    let phoneB = worked(initialState, '2026-09-11T10:30:00+01:00', '2026-09-11T11:30:00+01:00');
    phoneB = restore(signIn(phoneB, '2026-09-11T13:00:00+01:00'), '2026-09-11T13:00:00+01:00', download(phoneA));

    const plant = seenAt(phoneB, '2026-09-11T13:00:00+01:00').plant;
    if (plant.state !== 'alive') throw new Error(`Expected an alive plant, got ${plant.state}`);
    // 10% from the first hour, wilted half an hour; 10% more, wilted half an hour; 10% more.
    const afterFirst = 10 * (1 - 0.5 / 6);
    const afterSecond = (afterFirst + 10) * (1 - 0.5 / 6);
    expect(plant.life).toBeCloseTo(afterSecond + 10, 6);
    expect(plant.plantedAt).toBe(at('2026-09-11T09:00:00+01:00'));
  });

  it('keeps the restore through a trip through JSON', () => {
    const saved = JSON.parse(JSON.stringify(newPhone)) as State;
    expect(saved).toEqual(newPhone);
    expect(seenAt(saved, NOW).restoreWanted).toBe(false);
    expect(seenAt(saved, NOW).streak).toBe(3);
  });
});
