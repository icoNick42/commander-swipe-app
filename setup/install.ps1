# Commander Swipe sims: one-time setup on a PC that already has Forge.
#
# Paste into PowerShell (no admin needed):
#   irm https://raw.githubusercontent.com/icoNick42/commander-swipe-app/sims/setup/install.ps1 -OutFile $env:TEMP\cs-sims.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\cs-sims.ps1 -Name desktop
# (use -Name laptop on the server laptop). Safe to run again: it updates.
#
# What it does:
#   1. Finds your Forge folder (D:\Claude\Forge, F:\Claude Files\Forge or
#      C:\Claude Files\Forge; or pass -Forge "path").
#   2. Clones the sims branch of your GitHub repo into <Forge>\board.
#   3. Writes board\machine.json (this PC's name, Java, Forge, how many sims at once).
#      A rerun keeps a "workers" number you changed by hand.
#   4. Checks this PC can push results to GitHub (a sign-in window may open once).
#   5. Puts these in the Forge folder:
#        Play Forge.cmd    pauses the sims, opens Forge for you, resumes when you close it
#        Pause sims.cmd / Resume sims.cmd
#        Sim status.cmd    what the board is doing
#        Manafold.url      playmanafold.com
#   6. Turns off sleep while plugged in (sims stop when a PC sleeps).
#   7. Starts the board now and at every sign-in (a shortcut in your Startup folder).
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Forge = "",
    [int]$Workers = 0
)
$ErrorActionPreference = "Stop"
$Name = $Name.ToLower()
function Say($m) { Write-Host "== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!! $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "!! $m" -ForegroundColor Red; exit 1 }
function WriteCmd($path, $text) {
    # .cmd files need Windows line endings
    [IO.File]::WriteAllText($path, ($text -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
}

# 1. Forge folder
if (-not $Forge) {
    foreach ($c in @("D:\Claude\Forge", "F:\Claude Files\Forge", "C:\Claude Files\Forge")) {
        if ((Test-Path "$c\app") -and (Test-Path "$c\jre\bin\java.exe")) { $Forge = $c; break }
    }
}
if (-not $Forge) { Fail "Couldn't find Forge (a folder with app\ and jre\). Run again with -Forge ""<path>""." }
$jar = Get-ChildItem "$Forge\app\forge-gui-desktop-*-jar-with-dependencies.jar" | Select-Object -First 1
if (-not $jar) { Fail "No forge-gui-desktop-*-jar-with-dependencies.jar in $Forge\app" }
$java = "$Forge\jre\bin\java.exe"
$javaw = "$Forge\jre\bin\javaw.exe"
$version = ($jar.Name -replace "forge-gui-desktop-", "" -replace "-jar-with-dependencies.jar", "")
Say "Forge $version at $Forge"

# tools
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git isn't installed (git-scm.com, or 'winget install Git.Git')." }
$py = $null
foreach ($try in @(@("py", "-3"), @("python"))) {
    if (Get-Command $try[0] -ErrorAction SilentlyContinue) {
        $args2 = @($try | Select-Object -Skip 1) + @("-c", "import sys; print(sys.executable)")
        try { $out = & $try[0] @args2 } catch { $out = $null }
        if ($LASTEXITCODE -eq 0 -and $out -and ("$out" -notmatch "WindowsApps")) { $py = "$out".Trim(); break }
    }
}
if (-not $py) { Fail "Python 3 isn't installed (python.org, or 'winget install Python.Python.3.12'). The Microsoft Store shortcut doesn't count." }
$pyw = Join-Path (Split-Path $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
if ($node) {
    $nodeMajor = [int]((& $node.Source -v) -replace "^v(\d+).*", '$1')
    if ($nodeMajor -lt 18) { Warn "Node $nodeMajor is too old for app variants (needs 18+)." }
    $node = $node.Source
} else {
    Warn "Node isn't installed: sims run, but app-variant decks are only built on a PC that has it."
    $node = "node"
}

# 2. the board
$board = "$Forge\board"
# Git refuses repos on drives that don't record file owners (exFAT external drives)
# or that another PC's account owns; mark this one as safe.
git config --global --add safe.directory ($board -replace "\\", "/")
if (Test-Path "$board\.git") {
    Say "Updating $board"
    git -C $board pull --rebase --autostash -q
    if ($LASTEXITCODE -ne 0) { Warn "git pull failed; the board retries by itself." }
} else {
    Say "Cloning the sims branch into $board"
    git clone -q --branch sims --single-branch https://github.com/icoNick42/commander-swipe-app.git $board
    if ($LASTEXITCODE -ne 0) { Fail "git clone failed." }
}
git -C $board config user.name "Commander Swipe sims ($Name)"
git -C $board config user.email "sims-$Name@users.noreply.github.com"
if ($LASTEXITCODE -ne 0) { Fail "git can't use $board (see the message above)." }

# 3. machine.json (keeps a hand-set workers number)
$cfgPath = "$board\machine.json"
if ($Workers -le 0 -and (Test-Path $cfgPath)) {
    try { $Workers = [int]((Get-Content $cfgPath -Raw | ConvertFrom-Json).workers) } catch { $Workers = 0 }
}
if ($Workers -le 0) {
    $cores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
    $ram = [math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $Workers = [math]::Max(1, [math]::Min($cores - 1, [math]::Floor(($ram - 3) / 3)))
}
$cfg = [ordered]@{
    name     = $Name
    workers  = $Workers
    node     = $node
    push     = $true
    work_dir = "$Forge\sim-work"
    forge    = [ordered]@{ java = $java; jar = $jar.FullName; cwd = "$Forge\app"; mem = "3g"; version = $version; gui_decks = "$Forge\userdata\decks\commander" }
}
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
Say "machine.json: $Name, $Workers sims at once"

# 4. push access, before the board starts (so only one sign-in prompt)
Say "Checking that this PC can push results to GitHub (a sign-in window may open once)"
git -C $board push --dry-run -q origin sims
if ($LASTEXITCODE -ne 0) {
    Warn "This PC can't push to GitHub yet. Sims still run and keep results here; sign in to GitHub (GitHub Desktop, or run: git -C ""$board"" push) and they'll upload."
} else { Say "Push works." }

# 5. helper files
$jarName = $jar.Name
WriteCmd "$Forge\Play Forge.cmd" @"
@echo off
rem Pauses the sims, opens Forge, and resumes the sims when you close Forge.
rem (If Forge crashes, the board ignores this pause after 8 hours.)
echo play > "%~dp0board\PAUSE"
cd /d "%~dp0app"
start "" /wait "%~dp0jre\bin\javaw.exe" -Xmx4g -Dio.netty.tryReflectionSetAccessible=true -Dfile.encoding=UTF-8 -jar "$jarName"
del "%~dp0board\PAUSE" 2>nul
"@
WriteCmd "$Forge\Pause sims.cmd" @"
@echo off
echo paused > "%~dp0board\PAUSE"
echo Sims paused. Run Resume sims.cmd to start them again.
pause
"@
WriteCmd "$Forge\Resume sims.cmd" @"
@echo off
del "%~dp0board\PAUSE" 2>nul
echo Sims resumed.
pause
"@
WriteCmd "$Forge\Sim status.cmd" @"
@echo off
if exist "%~dp0board\PAUSE" echo PAUSED
powershell -NoProfile -Command "Get-Content '%~dp0board\board.log' -Tail 25"
pause
"@
WriteCmd "$Forge\Manafold.url" @"
[InternetShortcut]
URL=https://playmanafold.com/
"@

# 6. no sleep on AC power (the board also asks Windows to stay awake while sims run)
try { powercfg /change standby-timeout-ac 0 } catch { }
if ($LASTEXITCODE -eq 0) { Say "Sleep on AC power: off" } else { Warn "Couldn't turn off sleep; set Sleep to Never (plugged in) in Settings > Power." }
Warn "Laptop: set 'When I close the lid' (plugged in) to 'Do nothing' in Control Panel > Power Options, or keep it open."

# 7. start now and at sign-in
$startup = [Environment]::GetFolderPath("Startup")
WriteCmd "$startup\Commander Swipe sims.cmd" @"
@echo off
start "" "$pyw" "$board\run_board.py"
"@
Start-Process -FilePath $pyw -ArgumentList "`"$board\run_board.py`"" -WorkingDirectory $board -WindowStyle Hidden
Say "Board started (if it was already running, the running copy stays and picks up new code by itself)."
Say "Done. Status: '$Forge\Sim status.cmd'. To play: '$Forge\Play Forge.cmd' or Manafold.url."
Warn "After a Windows Update restart the board waits until someone signs in."
