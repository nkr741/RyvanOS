@echo off
REM ============================================================
REM  Ryvan AI SDR - one-click daily launcher
REM  Double-click this at 11 AM. It will:
REM    1. start the local database
REM    2. start the app
REM    3. run discovery -> qualify -> draft QA outreach emails
REM    4. open your Leads page with everything ready
REM
REM  Requires: Docker Desktop running + Ollama running.
REM ============================================================
cd /d "%~dp0"
echo.
echo === Ryvan AI SDR ===
echo Make sure Docker Desktop and Ollama are running.
echo.

echo [1/4] Starting local database...
call npm run db:start

echo [2/4] Starting the app (leave that window open)...
start "Ryvan SDR App" cmd /c "npm run dev"

echo [3/4] Waiting for the app to be ready...
:waitloop
timeout /t 3 /nobreak >nul
for /f %%s in ('curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/health') do set CODE=%%s
if not "%CODE%"=="200" goto waitloop
echo      App is up.

REM read the cron secret from .env (not stored in this file)
for /f "tokens=1,* delims==" %%a in ('findstr /b "CRON_SECRET=" .env') do set CRON_SECRET=%%b

echo [4/4] Finding companies and drafting emails (this takes a few minutes)...
curl -s -X POST -H "x-cron-secret: %CRON_SECRET%" http://localhost:3000/api/cron/autonomous-discovery
echo.
echo Done. Opening your Leads page...
start "" http://localhost:3000/admin/leads
echo.
echo Review the drafts, fix the recipient name, and send. Good luck!
pause
