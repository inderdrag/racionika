@echo off
cd /d "%~dp0.."
if "%~1"=="" (
  echo Usage: scripts\publish.bat "feat: description"
  exit /b 1
)
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Restore Git history from history/racionika.bundle first. See README.
  exit /b 1
)
git add --all
if errorlevel 1 exit /b 1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%~1"
  if errorlevel 1 exit /b 1
)
git push -u origin main
