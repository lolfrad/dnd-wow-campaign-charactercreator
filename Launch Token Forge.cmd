@echo off
setlocal
title Azeroth Token Forge
set "FORGE_ROOT=%~dp0"
set "FORGE_NODE_HOME=%FORGE_ROOT%.runtime\node-v24.21.0-win-x64"
if not exist "%FORGE_NODE_HOME%\node_modules\npm\bin\npm-cli.js" goto install_runtime
if not exist "%FORGE_NODE_HOME%\node_modules\npm\lib\cli.js" goto install_runtime
if exist "%FORGE_NODE_HOME%\node.exe" goto launch

:install_runtime
echo Preparing the project's portable Node.js runtime. First launch only.
echo No administrator access or global Node installation is needed.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $env:PSModulePath=(Join-Path $PSHOME 'Modules'); [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $root=[IO.Path]::GetFullPath($env:FORGE_ROOT); $runtime=[IO.Path]::GetFullPath((Join-Path $root '.runtime')); if(-not $runtime.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid runtime directory'}; New-Item -ItemType Directory -Force -Path $runtime | Out-Null; $archive=Join-Path $runtime 'node-v24.21.0-win-x64.zip'; $expected='158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'; if(-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected){Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -OutFile $archive}; if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected){throw 'Node.js download checksum did not match. Download rejected.'}; Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force"
if errorlevel 1 goto failed

:launch
"%FORGE_NODE_HOME%\node.exe" "%FORGE_ROOT%app\scripts\launch-local.mjs" %*
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Token Forge could not start. The error is shown above.
echo More details: .cache\launcher\launcher.log and .cache\launcher\server.log
if /i "%FORGE_NO_PAUSE%"=="1" exit /b 1
pause
exit /b 1
