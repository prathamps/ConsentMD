@echo off
REM ConsentMD Caliper Benchmark Execution Script for Windows
REM This script runs individual benchmark configurations for consent management operations

setlocal enabledelayedexpansion

echo === ConsentMD Caliper Benchmark Suite ===
echo Starting benchmark execution...

REM Configuration
set NETWORK_CONFIG=networks/fabric/fabric-network.yaml
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set RESULTS_DIR=results/%YYYY%%MM%%DD%_%HH%%Min%%Sec%
set LOG_FILE=%RESULTS_DIR%\execution.log

REM Create results directory
mkdir "%RESULTS_DIR%" 2>nul

echo Results will be saved to: %RESULTS_DIR%
echo Execution log: %LOG_FILE%
echo.

REM Pre-flight checks
echo Performing pre-flight checks...

REM Check if network config exists
if not exist "%NETWORK_CONFIG%" (
    echo Error: Network configuration not found: %NETWORK_CONFIG%
    echo Please ensure the Fabric network configuration is properly set up.
    pause
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if npm is available
npm --version >nul 2>&1
if errorlevel 1 (
    echo Error: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo Pre-flight checks completed successfully
echo.

REM Initialize counters
set SUCCESSFUL_COUNT=0
set FAILED_COUNT=0
set SUCCESSFUL_BENCHMARKS=
set FAILED_BENCHMARKS=

REM Function to run benchmarks
echo.
echo Starting individual benchmark tests...

echo.
echo === Running Consent Granting Benchmark ===
echo Configuration: benchmarks/consent-management/consent-granting-benchmark.yaml
echo Start time: %date% %time%

call npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig "%NETWORK_CONFIG%" --caliper-benchconfig "benchmarks/consent-management/consent-granting-benchmark.yaml" --caliper-flow-only-test --caliper-report-path "%RESULTS_DIR%/consent-granting-report.html" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo X Failed to complete consent-granting benchmark
    set /a FAILED_COUNT+=1
    set FAILED_BENCHMARKS=!FAILED_BENCHMARKS! consent-granting
) else (
    echo + Completed consent-granting benchmark successfully
    set /a SUCCESSFUL_COUNT+=1
    set SUCCESSFUL_BENCHMARKS=!SUCCESSFUL_BENCHMARKS! consent-granting
)

echo.
echo === Running Record Access Benchmark ===
echo Configuration: benchmarks/consent-management/record-access-benchmark.yaml
echo Start time: %date% %time%

call npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig "%NETWORK_CONFIG%" --caliper-benchconfig "benchmarks/consent-management/record-access-benchmark.yaml" --caliper-flow-only-test --caliper-report-path "%RESULTS_DIR%/record-access-report.html" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo X Failed to complete record-access benchmark
    set /a FAILED_COUNT+=1
    set FAILED_BENCHMARKS=!FAILED_BENCHMARKS! record-access
) else (
    echo + Completed record-access benchmark successfully
    set /a SUCCESSFUL_COUNT+=1
    set SUCCESSFUL_BENCHMARKS=!SUCCESSFUL_BENCHMARKS! record-access
)

echo.
echo === Running Consent Revocation Benchmark ===
echo Configuration: benchmarks/consent-management/consent-revocation-benchmark.yaml
echo Start time: %date% %time%

call npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig "%NETWORK_CONFIG%" --caliper-benchconfig "benchmarks/consent-management/consent-revocation-benchmark.yaml" --caliper-flow-only-test --caliper-report-path "%RESULTS_DIR%/consent-revocation-report.html" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo X Failed to complete consent-revocation benchmark
    set /a FAILED_COUNT+=1
    set FAILED_BENCHMARKS=!FAILED_BENCHMARKS! consent-revocation
) else (
    echo + Completed consent-revocation benchmark successfully
    set /a SUCCESSFUL_COUNT+=1
    set SUCCESSFUL_BENCHMARKS=!SUCCESSFUL_BENCHMARKS! consent-revocation
)

echo.
echo === Running Mixed Workload Benchmark ===
echo Configuration: benchmarks/consent-management/mixed-workload-benchmark.yaml
echo Start time: %date% %time%

call npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig "%NETWORK_CONFIG%" --caliper-benchconfig "benchmarks/consent-management/mixed-workload-benchmark.yaml" --caliper-flow-only-test --caliper-report-path "%RESULTS_DIR%/mixed-workload-report.html" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo X Failed to complete mixed-workload benchmark
    set /a FAILED_COUNT+=1
    set FAILED_BENCHMARKS=!FAILED_BENCHMARKS! mixed-workload
) else (
    echo + Completed mixed-workload benchmark successfully
    set /a SUCCESSFUL_COUNT+=1
    set SUCCESSFUL_BENCHMARKS=!SUCCESSFUL_BENCHMARKS! mixed-workload
)

echo.
echo === Benchmark Execution Summary ===
echo Results directory: %RESULTS_DIR%
echo Execution log: %LOG_FILE%

if !SUCCESSFUL_COUNT! gtr 0 (
    echo Successful benchmarks ^(!SUCCESSFUL_COUNT!^):!SUCCESSFUL_BENCHMARKS!
)

if !FAILED_COUNT! gtr 0 (
    echo Failed benchmarks ^(!FAILED_COUNT!^):!FAILED_BENCHMARKS!
)

echo.
echo Next Steps:
echo 1. Review HTML reports: open %RESULTS_DIR%\*.html in your browser
echo 2. Check execution log: type "%LOG_FILE%"
echo 3. For detailed analysis, see: docs\performance-results-guide.md

if !FAILED_COUNT! gtr 0 (
    echo 4. Investigate failed benchmarks using the troubleshooting guide in README.md
    echo.
    echo Some benchmarks failed. Check the logs for details.
) else (
    echo.
    echo All benchmarks completed successfully!
)

echo.
pause