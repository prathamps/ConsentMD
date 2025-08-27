@echo off
REM Windows Batch Script for Running Blockchain Performance Benchmarks
REM Provides easy command-line interface for benchmark execution

setlocal enabledelayedexpansion

REM Set script directory and project root
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..
set NODE_SCRIPT=%SCRIPT_DIR%runBenchmark.js

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js 14 or higher
    exit /b 1
)

REM Check if the Node.js script exists
if not exist "%NODE_SCRIPT%" (
    echo Error: runBenchmark.js not found at %NODE_SCRIPT%
    exit /b 1
)

REM Change to project root directory
cd /d "%PROJECT_ROOT%"

REM Execute the Node.js script with all arguments
node "%NODE_SCRIPT%" %*

REM Capture exit code
set EXIT_CODE=%errorlevel%

REM Return to original directory
cd /d "%~dp0"

exit /b %EXIT_CODE%