# Humanization (Human Mode)

Human Mode adds subtle human-like behavior so your automation looks and feels more natural. It's a single, simple switch—either on or off.

- Default: enabled (on)
- Toggle: `humanization.enabled`
- When on: small random waits, micro mouse moves, and occasional tiny scrolls are applied in safe places.
- When off: gestures are minimized and only essential waits remain.

## Configuration

Edit `src/config.json`:

```jsonc
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 150, "max": 450 },
    "gestureMoveProb": 0.4,
    "gestureScrollProb": 0.2,
    "allowedWindows": [],
    "randomOffDaysPerWeek": 1
  }
}
```

Fields:
- enabled: master on/off switch.
- stopOnBan: when true, stop remaining accounts after a ban is detected during a run.
- immediateBanAlert: when true, send an immediate webhook/NTFY alert upon detection of a ban.
- actionDelay: extra random pause used between actions (ms or time string like "300ms" or "1s").
- gestureMoveProb: probability (0..1) to perform a tiny mouse move during a step.
- gestureScrollProb: probability (0..1) to perform a tiny scroll.
- allowedWindows: optional list of local-time windows (e.g., ["08:30-11:00", "19:00-22:00"]). If set, runs will wait until the next allowed window.
- randomOffDaysPerWeek: randomly skip N days per week (default 1) to look more human. Set to 0 to disable.

Notes:
- Human Mode never clicks arbitrary elements. Gestures are minor and safe by design.
- Default probabilities are applied when `enabled` isn't false and fields are omitted.
- In Buy Mode, monitoring remains passive; humanization doesn't trigger extra actions.

## Examples

1) Keep defaults (recommended):
```jsonc
"humanization": { "enabled": true }
```

2) Turn off completely:
```jsonc
"humanization": { "enabled": false }
```

3) Fine-tune gestures and pauses:
```jsonc
"humanization": {
  "enabled": true,
  "actionDelay": { "min": 200, "max": 600 },
  "gestureMoveProb": 0.5,
  "gestureScrollProb": 0.25,
  "allowedWindows": ["08:00-10:30", "20:00-22:30"],
  "randomOffDaysPerWeek": 2
}
```
