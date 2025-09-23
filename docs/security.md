# Security incidents

## Recovery email mismatch

The bot compares the masked hint shown by Microsoft with your configured `recoveryEmail`.
- If the prefix/domain looks wrong, the bot will:
  - Continue typing the password, but stop farming after login
  - Leave the page open for manual review
  - Send a webhook alert (yellow)
  - Engage global standby so next accounts won’t start
  - Open this page in a new tab

## We can’t sign you in (blocked)

When Microsoft shows a blocking page like “We can’t sign you in”, the bot will:
- Alert (yellow), engage global standby and leave the page open
- Open this guide so you can follow remediation steps
- Keep reminding every 5 minutes in the terminal

Notes:
- All alerts include “Security check by @Light”.
- Check your account security settings and finish the manual challenge before resuming.
