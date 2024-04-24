#!/bin/bash

# Define the minimum and maximum wait times in seconds
MINWAIT=$((5*60))  # 5 minutes
MAXWAIT=$((50*60)) # 50 minutes

# Calculate a random sleep time within the specified range
SLEEPTIME=$((MINWAIT + RANDOM % (MAXWAIT - MINWAIT)))

# Convert the sleep time to minutes for logging
SLEEP_MINUTES=$((SLEEPTIME / 60))

# Log the sleep duration
echo "Sleeping for $SLEEP_MINUTES minutes ($SLEEPTIME seconds)..."

# Sleep for the calculated time
sleep $SLEEPTIME

# Log the start of the script
echo "Starting script..."

# Execute the Node.js script directly
npm run start
