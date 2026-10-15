@echo off
title Electron by Haris
cd /d "%~dp0"

:: Ensure Node.js is in PATH even if system environment variables haven't refreshed yet
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
    )
)

:: Terminate any lingering background instance so the new window always opens
taskkill /F /IM electron.exe >nul 2>nul

echo Starting Electron by Haris...
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    "%~dp0node_modules\electron\dist\electron.exe" "%~dp0app\main.js"
) else (
    call npm start
)

if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo  [!] Application exited with code %errorlevel%.
    echo ========================================================
    echo.
    pause
)
