@echo off
setlocal
cd /d "%~dp0"

echo PixelForge Studio
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Install Python 3.11+ from https://www.python.org/downloads/
  echo and enable "Add python.exe to PATH".
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".env" (
  echo Creating .env from .env.example
  copy /Y ".env.example" ".env" >nul
)

if not exist "backend\.venv\Scripts\python.exe" (
  echo Creating the Python virtual environment...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo Could not create backend\.venv
    pause
    exit /b 1
  )
)

echo Installing Python packages...
call backend\.venv\Scripts\python.exe -m pip install --upgrade pip
call backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Installing frontend packages...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

echo Starting the API at http://127.0.0.1:8787
start "PixelForge API" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8787"

echo Starting the UI at http://127.0.0.1:5173
start "PixelForge UI" /D "%~dp0frontend" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173"

echo.
echo Open http://127.0.0.1:5173
echo Start ComfyUI separately, then use Settings -^> Test ComfyUI Connection.
echo.
pause
