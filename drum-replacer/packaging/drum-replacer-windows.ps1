# Drum Replacer for Windows: installs the VST3 plugin and keeps it up to date.
#
#   Install: open PowerShell as administrator (right-click Start > "Terminal (Admin)"), then paste:
#     irm https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer/drum-replacer-windows.ps1 | iex
#
#   The installer adds a background task that runs this script with "update" every 10 minutes.
#   New builds are downloaded right away and installed as soon as Ableton is closed.
#   Uninstall (as administrator):  & "C:\Program Files\Drum Replacer\update.ps1" uninstall
#
# Everything runs inside this block so nothing leaks into your PowerShell session.
& {
    $Mode = if ($args.Count -gt 0) { [string] $args[0] } else { "install" }

    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue" # makes downloads much faster in Windows PowerShell
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $Base = "https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer"
    $ProgramDir = Join-Path $env:ProgramFiles "Drum Replacer"   # the updater itself (only admins can change it)
    $DataDir = Join-Path $env:ProgramData "Drum Replacer"       # version files and log (the plugin reads these)
    $Vst3Dir = Join-Path $env:CommonProgramFiles "VST3"
    $Plugin = Join-Path $Vst3Dir "Drum Replacer.vst3"
    $Updater = Join-Path $ProgramDir "update.ps1"
    $Staging = Join-Path $DataDir "download"
    $TaskName = "Drum Replacer updater"

    function Log([string] $Message) {
        try { Add-Content -Path (Join-Path $DataDir "update.log") -Value "$(Get-Date -Format s) $Message" } catch {}
        if ($Mode -ne "update") { Write-Host $Message }
    }

    function Read-Version([string] $File) {
        if (Test-Path $File) { return (Get-Content $File -Raw).Trim() }
        return "0.0.0"
    }

    function Test-Admin {
        $identity = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
        return $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }

    # Returns "installed", "waiting" (Ableton is open), "current" or "failed".
    function Install-OrUpdate([bool] $Force) {
        New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
        $installedFile = Join-Path $DataDir "installed-version.txt"
        $pendingFile = Join-Path $DataDir "pending-version.txt"

        try {
            $versionFile = Join-Path $DataDir "latest-version.txt"
            Invoke-WebRequest -Uri "$Base/version.txt" -OutFile $versionFile -UseBasicParsing
            $latest = (Get-Content $versionFile -Raw).Trim()
            $null = [version] $latest
        } catch {
            Log "Couldn't reach GitHub to check for updates: $($_.Exception.Message)"
            return "failed"
        }

        if (-not $Force -and [version] $latest -le [version] (Read-Version $installedFile)) { return "current" }

        # Download (once per version) into a staging folder.
        if ((Read-Version (Join-Path $Staging "version.txt")) -ne $latest) {
            Log "Downloading Drum Replacer $latest..."
            try {
                Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
                New-Item -ItemType Directory -Force -Path $Staging | Out-Null
                Invoke-WebRequest -Uri "$Base/DrumReplacer-Windows.zip" -OutFile (Join-Path $Staging "plugin.zip") -UseBasicParsing
                Expand-Archive -Path (Join-Path $Staging "plugin.zip") -DestinationPath (Join-Path $Staging "files") -Force
                Set-Content -Path (Join-Path $Staging "version.txt") -Value $latest
                Set-Content -Path $pendingFile -Value $latest
            } catch {
                Log "Download failed, will try again later: $($_.Exception.Message)"
                Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
                return "failed"
            }
        }

        # Windows won't let us replace the plugin while Ableton has it open.
        if (Get-Process -Name "Ableton Live*" -ErrorAction SilentlyContinue) {
            Log "Drum Replacer $latest is downloaded and will be installed once Ableton is closed."
            return "waiting"
        }

        try {
            New-Item -ItemType Directory -Force -Path $Vst3Dir | Out-Null
            if (Test-Path $Plugin) { Remove-Item $Plugin -Recurse -Force }
            Copy-Item -Path (Join-Path $Staging "files\Drum Replacer.vst3") -Destination $Plugin -Recurse -Force
            New-Item -ItemType Directory -Force -Path $ProgramDir | Out-Null
            Copy-Item -Path (Join-Path $Staging "files\drum-replacer-windows.ps1") -Destination $Updater -Force
        } catch {
            Log "Couldn't install (will try again later): $($_.Exception.Message)"
            return "failed"
        }

        Set-Content -Path $installedFile -Value $latest
        Remove-Item $pendingFile -Force -ErrorAction SilentlyContinue
        Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
        Log "Installed Drum Replacer $latest."
        return "installed"
    }

    function Register-Updater {
        $action = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Updater`" update"
        $triggers = @(
            (New-ScheduledTaskTrigger -AtStartup),
            (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10))
        )
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Principal $principal `
            -Settings $settings -Description "Keeps the Drum Replacer plugin up to date." -Force | Out-Null
    }

    switch ($Mode) {
        "install" {
            if (-not (Test-Admin)) {
                Write-Host "Please run this in PowerShell as administrator: right-click Start > 'Terminal (Admin)', then paste the line again."
                return
            }
            $result = Install-OrUpdate $true
            if ($result -eq "failed") {
                Write-Host "Something went wrong (see above). Nothing was changed; please try again."
                return
            }
            if (-not (Test-Path $Updater)) {
                # Ableton is open so nothing was installed yet: put the updater in place from the download.
                New-Item -ItemType Directory -Force -Path $ProgramDir | Out-Null
                Copy-Item -Path (Join-Path $Staging "files\drum-replacer-windows.ps1") -Destination $Updater -Force
            }
            Register-Updater
            Write-Host ""
            if ($result -eq "waiting") {
                Write-Host "Almost done: close Ableton and Drum Replacer installs itself within 10 minutes."
            } else {
                Write-Host "Done! Drum Replacer is installed and will keep itself up to date."
            }
            Write-Host "In Ableton: Options > Settings (or Preferences) > Plug-Ins > turn on 'Use VST3 Plug-in System Folder',"
            Write-Host "click Rescan, then search the browser for Drum Replacer."
        }
        "update" {
            try { $null = Install-OrUpdate $false } catch { Log "Update failed: $($_.Exception.Message)" }
        }
        "uninstall" {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
            Remove-Item $Plugin -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $DataDir -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $ProgramDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Drum Replacer and its updater are removed."
        }
        default {
            Write-Host "Usage: update.ps1 [install|update|uninstall]"
        }
    }
} @args
