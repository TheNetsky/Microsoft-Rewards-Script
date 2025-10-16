# 🤖 Humanization

**Make automation look natural to avoid detection**

---

## 💡 What Is It?

Humanization adds **random delays** and **subtle gestures** to mimic real human behavior.

### Why Use It?
- ✅ **Lower detection risk** — Looks less like a bot
- ✅ **Natural patterns** — Random timing, mouse moves
- ✅ **Built-in** — No configuration needed

---

## ⚡ Quick Start

**Edit** `src/config.jsonc`:
```jsonc
{
  "humanization": {
    "enabled": true
  }
}
```

**That's it!** Default settings work for most users.

---

## 🎯 What It Does

### Random Delays
- **150-450ms pauses** between actions
- Mimics human decision-making time
- Prevents robotic patterns

### Subtle Gestures
- **Mouse movements** — Small cursor adjustments (40% chance)
- **Scrolling** — Minor page movements (20% chance)
- **Never clicks** random elements (safe by design)

### Temporal Patterns
- **Random off days** — Skip 1 day per week by default
- **Time windows** — Run only during certain hours (optional)

---

## 🎛️ Presets

### Default (Recommended)
```jsonc
{
  "humanization": {
    "enabled": true
  }
}
```

Balanced safety and speed.

---

### Conservative (More Natural)
```jsonc
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 300, "max": 800 },
    "gestureMoveProb": 0.6,
    "gestureScrollProb": 0.4,
    "randomOffDaysPerWeek": 2
  }
}
```

Slower but safer.

---

### Fast (Less Natural)
```jsonc
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 100, "max": 250 },
    "gestureMoveProb": 0.2,
    "gestureScrollProb": 0.1,
    "randomOffDaysPerWeek": 0
  }
}
```

Faster execution, higher risk.

---

## ⏰ Time Windows (Optional)

Run only during specific hours:

```jsonc
{
  "humanization": {
    "enabled": true,
    "allowedWindows": ["08:00-10:30", "20:00-22:30"]
  }
}
```

Script **waits** until next allowed window if started outside.

---

## 📅 Random Off Days

Skip random days per week:

```jsonc
{
  "humanization": {
    "enabled": true,
    "randomOffDaysPerWeek": 1  // Skip 1 random day/week
  }
}
```

**Options:**
- `0` — Never skip days
- `1` — Skip 1 day/week (default)
- `2` — Skip 2 days/week

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Too slow** | Lower `actionDelay`, reduce probabilities |
| **Too fast/robotic** | Increase delays, higher probabilities |
| **Not running at all** | Check `allowedWindows` time format |

---

## 📚 Next Steps

**Need vacation mode?**  
→ See [Scheduler Vacation](./schedule.md#vacation-mode)

**Want scheduling?**  
→ **[Scheduler Guide](./schedule.md)**

**More security?**  
→ **[Security Guide](./security.md)**

---

**[← Back to Hub](./index.md)** | **[Config Guide](./config.md)**
