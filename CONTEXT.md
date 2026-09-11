# Hustle

An iPhone app for timing your own work honestly. A pixel-art plant on the home screen (a rose, to begin with) thrives while you work, and wilts and dies when you stop.

## Language

### Working

**Work**:
Any effort the user chooses to time, such as studying, a job or a side project. The app doesn't distinguish kinds of work.
_Avoid_: Study, focus, hustle

**Session**:
One stretch of work, from pressing Start to pressing End, with any number of pauses in between. A session only enters the record once it has ended.
_Avoid_: Timer, shift

**Pause**:
A break inside a session. Paused time isn't work time.

**Stop**:
The end of any running period, whether by a pause or by End. The plant starts wilting at a stop.

**Auto-end**:
What happens to a session left paused for 6 hours: it ends by itself, as if the user had pressed End.
_Avoid_: Timeout, cutoff

**Work time**:
The unpaused time inside sessions, added up over a span such as one session, a day, a week or a goal.
_Avoid_: Hours, duration

**Day**:
A calendar date, midnight to midnight, in the time zone the session started in. Work that runs past midnight is split between the two days it touches.
_Avoid_: Work day

**Record**:
Every ended session, exactly as the timer measured it. The user can never edit or delete anything in the record.
_Avoid_: Log, history

**Streak**:
How many days in a row the user has done any work, however little. It breaks when a whole day passes with no work.

### The plant

**Plant**:
The pixel-art living thing on the home screen that reflects the user's work. Each user has at most one living plant at a time.
_Avoid_: Pet, avatar

**Rose**:
The first, and for now only, kind of plant.

**Life**:
How alive the plant is, from 0% to 100%. Work raises it; time spent not working lowers it.
_Avoid_: Health, HP, bloom

**Full bloom**:
How the plant looks at 100% life.

**Look**:
One of the six ways the plant is drawn, chosen by its life: dead, wilting, drooping, bud, opening and full bloom. Each alive look covers a band of 20% of life.
_Avoid_: Stage, sprite, frame

**Death**:
The moment a plant's life reaches 0%. A dead plant stays on screen until the next time the user works, which plants a new one.

### Goals

**Goal**:
An optional target the user sets: an amount of work time to reach by a deadline, e.g. "Finals: 100 hours in 2 weeks".
_Avoid_: Target, challenge

**Active goal**:
A goal that's switched on. Work counts toward a goal only while it's active, so several active goals can all gain from the same work.

**Dormant goal**:
A goal that's switched off. It keeps its progress but gains nothing until it's switched back on.
_Avoid_: Paused goal, inactive goal

**Progress**:
A goal's work time so far: only the work done while it was active, up to the end of its deadline date. Shown as a bar against the target.

**Achieved** / **Missed**:
How a goal finishes: achieved the moment its work time reaches the target, missed if its deadline passes first. Finished goals move to the goal history.

**Goal history**:
The page a swipe left from Goals reaches, listing achieved and missed goals. Goals in progress stay on the Goals page.
_Avoid_: Past goals, archive

**Editing a goal**:
Changing a goal's name, target or deadline, which any goal allows, finished or not. Nothing about a goal's status is stored, so it always follows the current details: a lower target can make a goal achieved, a later deadline can bring a missed goal back. A goal can also be deleted; the work that counted toward it stays in the record.

### Notifications

**Notification schedule**:
What the phone should say and when, if nothing else happens: a running session keeps running, a paused one auto-ends. Every notification is scheduled on the phone itself; there is no push server. The phone replaces its pending notifications with the schedule whenever it changes.

**Pause warning**:
The notification 5 hours into a pause, an hour before the auto-end, warning that the session is about to end and the plant to die. Cancelled by resuming or ending.

**Auto-end notice**:
The notification at the auto-end of a paused session, saying the session has ended and the plant has died. Nothing is sent after the user presses End.

**Streak reminder**:
The notification at 9pm on a day with no work yet, while there is a streak to keep. It names the streak's length.

**Quiet hours**:
10pm to 8am in the phone's time zone. Anything due then is dropped, not delayed.
_Avoid_: Do not disturb, night mode

**Notification switches**:
The two Settings switches, Pause warnings (the pause warning and the auto-end notice) and Streak reminder. Both start on. They are separate from the phone's own permission, which is asked at the first Start; the app works the same whether it's granted or not.

### People

**Display name**:
What the app calls the user in its messages. It's chosen at first launch and can be changed in Settings.
_Avoid_: Username, real name

**Guest**:
Someone using the app without signing in. Their record lives only on their phone until they sign in, when it's saved to their account.
_Avoid_: Anonymous user

**Account**:
Who the user is signed in as, with Apple or with Google. Signing in is what makes a guest's record start backing up, and either way in leads to the same backing up and restoring.
_Avoid_: Login, profile

**Save your progress**:
The pop-up after the confetti at the end of a guest's first session, with Sign in with Apple and Sign in with Google. It's offered once: whatever the guest chooses, it never comes back. Settings' Back up your progress offers the same two sign-ins at any time.
_Avoid_: Sign-in prompt, upsell

**Back up**:
Uploading the record to the account, so a new phone can restore it. Uploads happen only when the user is signed in and online, and only at these moments: after a session ends, when the app opens, when the connection returns and on sign-in. Nothing polls.
_Avoid_: Sync, cloud save

**Upload queue**:
The ended sessions the account hasn't yet confirmed it stored, in the order they ended. Every session joins it when it ends; a guest's wait there until they sign in. A session leaves only when its upload is confirmed, and the database ignores a session it already has, so a retry never stores one twice.

**Restore**:
Downloading the account's record to the phone, so a new phone or a fresh install picks up where the account left off: the calendar, totals, streak and plant. It happens once per sign-in, as soon as the phone is online. Opening the Calendar also fetches the month on show, once per month while the app stays open, so work recorded on another phone turns up. Downloaded sessions join the record by ID, so nothing is doubled and none of them is uploaded again.
_Avoid_: Sync, download
