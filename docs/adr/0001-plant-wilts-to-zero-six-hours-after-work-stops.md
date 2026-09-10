# The plant wilts to 0% exactly 6 hours after work stops

Work adds 10% life per hour, so 10 hours from empty is full bloom. When work stops, whether by pausing or by ending the session, life falls in a straight line and reaches 0% exactly 6 hours later, whatever level it started at. This puts the plant's death on the same clock as a paused session's 6-hour auto-end and its 5-hour warning.

## Considered Options

- **The plant lives 48 hours after the last session** (the original idea). This became pointless once a paused session auto-ends at 6 hours.
- **A fixed wilting speed** (e.g. 16.7% an hour). A half-grown plant on pause would die hours before the auto-end, so the 5-hour warning would arrive after the plant was already dead.
- **Petals reset to a bud at midnight.** People work past midnight, and the plant shouldn't die at 00:00 because the date changed.

## Consequences

The plant dies most nights, so it isn't what carries progress from one day to the next. The streak does that.
