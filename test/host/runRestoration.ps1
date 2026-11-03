param(
    [Parameter(Mandatory = $true)][string]$FixturesRoot,
    [string]$ArtifactsRoot,
    [string]$EditorExecutable,
    [string]$GraphFile,
    [string]$WorkspaceRoot,
    [string]$PackagedVsix,
    [string]$MatlabExecutable,
    [ValidateSet('prepare-call', 'restore-call', 'reload-call', 'prepare-reference', 'restore-reference', 'reload-reference', 'provider-timeout', 'visual', 'accuracy', 'repository-accuracy', 'clarity', 'simulink', 'grouping', 'restore-grouping', 'group-refresh', 'cycles', 'restore-cycles', 'reload-cycles', 'cycles-refresh', 'cycles-calls', 'reports', 'restore-reports', 'reload-reports', 'reports-repository', 'impact-reports', 'restore-impact-reports', 'reload-impact-reports', 'prepare-comparison', 'compare-analyses', 'restore-comparison', 'reload-comparison')]
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
    'MATLAB_VIZ_HOST_FIXTURES', 'MATLAB_VIZ_RESTORE_STAGE', 'MATLAB_VIZ_RESTORE_RUN_ID', 'MATLAB_VIZ_DEBUG_ENDPOINT', 'MATLAB_VIZ_TEST_GRAPH',
    'MATLAB_VIZ_INSTALLED_ROOT', 'MATLAB_VIZ_TEST_EXECUTABLE')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $env:MATLAB_VIZ_TEST_ARTIFACTS = $ArtifactsRoot
    # One fresh profile per suite, retained across every phase in that suite.
    # Reusing a failed run's editor layout makes the preparation non-deterministic.
    $env:MATLAB_VIZ_HOST_PROFILE = Join-Path $ArtifactsRoot ('persistent-profile-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    $env:MATLAB_VIZ_HOST_FIXTURES = $FixturesRoot
    if ($MatlabExecutable) { $env:MATLAB_VIZ_TEST_EXECUTABLE = (Resolve-Path -LiteralPath $MatlabExecutable).Path }
    $privateExtensions = Join-Path $ArtifactsRoot 'vscodium-extensions'
    if ($PackagedVsix) {
        # Install the immutable release into this suite's private directory. The
        # production extension must NOT also be loaded as a development path:
        # otherwise a passing test could accidentally exercise source output.
        $resolvedVsix = (Resolve-Path -LiteralPath $PackagedVsix).Path
        # Electron's GUI executable does not interpret CLI install switches by
        # itself. Use its bundled CLI entry point in Node mode, as codium.cmd does.
        $cliEntry = Join-Path (Split-Path -Parent $EditorExecutable) 'resources\app\out\cli.js'
        if (-not (Test-Path -LiteralPath $cliEntry)) { throw 'Editor CLI entry point is missing.' }
        $installArguments = @($cliEntry, '--install-extension', $resolvedVsix, '--user-data-dir', $env:MATLAB_VIZ_HOST_PROFILE,
            '--extensions-dir', $privateExtensions, '--force')
        $installQuoted = @($installArguments | ForEach-Object {
            if ($_.Contains('"')) { throw 'An install argument contains an unsupported quotation mark.' }
            '"' + $_ + '"'
        })
        $env:ELECTRON_RUN_AS_NODE = '1'
        try {
            $installation = Start-Process -FilePath $EditorExecutable -ArgumentList $installQuoted -WindowStyle Hidden `
                -RedirectStandardOutput (Join-Path $ArtifactsRoot 'install-stdout.log') `
                -RedirectStandardError (Join-Path $ArtifactsRoot 'install-stderr.log') -PassThru -Wait
        } finally { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
        if ($installation.ExitCode -ne 0) { throw "Private VSIX installation failed: $($installation.ExitCode)" }
        $env:MATLAB_VIZ_INSTALLED_ROOT = $privateExtensions
    } else { Remove-Item Env:MATLAB_VIZ_INSTALLED_ROOT -ErrorAction SilentlyContinue }
    if ($GraphFile) { $env:MATLAB_VIZ_TEST_GRAPH = (Resolve-Path -LiteralPath $GraphFile).Path }
    elseif ($PackagedVsix -and $Phases -contains 'grouping') {
        # Large saved-graph evidence is test input, deliberately not a VSIX
        # payload. Pass it explicitly rather than looking inside the install.
        $env:MATLAB_VIZ_TEST_GRAPH = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot '.tools\validation\0.3.5\west-control-fresh.json')).Path
    } else { Remove-Item Env:MATLAB_VIZ_TEST_GRAPH -ErrorAction SilentlyContinue }
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
            "--remote-debugging-port=$port", "--user-data-dir=$env:MATLAB_VIZ_HOST_PROFILE",
            "--extensions-dir=$privateExtensions",
            "--extensionDevelopmentPath=$(Join-Path $repositoryRoot 'test\host\extension')",
            $WorkspaceRoot)
        if (-not $PackagedVsix) { $arguments += @('--disable-extensions', "--extensionDevelopmentPath=$repositoryRoot") }
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
        if ($PackagedVsix) {
            $contractPath = Join-Path $ArtifactsRoot "$phase-installed-contract.json"
            if (-not (Test-Path -LiteralPath $contractPath) -or (Get-Item -LiteralPath $contractPath).LastWriteTimeUtc -lt $phaseStarted.AddSeconds(-2)) {
                throw "Phase $phase did not validate the installed package contract."
            }
            if (-not (Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json).passed) { throw 'Installed-package contract failed.' }
        }
    }
} finally {
    foreach ($name in $environmentNames) {
        if ($null -eq $previousEnvironment[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item -LiteralPath "Env:$name" -Value $previousEnvironment[$name] }
    }
}
