:: 运行脚本
:: 更改下方目录为项目目录
chcp 65001 >nul
%~d0
cd %~dp0
call npm start
