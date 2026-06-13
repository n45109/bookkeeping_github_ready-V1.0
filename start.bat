@echo off
cd /d "%~dp0"

set "BOOTSTRAP_PYTHON="
if exist "%~dp0venv\Scripts\python.exe" set "BOOTSTRAP_PYTHON=%~dp0venv\Scripts\python.exe"
if not defined BOOTSTRAP_PYTHON if exist "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set "BOOTSTRAP_PYTHON=C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not defined BOOTSTRAP_PYTHON where python >nul 2>nul && set "BOOTSTRAP_PYTHON=python"

if not defined BOOTSTRAP_PYTHON (
    echo [ERROR] Python not found. Install Python 3.11 or 3.12.
    pause
    exit /b 1
)

"%BOOTSTRAP_PYTHON%" "%~dp0launcher.py"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
