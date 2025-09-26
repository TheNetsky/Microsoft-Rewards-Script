# 🤖 Humanization (Human Mode)

<div align="center">

**🎭 Natural automation that mimics human behavior**  
*Subtle gestures for safer operation*

</div>

---

## 🎯 What is Humanization?

Human Mode adds **subtle human-like behavior** to make your automation look and feel more natural. It's designed to be **safe by design** with minimal, realistic gestures.

### **Key Features**
- 🎲 **Random delays** — Natural pause variation
- 🖱️ **Micro movements** — Subtle mouse gestures
- 📜 **Tiny scrolls** — Minor page adjustments
- ⏰ **Time windows** — Run during specific hours
- 📅 **Random off days** — Skip days naturally
- 🔒 **Safe by design** — Never clicks random elements

---

## ⚙️ Configuration

### **Simple Setup (Recommended)**
```json
{
  "humanization": {
    "enabled": true
  }
}
```

### **Advanced Configuration**
```json
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 150, "max": 450 },
    "gestureMoveProb": 0.4,
    "gestureScrollProb": 0.2,
    "allowedWindows": ["08:00-10:30", "20:00-22:30"],
    "randomOffDaysPerWeek": 1
  }
}
```

### **Configuration Options**

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Master toggle for all humanization |
| `actionDelay` | `{min: 150, max: 450}` | Random pause between actions (ms) |
| `gestureMoveProb` | `0.4` | Probability (0-1) for tiny mouse moves |
| `gestureScrollProb` | `0.2` | Probability (0-1) for minor scrolls |
| `allowedWindows` | `[]` | Time windows for script execution |
| `randomOffDaysPerWeek` | `1` | Skip N random days per week |

---

## 🎭 How It Works

### **Action Delays**
- **Random pauses** between automation steps
- **Natural variation** mimics human decision time
- **Configurable range** allows fine-tuning

### **Gesture Simulation**
- **Micro mouse moves** — Tiny cursor adjustments (safe zones only)
- **Minor scrolls** — Small page movements (non-interactive areas)
- **Probability-based** — Not every action includes gestures

### **Temporal Patterns**
- **Time windows** — Only run during specified hours
- **Random off days** — Skip days to avoid rigid patterns
- **Natural scheduling** — Mimics human usage patterns

---

## 🎯 Usage Examples

### **Default Setup (Recommended)**
```json
{
  "humanization": { "enabled": true }
}
```
✅ **Best for most users** — Balanced safety and naturalness

### **Minimal Humanization**
```json
{
  "humanization": {
    "enabled": true,
    "gestureMoveProb": 0.1,
    "gestureScrollProb": 0.1,
    "actionDelay": { "min": 100, "max": 200 }
  }
}
```
⚡ **Faster execution** with minimal gestures

### **Maximum Natural Behavior**
```json
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 300, "max": 800 },
    "gestureMoveProb": 0.6,
    "gestureScrollProb": 0.4,
    "allowedWindows": ["08:30-11:00", "19:00-22:00"],
    "randomOffDaysPerWeek": 2
  }
}
```
🎭 **Most human-like** but slower execution

### **Disabled Humanization**
```json
{
  "humanization": { "enabled": false }
}
```
🚀 **Fastest execution** — automation optimized

---

## ⏰ Time Windows

### **Setup**
```json
{
  "humanization": {
    "enabled": true,
    "allowedWindows": ["08:00-10:30", "20:00-22:30"]
  }
}
```

### **Behavior**
- Script **waits** until next allowed window
- Uses **local time** for scheduling
- **Multiple windows** supported per day
- **Empty array** `[]` = no time restrictions

### **Examples**
```json
// Morning and evening windows
"allowedWindows": ["08:00-10:30", "20:00-22:30"]

// Lunch break only
"allowedWindows": ["12:00-13:00"]

// Extended evening window
"allowedWindows": ["18:00-23:00"]

// No restrictions
"allowedWindows": []
```

---

## 📅 Random Off Days

### **Purpose**
Mimics natural human behavior by skipping random days per week.

### **Configuration**
```json
{
  "humanization": {
    "randomOffDaysPerWeek": 1  // Skip 1 random day per week
  }
}
```

### **Options**
- `0` — Never skip days
- `1` — Skip 1 random day per week (default)
- `2` — Skip 2 random days per week
- `3+` — Higher values for more irregular patterns

---

## 🔒 Safety Features

### **Safe by Design**
- ✅ **Never clicks** arbitrary elements
- ✅ **Gestures only** in safe zones  
- ✅ **Minor movements** — pixel-level adjustments
- ✅ **Probability-based** — Natural randomness
- ✅ **Non-interactive areas** — Avoids clickable elements

### **Buy Mode Compatibility**
- **Passive monitoring** remains unaffected
- **No interference** with manual actions
- **Background tasks** only for monitoring

---

## 📊 Performance Impact

| Setting | Speed Impact | Natural Feel | Recommendation |
|---------|--------------|--------------|----------------|
| **Disabled** | Fastest | Robotic | Development only |
| **Default** | Moderate | Balanced | **Recommended** |
| **High probability** | Slower | Very natural | Conservative users |
| **Time windows** | Delayed start | Realistic | Scheduled execution |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| **Script too slow** | Reduce `actionDelay` values; lower probabilities |
| **Too robotic** | Increase probabilities; add time windows |
| **Runs outside hours** | Check `allowedWindows` format (24-hour time) |
| **Skipping too many days** | Reduce `randomOffDaysPerWeek` |
| **Gestures interfering** | Lower probabilities or disable specific gestures |

### **Debug Humanization**
```powershell
$env:DEBUG_HUMANIZATION=1; npm start
```

---

## 🎛️ Presets

### **Conservative**
```json
{
  "humanization": {
    "enabled": true,
    "actionDelay": { "min": 200, "max": 600 },
    "gestureMoveProb": 0.6,
    "gestureScrollProb": 0.4,
    "allowedWindows": ["08:00-10:00", "20:00-22:00"],
    "randomOffDaysPerWeek": 2
  }
}
```

### **Balanced (Default)**
```json
{
  "humanization": {
    "enabled": true
  }
}
```

### **Performance**
```json
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

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Scheduler](./schedule.md)** — Automated timing and execution
- **[Security](./security.md)** — Privacy and detection avoidance
- **[Buy Mode](./buy-mode.md)** — Manual purchasing with monitoring
