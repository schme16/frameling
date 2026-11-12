@echo off
rem Build Frameling in one step. Run build.cmd for a menu, or name what to build:
rem   build.cmd this ^| all ^| windows ^| mac ^| linux ^| web   (add --test to run the tests first)
setlocal
cd /d "%~dp0"

where node >nul 2>nul || goto nonode
where npm >nul 2>nul || goto nonode
node -e "process.exit(+process.versions.node.split('.')[0] < 22 ? 1 : 0)" || goto oldnode

node scripts\build-menu.mjs %*
set CODE=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %CODE%

:nonode
echo Frameling needs Node.js 22 or newer to build. Get it from https://nodejs.org and run this again.
if "%~1"=="" pause
exit /b 1

:oldnode
echo Frameling needs Node.js 22 or newer to build. Get it from https://nodejs.org.
if "%~1"=="" pause
exit /b 1
