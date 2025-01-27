# just thought of doing this since some people have powershell on Linux
$hasGUI = [Environment]::UserInteractive

# Install dependencies
function Install-Dependencies {
    winget install Schniz.fnm Git.Git
    fnm env --use-on-cd | Out-String | Invoke-Expression
    fnm install 20
    fnm use 20
}

$useDocker = Read-Host "Use Docker? [yes/no]"
if ($useDocker -eq "yes") {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Install Docker Desktop first: https://docs.docker.com/desktop/"
        exit 1
    }
    docker pull node:20
    docker pull mcr.microsoft.com/playwright:focal
    Write-Host "Docker images ready. Run 'docker compose up' to start."
    exit
}

Install-Dependencies

$REPO_DIR = "Microsoft-Rewards-Script"
if (-not (Test-Path $REPO_DIR)) {
    git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git $REPO_DIR
}
cd $REPO_DIR

npm install -g npm@10.8.3
npm i
npx playwright install

if ($hasGUI) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Rename accounts.example.json to accounts.json')
    explorer src/
} else {
    Write-Host "1. Rename src/accounts.example.json to accounts.json"
    Write-Host "2. Add your accounts in the JSON file"
    Read-Host "Press Enter when done..."
}

# wait for accounts.json
while (-not (Test-Path "src/accounts.json")) { Start-Sleep -Seconds 1 }
Stop-Process -Name explorer -ErrorAction SilentlyContinue

npm run build
npm run start
