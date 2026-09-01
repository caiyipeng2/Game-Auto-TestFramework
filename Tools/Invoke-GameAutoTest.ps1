[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tsxPath = Join-Path $repositoryRoot "node_modules\.bin\tsx.cmd"
$entryPoint = Join-Path $repositoryRoot "cli\src\main.ts"

if (-not (Test-Path -LiteralPath $tsxPath)) {
    throw "tsx is not installed. Run npm install in $repositoryRoot first."
}

if (-not (Test-Path -LiteralPath $entryPoint)) {
    throw "CLI entry point was not found: $entryPoint"
}

& $tsxPath $entryPoint @Arguments
exit $LASTEXITCODE
