#Requires -Version 7
# Run by build-win-tauri-<arch>.ps1, which gives the CPU the installer is for. The build itself is on a x64 machine for both: Rust and the
# MSVC tools build for the other CPU as well (a cross build), and the NSIS installer is made the same way for each. The result is checked: the
# program inside has to be for the CPU asked for.
param(
  [Parameter(Mandatory)][ValidateSet("x86_64", "aarch64")][string]$Arch,
  [string]$Version,
  [string]$ReleaseDir,
  [switch]$Check,
  [switch]$SkipSetup
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$out = if ($env:OHM_OUT) { $env:OHM_OUT } else { Join-Path $root "build-out" }
$tools = if ($env:OHM_TOOLS) { $env:OHM_TOOLS } else { Join-Path $HOME ".ohmatrix-tools" }
if (-not $ReleaseDir) { $ReleaseDir = if ($env:OHM_RELEASE_DIR) { $env:OHM_RELEASE_DIR } else { Join-Path $HOME "release" } }

function Step($text) { [Console]::Error.WriteLine("`n==> $text [$(Get-Date -Format HH:mm:ss)]") }
function Ok($text) { [Console]::Error.WriteLine("  ok       $text") }
function Note($text) { [Console]::Error.WriteLine("  ..       $text") }
function Warn($text) { [Console]::Error.WriteLine("  warning  $text") }
function Die($text) { [Console]::Error.WriteLine("  error    $text"); exit 1 }
$missing = 0
function Missing($text) { $script:missing++; [Console]::Error.WriteLine("  missing  $text") }
function Have($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function AddPath($dir) { if (Test-Path $dir) { $env:PATH = "$dir$([IO.Path]::PathSeparator)$env:PATH" } }

# The versions are the ones of lib/versions.sh (one place for them).
$pinned = @{}
foreach ($line in Get-Content (Join-Path $PSScriptRoot "versions.sh")) {
  if ($line -match '^([A-Z_]+)=([^\s#]+)') { $pinned[$Matches[1]] = $Matches[2] }
}
foreach ($k in "NODE_VERSION", "NODE_MIN_MAJOR", "PNPM_VERSION", "RUST_TOOLCHAIN") { if (-not $pinned[$k]) { Die "$k is not in lib/versions.sh" } }

if (-not $IsWindows) { Die "this builds the Windows installer and must run on Windows (this is $([Environment]::OSVersion.Platform))" }
if (-not $Check) {
  if (-not $Version) { Die "-Version is needed (like -Version 1.2.3)" }
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { Die "the version must look like 1.2.3, not '$Version'" }
}
$triple = @{ x86_64 = "x86_64-pc-windows-msvc"; aarch64 = "aarch64-pc-windows-msvc" }[$Arch]
$machine = @{ x86_64 = 0x8664; aarch64 = 0xAA64 }[$Arch] # the CPU field of a program's header
$hostCpu = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$hostTriple = if ($hostCpu -eq "arm64") { "aarch64-pc-windows-msvc" } else { "x86_64-pc-windows-msvc" }
New-Item -ItemType Directory -Force $out, $tools | Out-Null

# Visual Studio's C++ tools: Rust links with them. A cross build for ARM64 needs the ARM64 ones as well.
function Find-VisualStudio([string]$component) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio/Installer/vswhere.exe"
  if (-not (Test-Path $vswhere)) { return $null }
  $found = & $vswhere -latest -products * -requires $component -property installationPath
  if ($found) { return ($found | Select-Object -First 1) }
  return $null
}
$msvcComponents = @("Microsoft.VisualStudio.Component.VC.Tools.x86.x64")
if ($Arch -eq "aarch64") { $msvcComponents += "Microsoft.VisualStudio.Component.VC.Tools.ARM64" }

Step "resources"
Note "building for $Arch ($triple) on a $hostCpu machine; the build output goes to $out"

Step "tools"
if (-not $SkipSetup) { AddPath (Join-Path $tools "node"); AddPath (Join-Path $tools "pnpm") }
AddPath (Join-Path $HOME ".cargo/bin")
$env:PNPM_HOME = Join-Path $tools "pnpm"

# Node: one that is installed and new enough is reused, or the pinned one is unpacked into the tools folder.
$nodeMajor = if (Have node) { [int](((node -v) -replace '^v', '').Split('.')[0]) } else { 0 }
if ($nodeMajor -ge [int]$pinned.NODE_MIN_MAJOR) { Ok "node $(node -v)" }
elseif ($SkipSetup -or $Check) { Missing "node $($pinned.NODE_MIN_MAJOR) or newer" }
else {
  $zip = Join-Path $tools "node.zip"; $name = "node-v$($pinned.NODE_VERSION)-win-$hostCpu"
  Invoke-WebRequest "https://nodejs.org/dist/v$($pinned.NODE_VERSION)/$name.zip" -OutFile $zip -UseBasicParsing
  Remove-Item (Join-Path $tools "node") -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $zip $tools -Force; Rename-Item (Join-Path $tools $name) (Join-Path $tools "node"); Remove-Item $zip
  AddPath (Join-Path $tools "node"); Ok "node $(node -v) (in $tools)"
}

# pnpm: the pinned version, from npm into the tools folder when the installed one is another.
$pnpmNow = if (Have pnpm) { (pnpm -v) } else { "" }
if ($pnpmNow -eq $pinned.PNPM_VERSION) { Ok "pnpm $pnpmNow" }
elseif ($SkipSetup -or $Check) { if ($pnpmNow) { Note "pnpm $pnpmNow is installed, $($pinned.PNPM_VERSION) is the pinned one" } else { Missing "pnpm $($pinned.PNPM_VERSION)" } }
elseif (Have node) {
  npm install -g "pnpm@$($pinned.PNPM_VERSION)" --prefix (Join-Path $tools "pnpm") --no-audit --no-fund | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "could not install pnpm" }
  AddPath (Join-Path $tools "pnpm"); Ok "pnpm $(pnpm -v) (in $tools)"
}

# Rust: the pinned toolchain, with the standard library of the CPU asked for.
if (-not (Have rustup)) {
  if ($SkipSetup -or $Check) { Missing "rustup" }
  else {
    $init = Join-Path $tools "rustup-init.exe"
    Invoke-WebRequest "https://static.rust-lang.org/rustup/dist/$hostTriple/rustup-init.exe" -OutFile $init -UseBasicParsing
    & $init -y --default-toolchain none --profile minimal --no-modify-path
    if ($LASTEXITCODE -ne 0) { Die "could not install rustup" }
    AddPath (Join-Path $HOME ".cargo/bin")
  }
}
if (Have rustup) {
  $installed = (rustup toolchain list) -join "`n"
  $targets = if ($installed -match [regex]::Escape($pinned.RUST_TOOLCHAIN)) { (rustup target list --installed --toolchain $pinned.RUST_TOOLCHAIN) -join "`n" } else { "" }
  if ($targets -match [regex]::Escape($triple)) { Ok "rust $($pinned.RUST_TOOLCHAIN) for $triple" }
  elseif ($SkipSetup -or $Check) { Missing "rust $($pinned.RUST_TOOLCHAIN) with the target $triple" }
  else {
    rustup toolchain install $pinned.RUST_TOOLCHAIN --profile minimal --target $triple --no-self-update
    if ($LASTEXITCODE -ne 0) { Die "could not install the Rust toolchain" }
    Ok "rust $($pinned.RUST_TOOLCHAIN) for $triple"
  }
}

foreach ($component in $msvcComponents) {
  $at = Find-VisualStudio $component
  if ($at) { Ok "Visual Studio C++ tools ($($component.Split('.')[-1])) in $at"; continue }
  if ($SkipSetup -or $Check) { Missing "the Visual Studio component $component"; continue }
  # With no ARM64 tools the cross build cannot link: they are added to the Visual Studio there is (it takes a few minutes).
  $any = Find-VisualStudio "Microsoft.VisualStudio.Component.VC.Tools.x86.x64"
  $installer = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio/Installer/setup.exe"
  if (-not $any -or -not (Test-Path $installer)) { Die "Visual Studio with the C++ tools is needed (the workload 'Desktop development with C++'); $component is missing" }
  Note "adding $component to Visual Studio"
  $p = Start-Process $installer -ArgumentList "modify", "--installPath", "`"$any`"", "--add", $component, "--quiet", "--norestart", "--noUpdateInstaller" -Wait -PassThru
  if ($p.ExitCode -notin 0, 3010) { Die "Visual Studio did not add $component (exit code $($p.ExitCode))" }
  if (-not (Find-VisualStudio $component)) { Die "$component is still missing after the installer ran" }
  Ok "added $component"
}

if ($Check) {
  Step "result"
  if ($missing -eq 0) { Ok "everything is in place"; exit 0 }
  [Console]::Error.WriteLine("  $missing thing(s) missing: run without -Check to install them")
  exit 1
}
if ($missing -gt 0) { Die "$missing thing(s) missing (run without -SkipSetup to install them)" }
foreach ($tool in "node", "pnpm", "cargo") { if (-not (Have $tool)) { Die "$tool is needed (run without -SkipSetup)" } }

function Run([string]$label, [scriptblock]$block) {
  Step $label
  $global:LASTEXITCODE = 0
  & $block
  if ($LASTEXITCODE -ne 0) { Die "$label failed (exit code $LASTEXITCODE)" }
}

Set-Location $root
# CI=true, not 1: the tauri command line takes only true or false.
$env:CI = "true"
$env:RUSTUP_TOOLCHAIN = $pinned.RUST_TOOLCHAIN
$env:CARGO_TARGET_DIR = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $out "cargo-target-win-tauri" }
# The version goes into the installer (tauri's own setting) and into the JavaScript (Settings shows it).
$env:VITE_APP_VERSION = $Version
$config = Join-Path $out "tauri-version.json"
Set-Content -Path $config -Value "{`"version`":`"$Version`"}" -Encoding ascii

Run "install dependencies" { pnpm install --frozen-lockfile --filter '@ohmatrix/tauri...' }
Run "app icon from logo/colorful/1.svg" { pnpm --filter '@ohmatrix/tauri' icons }
Run "Tauri build ($Arch, nsis)" { pnpm --filter '@ohmatrix/tauri' exec tauri build --target $triple --bundles nsis --config $config }

Step "collect the result"
$built = Get-ChildItem (Join-Path $env:CARGO_TARGET_DIR "$triple/release/bundle/nsis") -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $built) { Die "tauri finished but there is no installer in $env:CARGO_TARGET_DIR/$triple/release/bundle/nsis" }
if ($built.Name -notlike "*$Version*") { Die "$($built.Name) does not carry the version $Version" }

# The program the installer puts in place has to be for the CPU asked for (its header says which: a PE file's machine field).
$exe = Join-Path $env:CARGO_TARGET_DIR "$triple/release/ohmatrix-tauri.exe"
$bytes = [IO.File]::ReadAllBytes($exe)
$cpu = [BitConverter]::ToUInt16($bytes, [BitConverter]::ToInt32($bytes, 0x3C) + 4)
if ($cpu -ne $machine) { Die ("ohmatrix-tauri.exe is for CPU 0x{0:X4}, not for $Arch (0x{1:X4})" -f $cpu, $machine) }
Ok "ohmatrix-tauri.exe is a $Arch program"

$dir = Join-Path $ReleaseDir "win_tauri"
New-Item -ItemType Directory -Force $dir | Out-Null
$target = Join-Path $dir "OhMatrix_win_tauri_${Version}_$Arch.exe"
Copy-Item $built.FullName $target -Force
Ok ("{0} ({1:N1} MB, sha256 {2})" -f $target, ((Get-Item $target).Length / 1MB), (Get-FileHash $target -Algorithm SHA256).Hash.ToLower())
Step "done"
exit 0
