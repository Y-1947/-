@echo off
cd /d "%~dp0"
node --env-file-if-exists=.env launch.mjs --foreground
if errorlevel 1 pause
