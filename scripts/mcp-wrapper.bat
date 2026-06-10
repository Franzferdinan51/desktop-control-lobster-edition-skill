@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SKILL_DIR=%SCRIPT_DIR:~0,-1%"
set "SKILL_DIR=%SKILL_DIR:~0,-1%"
for %%I in ("%SKILL_DIR%") do set "SKILL_DIR=%%~fI"
start /B "" node "%SKILL_DIR%\src\server.js"
