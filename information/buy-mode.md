# Buy Mode Documentation

## Overview

Buy Mode is a specialized operation mode that allows you to manually redeem or purchase rewards while the script passively monitors your point balance in the background.

## How to Use

```bash
# Monitor specific account
npm start -- -buy your@email.com

# Monitor first account in accounts.json
npm start -- -buy
```

## What Happens

### 1. Dual Tab System
- **Monitor Tab**: Background tab that auto-refreshes every ~10 seconds to track points
- **User Tab**: Your main browsing tab for manual actions (redemptions, purchases, browsing)

### 2. Passive Monitoring
- Script reads your point balance without clicking or interfering
- Detects when points decrease (indicating a purchase/redemption)
- No automation runs - you have complete control

### 3. Real-time Notifications
- Instant alerts via Discord/NTFY when spending is detected
- Shows amount spent and current balance
- Tracks cumulative spending for the session

### 4. Session Summary
- Final report with initial points, final points, and total spent
- Negative `totalCollected` value indicates spending
- Standard conclusion webhook format

## Configuration

Add to your `src/config.json`:

```json
{
  "buyMode": {
    "maxMinutes": 45
  }
}
```

- `maxMinutes`: How long to monitor (default: 45 minutes)
- Monitoring stops automatically after this duration

## Terminal Output

When you start buy mode, you'll see:

```
 ███╗   ███╗███████╗    ██████╗ ██╗   ██╗██╗   ██╗
 ████╗ ████║██╔════╝    ██╔══██╗██║   ██║╚██╗ ██╔╝
 ██╔████╔██║███████╗    ██████╔╝██║   ██║ ╚████╔╝ 
 ██║╚██╔╝██║╚════██║    ██╔══██╗██║   ██║  ╚██╔╝  
 ██║ ╚═╝ ██║███████║    ██████╔╝╚██████╔╝   ██║   
 ╚═╝     ╚═╝╚══════╝    ╚═════╝  ╚═════╝    ╚═╝   
                                                   
            Manual Purchase Mode • Passive Monitoring

[BUY-MODE] Buy mode ENABLED for your@email.com. We'll open 2 tabs: 
           (1) monitor tab (auto-refreshes), (2) your browsing tab
[BUY-MODE] The monitor tab may refresh every ~10s. Use the other tab...
[BUY-MODE] Opened MONITOR tab (auto-refreshes to track points)
[BUY-MODE] Opened USER tab (use this one to redeem/purchase freely)
[BUY-MODE] Logged in as your@email.com. Buy mode is active...
```

During monitoring:
```
[BUY-MODE] Detected spend: -500 points (current: 12,500)
[BUY-MODE] Monitor tab was closed; reopening in background...
```

## Features

- ✅ **Non-intrusive**: No clicks or navigation in your browsing tab
- ✅ **Real-time alerts**: Instant notifications when points are spent
- ✅ **Auto-recovery**: Reopens monitor tab if accidentally closed
- ✅ **Webhook support**: Works with Discord and NTFY notifications
- ✅ **Configurable duration**: Set your own monitoring time limit
- ✅ **Session tracking**: Complete summary of spending activity

## Use Cases

- **Manual redemptions**: Redeem gift cards or rewards while tracking spending
- **Account verification**: Monitor point changes during manual account activities
- **Spending analysis**: Track how points are being used in real-time
- **Safe browsing**: Use Microsoft Rewards normally while monitoring balance

## Notes

- Monitor tab runs in background and may refresh periodically
- Your main browsing tab is completely under your control
- Session data is saved automatically for future script runs
- Buy mode works with existing notification configurations
- No automation or point collection occurs in this mode

## Troubleshooting

- **Monitor tab closed**: Script automatically reopens it in background
- **No notifications**: Check webhook/NTFY configuration in `config.json`
- **Session timeout**: Increase `maxMinutes` if you need longer monitoring
- **Login issues**: Ensure account credentials are correct in `accounts.json`
