param(
    [Parameter(Mandatory = $true)][string]$FixturesRoot,
    [string]$ArtifactsRoot,
    [string]$EditorExecutable,
    [string]$GraphFile,
    [string]$WorkspaceRoot,
    [ValidateSet('prepare-call', 'restore-call', 'reload-call', 'prepare-reference', 'restore-reference', 'reload-reference', 'provider-timeout', 'visual', 'accuracy', 'repository-accuracy', 'clarity', 'simulink', 'grouping', 'restore-grouping', 'group-refresh', 'cycles', 'restore-cycles', 'reload-cycles', 'cycles-refresh', 'cycles-calls')]
    [string[]]$Phases = @('prepare-call', 'restore-call', 'reload-call', 'prepare-reference', 'restore-reference', 'reload-reference', 'provider-timeout')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $EditorExecutable) { $EditorExecutable = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\VSCodium\VSCodium.exe' }
if (-not (Test-Path -LiteralPath $EditorExecutable)) { throw 'Specify the installed editor executable with -EditorExecutable.' }
if (-not $ArtifactsRoot) { $ArtifactsRoot = Join-Path $repositoryRoot '.tools\validation\0.3.6' }
$ArtifactsRoot = [System.IO.Path]::GetFullPath($ArtifactsRoot)
$FixturesRoot = [System.IO.Path]::GetFullPath($FixturesRoot)
if (-not $WorkspaceRoot) { $WorkspaceRoot = Join-Path $FixturesRoot 'project' }
$WorkspaceRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $FixturesRoot 'project\entry.m'))) {
    throw 'Prepare the host fixtures with createMatlabVizHostFixtures before running this script.'
}
New-Item -ItemType Directory -Path $ArtifactsRoot -Force | Out-Null
$environmentNames = @('ELECTRON_RUN_AS_NODE', 'MATLAB_VIZ_TEST_ARTIFACTS', 'MATLAB_VIZ_HOST_PROFILE',
    'MATLAB_VIZ_HOST_FIXTURES', 'MATLAB_VIZ_RESTORE_STAGE', 'MATLAB_VIZ_RESTORE_RUN_ID', 'MATLAB_VIZ_DEBUG_ENDPOINT', 'MATLAB_VIZ_TEST_GRAPH')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $env:MATLAB_VIZ_TEST_ARTIFACTS = $ArtifactsRoot
    # One fresh profile per suite, retained across every phase in that suite.
    # Reusing a failed run's editor layout makes the preparation non-deterministic.
    $env:MATLAB_VIZ_HOST_PROFILE = Join-Path $ArtifactsRoot ('persistent-profile-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $env:MATLAB_VIZ_HOST_FIXTURES = $FixturesRoot
    if ($GraphFile) { $env:MATLAB_VIZ_TEST_GRAPH = (Resolve-Path -LiteralPath $GraphFile).Path }
    foreach ($phase in $Phases) {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        $listener.Stop()
        $env:MATLAB_VIZ_DEBUG_ENDPOINT = "http://127.0.0.1:$port"
        $env:MATLAB_VIZ_RESTORE_STAGE = $phase
        $env:MATLAB_VIZ_RESTORE_RUN_ID = [guid]::NewGuid().ToString('N')
        $phaseStarted = [DateTime]::UtcNow
        $arguments = @('--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
            '--disable-extensions', "--remote-debugging-port=$port", "--user-data-dir=$env:MATLAB_VIZ_HOST_PROFILE",
            "--extensions-dir=$(Join-Path $ArtifactsRoot 'vscodium-extensions')", "--extensionDevelopmentPath=$repositoryRoot",
            "--extensionDevelopmentPath=$(Join-Path $repositoryRoot 'test\host\extension')",
            $WorkspaceRoot)
        $quotedArguments = @($arguments | ForEach-Object {
            if ($_.Contains('"')) { throw 'A test argument contains an unsupported quotation mark.' }
            '"' + $_ + '"'
        })
        Write-Output "Starting restoration phase: $phase"
        $testProcess = Start-Process -FilePath $EditorExecutable -ArgumentList $quotedArguments -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ArtifactsRoot "$phase-stdout.log") `
            -RedirectStandardError (Join-Path $ArtifactsRoot "$phase-stderr.log") -PassThru -Wait
        Write-Output "Phase $phase exit: $($testProcess.ExitCode)"
        if ($testProcess.ExitCode -ne 0) { throw "Restoration phase $phase failed with code $($testProcess.ExitCode)." }
        $resultPath = Join-Path $ArtifactsRoot "$phase-result.json"
        if (-not (Test-Path -LiteralPath $resultPath) -or (Get-Item -LiteralPath $resultPath).LastWriteTimeUtc -lt $phaseStarted.AddSeconds(-2)) {
            throw "Restoration phase $phase did not write a fresh result."
        }
        $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
        if (-not $result.passed) { throw "Restoration phase $phase failed: $($result.observations -join '; ')" }
    }
} finally {
    foreach ($name in $environmentNames) {
        if ($null -eq $previousEnvironment[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item -LiteralPath "Env:$name" -Value $previousEnvironment[$name] }
    }
}
