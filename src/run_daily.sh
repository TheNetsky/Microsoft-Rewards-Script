#!/bin/bash

# Set up environment variables
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin

# Change directory to the application directory
cd /usr/src/microsoft-rewards-script

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
