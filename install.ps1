# Function to detect OS type and install dependencies
function Install-Dependencies {
    $os = (Get-CimInstance Win32_OperatingSystem).Caption
    if ($os -like "*Windows*") {
        # Install fnm and Git for Windows
        winget install Schniz.fnm
        winget install Git.Git
    } else {
        Write-Host "Unsupported OS. Please use the Linux/Bash script for non-Windows systems."
        exit 1
    }
}

# Prompt user for Docker usage
$useDocker = Read-Host "Do you want to use Docker for setup? (yes/no)"
if ($useDocker -eq "yes") {
    # Docker setup steps
    winget install Docker.DockerDesktop
    docker pull node:20
    docker pull mcr.microsoft.com/playwright:focal
    Write-Host "Docker environment ready."
    exit
}

# Call function to install dependencies
Install-Dependencies

# Configure fnm environment
fnm env --use-on-cd | Out-String | Invoke-Expression

# Download and install Node.js
fnm use --install-if-missing 20

# Verify Node.js and npm versions
node -v
npm -v

# Clone the repo
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd .\Microsoft-Rewards-Script\

# Update npm
npm install -g npm@10.8.3

# Install dependencies
npm i

# Install Playwright browsers
npx playwright install

# Build and start the script
npm run build
npm run start

