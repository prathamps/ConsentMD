@echo off
REM ConsentMD Benchmark Setup Verification Script for Windows
REM This script verifies that all prerequisites are met before running benchmarks

setlocal enabledelayedexpansion

set CHECKS_PASSED=0
set CHECKS_FAILED=0
set WARNINGS=0

echo === ConsentMD Benchmark Setup Verification ===
echo This script will verify that your environment is ready for benchmark execution.
echo.

REM System Requirements
echo === System Requirements ===

echo Checking Node.js version...
node --version >nul 2>&1
if errorlevel 1 (
    echo X Node.js not found
    set /a CHECKS_FAILED+=1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo + Node.js: %%i
    set /a CHECKS_PASSED+=1
)

echo Checking npm version...
npm --version >nul 2>&1
if errorlevel 1 (
    echo X npm not found
    set /a CHECKS_FAILED+=1
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo + npm: %%i
    set /a CHECKS_PASSED+=1
)

echo.

REM Project Structure
echo === Project Structure ===

echo Checking benchmark configurations...
if exist "benchmarks\consent-management" (
    echo + Benchmark configurations found
    set /a CHECKS_PASSED+=1
) else (
    echo X Benchmark configurations missing
    set /a CHECKS_FAILED+=1
)

echo Checking network configurations...
if exist "networks\fabric" (
    echo + Network configurations found
    set /a CHECKS_PASSED+=1
) else (
    echo X Network configurations missing
    set /a CHECKS_FAILED+=1
)

echo Checking workload modules...
if exist "workloads" (
    echo + Workload modules directory found
    set /a CHECKS_PASSED+=1
) else (
    echo X Workload modules directory missing
    set /a CHECKS_FAILED+=1
)

echo Checking package.json...
if exist "package.json" (
    echo + package.json found
    set /a CHECKS_PASSED+=1
) else (
    echo X package.json missing
    set /a CHECKS_FAILED+=1
)

echo.

REM Configuration Files
echo === Configuration Files ===

echo Checking network config...
if exist "networks\fabric\fabric-network.yaml" (
    echo + Network config found
    set /a CHECKS_PASSED+=1
) else (
    echo X Network config missing: networks\fabric\fabric-network.yaml
    set /a CHECKS_FAILED+=1
)

echo Checking consent granting benchmark...
if exist "benchmarks\consent-management\consent-granting-benchmark.yaml" (
    echo + Consent granting benchmark found
    set /a CHECKS_PASSED+=1
) else (
    echo X Consent granting benchmark missing
    set /a CHECKS_FAILED+=1
)

echo Checking record access benchmark...
if exist "benchmarks\consent-management\record-access-benchmark.yaml" (
    echo + Record access benchmark found
    set /a CHECKS_PASSED+=1
) else (
    echo X Record access benchmark missing
    set /a CHECKS_FAILED+=1
)

echo Checking consent revocation benchmark...
if exist "benchmarks\consent-management\consent-revocation-benchmark.yaml" (
    echo + Consent revocation benchmark found
    set /a CHECKS_PASSED+=1
) else (
    echo X Consent revocation benchmark missing
    set /a CHECKS_FAILED+=1
)

echo Checking mixed workload benchmark...
if exist "benchmarks\consent-management\mixed-workload-benchmark.yaml" (
    echo + Mixed workload benchmark found
    set /a CHECKS_PASSED+=1
) else (
    echo X Mixed workload benchmark missing
    set /a CHECKS_FAILED+=1
)

echo.

REM Workload Modules
echo === Workload Modules ===

echo Checking consent granting workload...
if exist "workloads\consent-granting.js" (
    echo + Consent granting workload found
    set /a CHECKS_PASSED+=1
) else (
    echo X Consent granting workload missing
    set /a CHECKS_FAILED+=1
)

echo Checking record access workload...
if exist "workloads\record-access.js" (
    echo + Record access workload found
    set /a CHECKS_PASSED+=1
) else (
    echo X Record access workload missing
    set /a CHECKS_FAILED+=1
)

echo Checking consent revocation workload...
if exist "workloads\consent-revocation.js" (
    echo + Consent revocation workload found
    set /a CHECKS_PASSED+=1
) else (
    echo X Consent revocation workload missing
    set /a CHECKS_FAILED+=1
)

echo Checking mixed workload...
if exist "workloads\mixed-workload.js" (
    echo + Mixed workload found
    set /a CHECKS_PASSED+=1
) else (
    echo X Mixed workload missing
    set /a CHECKS_FAILED+=1
)

echo.

REM Execution Scripts
echo === Execution Scripts ===

echo Checking full benchmark script (Windows)...
if exist "run-benchmarks.bat" (
    echo + Full benchmark script found
    set /a CHECKS_PASSED+=1
) else (
    echo X Full benchmark script missing
    set /a CHECKS_FAILED+=1
)

echo Checking single benchmark script (Windows)...
if exist "run-single-benchmark.bat" (
    echo + Single benchmark script found
    set /a CHECKS_PASSED+=1
) else (
    echo X Single benchmark script missing
    set /a CHECKS_FAILED+=1
)

echo.

REM Dependencies
echo === Dependencies ===
if exist "package.json" (
    echo Checking npm dependencies...
    npm list >nul 2>&1
    if errorlevel 1 (
        echo ! Some dependencies missing - run 'npm install'
        set /a WARNINGS+=1
    ) else (
        echo + All dependencies installed
        set /a CHECKS_PASSED+=1
    )
) else (
    echo X package.json not found
    set /a CHECKS_FAILED+=1
)

echo.

REM Network Connectivity (Optional)
echo === Network Connectivity (Optional) ===

echo Checking Docker availability...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ! Docker not found - required for Fabric network
    set /a WARNINGS+=1
) else (
    echo + Docker found
    set /a CHECKS_PASSED+=1
    
    echo Checking for running Fabric containers...
    docker ps | findstr hyperledger >nul 2>&1
    if errorlevel 1 (
        echo ! No Hyperledger containers running - start your Fabric network
        set /a WARNINGS+=1
    ) else (
        echo + Hyperledger containers found
        set /a CHECKS_PASSED+=1
    )
)

echo.

REM Summary
echo === Verification Summary ===
echo Checks passed: %CHECKS_PASSED%
if %CHECKS_FAILED% gtr 0 (
    echo Checks failed: %CHECKS_FAILED%
)
if %WARNINGS% gtr 0 (
    echo Warnings: %WARNINGS%
)

echo.

if %CHECKS_FAILED% equ 0 (
    echo + Setup verification completed successfully!
    echo.
    echo Your environment appears ready for benchmark execution.
    echo.
    echo Next steps:
    echo 1. Ensure your Fabric network is running
    echo 2. Run benchmarks using:
    echo    - Full suite: run-benchmarks.bat
    echo    - Single test: run-single-benchmark.bat [type]
    echo 3. Review results in the generated reports
    
    pause
    exit /b 0
) else (
    echo X Setup verification found issues that need to be resolved.
    echo.
    echo Please address the failed checks above before running benchmarks.
    echo.
    echo Common solutions:
    echo - Install missing dependencies: npm install
    echo - Check file paths and project structure
    echo - Verify Node.js and npm versions
    echo - Ensure proper file permissions
    
    pause
    exit /b 1
)