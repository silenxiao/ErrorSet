@echo off
REM ===========================================================================
REM  AI Cuotiben (mobile) - Android APK build entry point.
REM
REM  Uses -ExecutionPolicy Bypass so the unsigned .ps1 runs despite a
REM  RemoteSigned machine policy. This affects only this process; it does not
REM  change any system setting.
REM
REM  Usage examples:
REM    build-android.cmd
REM    build-android.cmd -BackendBaseUrl http://192.168.1.50:8000
REM    build-android.cmd -SkipPrebuild -Arch arm64-v8a,armeabi-v7a
REM    build-android.cmd -Variant Debug
REM  Show all parameters:
REM    build-android.cmd -?
REM
REM  NOTE: keep this file ASCII-only. cmd.exe parses non-ASCII REM lines as
REM  commands when the console code page is not UTF-8.
REM ===========================================================================
setlocal
set "SCRIPT=%~dp0build-android.ps1"

if not exist "%SCRIPT%" (
  echo [ERROR] not found: "%SCRIPT%"
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%
