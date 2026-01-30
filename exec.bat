@echo on
echo [BOT] Iniciando compilação...
echo %DATE% %TIME% Iniciando compilação...> D:\Microsoft-Rewards-Script\log_execucao.txt

cd /d "D:\Microsoft-Rewards-Script"

call npm run start

echo %DATE% %TIME% TSC realizado...>> D:\Microsoft-Rewards-Script\log_execucao.txt

echo [BOT] Executando bot...
echo %DATE% %TIME% Executando bot...>> D:\Microsoft-Rewards-Script\log_execucao.txt

call "C:\Program Files\nodejs\node.exe" D:\Microsoft-Rewards-Script\dist\index.js

echo %DATE% %TIME% Terminando ação...>> D:\Microsoft-Rewards-Script\log_execucao.txt
pause