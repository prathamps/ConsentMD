@echo off
REM ConsentMD Single Benchmark Execution Script for Windows
REM Usage: run-single-benchmark.bat [benchmark-type]
REM Available types: consent-granting, record-access, consent-revocation, mixed-workload

setlocal enabledelayedexpansion

REM Configuration
set NETWORK_CONFIG=networks/fabric/fabric-network.yaml
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set RESULTS_DIR=results/single-%YYYY%%MM%%DD%_%HH%%Min%%Sec%

REM Function to display usage
if "%1"=="" goto show_usage
if "%1"=="help" goto show_usage
if "%1"=="-h" goto show_usage
if "%1"=="--help" goto show_usage

REM Set benchmark configuration based on type
set BENCHMARK_TYPE=%1
if "%BENCHMARK_TYPE%"=="consent-granting" (
    set CONFIG_FILE=benchmarks/consent-management/consent-granting-benchmark.yaml
) else if "%BENCHMARK_TYPE%"=="record-access" (
    set CONFIG_FILE=benchmarks/consent-management/record-access-benchmark.yaml
) else if "%BENCHMARK_TYPE%"=="consent-revocation" (
    set CONFIG_FILE=benchmarks/consent-management/consent-revocation-benchmark.yaml
) else if "%BENCHMARK_TYPE%"=="mixed-workload" (
    set CONFIG_FILE=benchmarks/consent-management/mixed-workload-benchmark.yaml
) else (
    echo Error: Invalid benchmark type '%BENCHMARK_TYPE%'
    echo.
    goto show_usage
)

REM Create results directory
mkdir "%RESULTS_DIR%" 2>nul
set LOG_FILE=%RESULTS_DIR%\execution.log

echo === ConsentMD Single Benchmark Runner ===
echo Benchmark type: %BENCHMARK_TYPE%
echo Configuration: %CONFIG_FILE%
echo Results directory: %RESULTS_DIR%
echo Execution log: %LOG_FILE%
echo.

REM Pre-flight checks
echo Performing pre-flight checks...

if not exist "%NETWORK_CONFIG%" (
    echo Error: Network configuration not found: %NETWORK_CONFIG%
    pause
    exit /b 1
)

if not exist "%CONFIG_FILE%" (
    echo Error: Benchmark configuration not found: %CONFIG_FILE%
    pause
    exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo Error: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo Pre-flight checks completed successfully
echo.

REM Run the benchmark
echo === Running %BENCHMARK_TYPE% Benchmark ===
echo Start time: %date% %time%
echo.

call npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig "%NETWORK_CONFIG%" --caliper-benchconfig "%CONFIG_FILE%" --caliper-flow-only-test --caliper-report-path "%RESULTS_DIR%/%BENCHMARK_TYPE%-report.html" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
    echo.
    echo X Benchmark failed to complete
    echo Check the logs for error details: %LOG_FILE%
    echo Troubleshooting guide: README.md
    pause
    exit /b 1
) else (
    echo.
    echo + Benchmark completed successfully!
    echo Report saved to: %RESULTS_DIR%\%BENCHMARK_TYPE%-report.html
    echo.
    echo Next Steps:
    echo 1. Open the HTML report: %RESULTS_DIR%\%BENCHMARK_TYPE%-report.html
    echo 2. Review execution log: %LOG_FILE%
    echo 3. For analysis guidance: docs\performance-results-guide.md
    echo.
    pause
    exit /b 0
)

:show_usage
echo ConsentMD Single Benchmark Runner
echo.
echo Usage: %0 [benchmark-type]
echo.
echo Available benchmark types:
echo   consent-granting     - Test consent creation performance
echo   record-access        - Test record query performance
echo   consent-revocation   - Test consent revocation performance
echo   mixed-workload       - Test combined operations performance
echo.
echo Examples:
echo   %0 consent-granting
echo   %0 mixed-workload
echo.
pause
exit /b 1