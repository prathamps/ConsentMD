#Requires -Version 5.1

<#
.SYNOPSIS
    PowerShell script for running blockchain performance benchmarks
    
.DESCRIPTION
    Provides comprehensive benchmark execution with parameter validation,
    environment checking, and enhanced logging for Windows environments.
    
.PARAMETER Command
    The benchmark command to execute (run, suite, list, help)
    
.PARAMETER Config
    The benchmark configuration name or suite name
    
.PARAMETER Workers
    Number of workers to use (1-20)
    
.PARAMETER TPS
    Target transactions per second (1-1000)
    
.PARAMETER ReportName
    Custom name for the benchmark report
    
.PARAMETER StopOnError
    Stop suite execution on first error
    
.PARAMETER Verbose
    Enable verbose logging
    
.EXAMPLE
    .\Run-Benchmark.ps1 -Command run -Config light
    
.EXAMPLE
    .\Run-Benchmark.ps1 -Command run -Config heavy -Workers 5 -TPS 50
    
.EXAMPLE
    .\Run-Benchmark.ps1 -Command suite -Config load-testing -StopOnError
    
.EXAMPLE
    .\Run-Benchmark.ps1 -Command list
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet('run', 'suite', 'list', 'help')]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$Config,
    
    [Parameter()]
    [ValidateRange(1, 20)]
    [int]$Workers,
    
    [Parameter()]
    [ValidateRange(1, 1000)]
    [int]$TPS,
    
    [Parameter()]
    [string]$ReportName,
    
    [Parameter()]
    [switch]$StopOnError,
    
    [Parameter()]
    [switch]$Verbose
)

# Set error action preference
$ErrorActionPreference = 'Stop'

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..\..') | Select-Object -ExpandProperty Path
$NodeScript = Join-Path $ScriptDir 'runBenchmark.js'

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Warning', 'Error', 'Success')]
        [string]$Level = 'Info'
    )
    
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $color = switch ($Level) {
        'Info' { 'White' }
        'Warning' { 'Yellow' }
        'Error' { 'Red' }
        'Success' { 'Green' }
    }
    
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
}

function Test-Prerequisites {
    Write-Log "Checking prerequisites..." -Level Info
    
    # Check Node.js
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js not found"
        }
        Write-Log "Node.js version: $nodeVersion" -Level Success
    }
    catch {
        Write-Log "Node.js is not installed or not in PATH. Please install Node.js 14 or higher." -Level Error
        exit 1
    }
    
    # Check if Node.js script exists
    if (-not (Test-Path $NodeScript)) {
        Write-Log "runBenchmark.js not found at $NodeScript" -Level Error
        exit 1
    }
    
    # Check if project root exists
    if (-not (Test-Path $ProjectRoot)) {
        Write-Log "Project root not found at $ProjectRoot" -Level Error
        exit 1
    }
    
    Write-Log "Prerequisites check completed successfully" -Level Success
}

function Build-NodeArguments {
    $nodeArgs = @($Command)
    
    if ($Config) {
        $nodeArgs += $Config
    }
    
    if ($Workers) {
        $nodeArgs += '--workers', $Workers
    }
    
    if ($TPS) {
        $nodeArgs += '--tps', $TPS
    }
    
    if ($ReportName) {
        $nodeArgs += '--report-name', $ReportName
    }
    
    if ($StopOnError) {
        $nodeArgs += '--stop-on-error'
    }
    
    return $nodeArgs
}

function Invoke-BenchmarkScript {
    param([string[]]$Arguments)
    
    Write-Log "Executing benchmark with arguments: $($Arguments -join ' ')" -Level Info
    
    try {
        # Change to project root
        Push-Location $ProjectRoot
        
        # Execute Node.js script
        $process = Start-Process -FilePath 'node' -ArgumentList @($NodeScript) + $Arguments -NoNewWindow -PassThru -Wait
        
        if ($process.ExitCode -eq 0) {
            Write-Log "Benchmark execution completed successfully" -Level Success
        } else {
            Write-Log "Benchmark execution failed with exit code: $($process.ExitCode)" -Level Error
            exit $process.ExitCode
        }
    }
    catch {
        Write-Log "Error executing benchmark: $($_.Exception.Message)" -Level Error
        exit 1
    }
    finally {
        Pop-Location
    }
}

function Show-Help {
    Write-Host @"

Blockchain Performance Benchmark Runner (PowerShell)

Usage:
  .\Run-Benchmark.ps1 -Command <command> [-Config <config>] [options]

Commands:
  run                    Run a single benchmark configuration
  suite                  Run a benchmark suite
  list                   List available configurations and suites
  help                   Show this help message

Parameters:
  -Config <name>         Configuration or suite name
  -Workers <number>      Number of workers (1-20)
  -TPS <number>          Target TPS (1-1000)
  -ReportName <name>     Custom report name
  -StopOnError           Stop suite execution on first error
  -Verbose               Enable verbose logging

Examples:
  .\Run-Benchmark.ps1 -Command run -Config light
  .\Run-Benchmark.ps1 -Command run -Config heavy -Workers 5 -TPS 50
  .\Run-Benchmark.ps1 -Command suite -Config load-testing -StopOnError
  .\Run-Benchmark.ps1 -Command list

"@ -ForegroundColor Cyan
}

# Main execution
try {
    Write-Log "Starting Blockchain Performance Benchmark Runner" -Level Info
    Write-Log "Project Root: $ProjectRoot" -Level Info
    
    if ($Command -eq 'help') {
        Show-Help
        exit 0
    }
    
    # Validate required parameters
    if ($Command -in @('run', 'suite') -and -not $Config) {
        Write-Log "Configuration name is required for '$Command' command" -Level Error
        Show-Help
        exit 1
    }
    
    # Check prerequisites
    Test-Prerequisites
    
    # Build arguments and execute
    $nodeArgs = Build-NodeArguments
    Invoke-BenchmarkScript -Arguments $nodeArgs
    
    Write-Log "Benchmark runner completed successfully" -Level Success
}
catch {
    Write-Log "Unexpected error: $($_.Exception.Message)" -Level Error
    if ($Verbose) {
        Write-Log "Stack trace: $($_.ScriptStackTrace)" -Level Error
    }
    exit 1
}