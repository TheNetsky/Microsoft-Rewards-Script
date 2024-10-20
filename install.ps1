<<<<<<< HEAD
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

=======
# installs fnm (Fast Node Manager)
winget install Schniz.fnm

# configure fnm environment
fnm env --use-on-cd | Out-String | Invoke-Expression

# download and install Node.js
fnm use --install-if-missing 20

# verifies the right Node.js version is in the environment
node -v # should print `v20.17.0`

# verifies the right npm version is in the environment
npm -v # should print `10.8.2`

# install git
winget install Git.Git

# clone repo
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd .\Microsoft-Rewards-Script\

# update npm
npm install -g npm@10.8.3

# install deps
npm i

# install playwright browsers
npx playwright install

# msgbox stuff
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('Now rename accounts.example.json to accounts.json!')

# self explanatory
cd src/
explorer .

# wait until accounts.json is found
while (-not (Test-Path "accounts.json")) {
    Start-Sleep -Seconds 0
}

# close explorer if accounts.json was found
Stop-Process -Name explorer

# continue with the script
Write-Host "File renamed to accounts.json. Proceeding with the script."

# build and start the script
npm run build
npm run start
>>>>>>> 7d5d10308c25f40d4338ab7414d5ed8ad245c786
