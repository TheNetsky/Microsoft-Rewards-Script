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