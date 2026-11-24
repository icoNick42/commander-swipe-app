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
#   4. Puts these in the Forge folder:
#        Play Forge.cmd    pauses the sims, opens Forge for you, resumes when you close it
#        Pause sims.cmd / Resume sims.cmd
#        Sim status.cmd    what the board is doing
#        Manafold.url      playmanafold.com
#   5. Starts the board now and at every logon (a shortcut in your Startup folder).
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Forge = "",
    [int]$Workers = 0
)
$ErrorActionPreference = "Stop"
function Say($m) { Write-Host "== $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "!! $m" -ForegroundColor Red; exit 1 }

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
$version = ($jar.Name -replace "forge-gui-desktop-", "" -replace "-jar-with-dependencies.jar", "")
Say "Forge $version at $Forge"

# tools
foreach ($t in @("git")) { if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Fail "$t isn't installed (git-scm.com)." } }
$py = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $py = (& py -3 -c "import sys; print(sys.executable)").Trim() }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $py = (& python -c "import sys; print(sys.executable)").Trim() }
if (-not $py) { Fail "Python 3 isn't installed (python.org, or 'winget install Python.Python.3.12')." }
$pyw = Join-Path (Split-Path $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) { $node = $node.Source } else { Write-Host "   Node isn't installed: sims run, but app-variant decks can only be built on a PC that has it." -ForegroundColor Yellow; $node = "node" }

# 2. the board
$board = "$Forge\board"
if (Test-Path "$board\.git") {
    Say "Updating $board"
    git -C $board pull --rebase --autostash -q
} else {
    Say "Cloning the sims branch into $board"
    git clone -q --branch sims --single-branch https://github.com/icoNick42/commander-swipe-app.git $board
    if ($LASTEXITCODE -ne 0) { Fail "git clone failed." }
}
git -C $board config user.name "Commander Swipe sims ($Name)"
git -C $board config user.email "sims-$Name@users.noreply.github.com"

# 3. machine.json
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
[IO.File]::WriteAllText("$board\machine.json", ($cfg | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
Say "machine.json: $Name, $Workers sims at once"

# 4. helper files
$jarName = $jar.Name
$play = @"
@echo off
rem Pauses the sims, opens Forge, and resumes the sims when you close Forge.
echo paused for play > "%~dp0board\PAUSE"
pushd "%~dp0app"
"..\jre\bin\java.exe" -Xmx4g -Dio.netty.tryReflectionSetAccessible=true -Dfile.encoding=UTF-8 -jar "$jarName"
popd
del "%~dp0board\PAUSE" 2>nul
"@
Set-Content -Path "$Forge\Play Forge.cmd" -Value $play -Encoding ASCII
Set-Content -Path "$Forge\Pause sims.cmd" -Value "@echo off`r`necho paused > ""%~dp0board\PAUSE""`r`necho Sims paused. Run Resume sims.cmd to start them again.`r`npause" -Encoding ASCII
Set-Content -Path "$Forge\Resume sims.cmd" -Value "@echo off`r`ndel ""%~dp0board\PAUSE"" 2>nul`r`necho Sims resumed.`r`npause" -Encoding ASCII
Set-Content -Path "$Forge\Sim status.cmd" -Value "@echo off`r`nif exist ""%~dp0board\PAUSE"" echo PAUSED`r`npowershell -NoProfile -Command ""Get-Content '%~dp0board\board.log' -Tail 25""`r`npause" -Encoding ASCII
Set-Content -Path "$Forge\Manafold.url" -Value "[InternetShortcut]`r`nURL=https://playmanafold.com/" -Encoding ASCII

# 5. start now and at logon
$startup = [Environment]::GetFolderPath("Startup")
$starter = "@echo off`r`nstart """" ""$pyw"" ""$board\run_board.py""`r`n"
Set-Content -Path "$startup\Commander Swipe sims.cmd" -Value $starter -Encoding ASCII
Start-Process -FilePath $pyw -ArgumentList "`"$board\run_board.py`"" -WorkingDirectory $board -WindowStyle Hidden
Say "Board started; it also starts at every logon."

# push access: the first push may open a GitHub sign-in window
Say "Checking that this PC can push results to GitHub (a sign-in window may open once)"
git -C $board push --dry-run -q origin sims
if ($LASTEXITCODE -ne 0) {
    Write-Host "!! This PC can't push to GitHub yet. Sims still run and keep results here; sign in to GitHub (GitHub Desktop, or run 'git -C ""$board"" push' once) and they'll upload." -ForegroundColor Yellow
} else { Say "Push works." }
Say "Done. Status any time: '$Forge\Sim status.cmd'. To play: '$Forge\Play Forge.cmd' or Manafold.url."
