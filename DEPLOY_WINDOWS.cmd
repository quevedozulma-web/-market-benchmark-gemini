@echo off
echo =====================================================
echo Market Benchmark - Cloudflare + Gemini deployment
echo =====================================================
echo.
echo 1. Installing Wrangler...
call npm install
if errorlevel 1 goto :error

echo.
echo 2. Logging in to Cloudflare...
call npx wrangler login
if errorlevel 1 goto :error

echo.
echo 3. Paste your Gemini API key when prompted.
call npx wrangler secret put GEMINI_API_KEY
if errorlevel 1 goto :error

echo.
echo 4. Deploying application...
call npm run deploy
if errorlevel 1 goto :error

echo.
echo Deployment complete. Copy the workers.dev URL shown above.
pause
exit /b 0

:error
echo.
echo Deployment stopped because a command failed.
pause
exit /b 1
