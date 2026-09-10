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

**Achieved** / **Missed**:
How a goal finishes: achieved the moment its work time reaches the target, missed if its deadline passes first. Finished goals move to the goal history.

### People

**Display name**:
What the app calls the user in its messages. It's chosen at first launch and can be changed in Settings.
_Avoid_: Username, real name

**Guest**:
Someone using the app without signing in. Their record lives only on their phone until they sign in, when it's saved to their account.
_Avoid_: Anonymous user
