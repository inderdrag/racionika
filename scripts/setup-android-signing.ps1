# Run locally on your Windows PC, never inside a public workflow.
# Requires JDK 21 (keytool), GitHub CLI (gh), and gh auth login.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository = 'inderdrag/racionika',
    [string]$KeyDirectory = (Join-Path $env:USERPROFILE '.racionika-signing')
)
$ErrorActionPreference = 'Stop'
$oldEncoding = $OutputEncoding
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$plain = $null
$certFile = $null
function Invoke-GhInput([string]$Value, [string[]]$Arguments) {
    # Exact stdin: no shell argument containing a secret and no extra newline.
    # Arguments contain only fixed CLI words, secret names and the validated repo.
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = (Get-Command gh).Source
    $start.Arguments = $Arguments -join ' '
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    try {
        $null = $process.Start()
        $process.StandardInput.Write($Value)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'GitHub update failed. Keep the same local keystore and retry; do not generate a replacement.' }
    } finally { $process.Dispose() }
}
function Convert-PrivateText([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
try {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'Install GitHub CLI: winget install --id GitHub.cli -e ; then open a new PowerShell window.'
    }
    if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
        if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\keytool.exe'))) {
            $env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
        } else {
            throw 'Install JDK 21: winget install --id Microsoft.OpenJDK.21 -e ; then open a new PowerShell window.'
        }
    }
    & gh auth status --hostname github.com
    if ($LASTEXITCODE -ne 0) { throw 'First run: gh auth login --hostname github.com --web --git-protocol https' }
    $null = & gh repo view $Repository --json nameWithOwner
    if ($LASTEXITCODE -ne 0) { throw 'Cannot access the target repository. Check your GitHub account and repository name.' }
    $remoteNames = @(& gh secret list --repo $Repository --json name --jq '.[].name')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list repository Secrets. Use an account with permission to manage Actions secrets.' }
    $keyFile = Join-Path $KeyDirectory 'racionika-release.p12'
    $existing = Test-Path $keyFile
    if (-not $existing -and ($remoteNames -contains 'ANDROID_KEYSTORE_BASE64')) {
        throw 'GitHub already has a signing key but this PC has no local copy. Restore your original keystore backup to KeyDirectory. Never replace it with a new key.'
    }
    $secure = Read-Host 'Keystore password (16+ characters; save in your password manager)' -AsSecureString
    $plain = Convert-PrivateText $secure
    if ($plain -notmatch '^[\x21-\x7e]{16,}$') { throw 'Use 16+ English letters, digits or punctuation, without spaces. Save this password permanently.' }
    if (-not $existing) {
        $confirmation = Read-Host 'Repeat keystore password' -AsSecureString
        $repeat = Convert-PrivateText $confirmation
        if ($plain -cne $repeat) { throw 'Passwords do not match.' }
        $repeat = $null
    }
    $null = New-Item -ItemType Directory -Path $KeyDirectory -Force
    # Limit access to the current Windows user; no inherited broad ACLs.
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $KeyDirectory -AclObject $acl
    $env:RACIONIKA_SETUP_PASSWORD = $plain
    if (-not $existing) {
        & keytool -genkeypair -keystore $keyFile -storetype PKCS12 -storepass:env RACIONIKA_SETUP_PASSWORD -alias racionika -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Racionika Android, O=Racionika'
        if ($LASTEXITCODE -ne 0) { throw 'Key generation failed. Check the local key file before retrying.' }
    }
    $certFile = Join-Path $KeyDirectory 'certificate.der'
    & keytool -exportcert -keystore $keyFile -storetype PKCS12 -storepass:env RACIONIKA_SETUP_PASSWORD -alias racionika -file $certFile
    if ($LASTEXITCODE -ne 0) { throw 'Cannot open the existing key. Check the password; the keystore was not replaced.' }
    $fingerprint = (Get-FileHash $certFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $variablesJson = & gh variable list --repo $Repository --json name,value
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read repository variables.' }
    $pin = ($variablesJson | ConvertFrom-Json | Where-Object { $_.name -eq 'ANDROID_SIGNING_CERT_SHA256' } | Select-Object -First 1).value
    if ($pin -and $pin.Trim().ToLowerInvariant() -ne $fingerprint) {
        throw 'Certificate differs from the GitHub fingerprint. STOP: restore the original keystore; do not rotate the production key.'
    }
    Write-Host "Repository: $Repository"
    Write-Host "Public certificate SHA-256: $fingerprint"
    $answer = Read-Host 'Upload this key to the four repository Actions secrets? Type YES'
    if ($answer -cne 'YES') { throw 'Cancelled. The local keystore was kept; no secrets were uploaded.' }
    Invoke-GhInput -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keyFile))) -Arguments @('secret', 'set', 'ANDROID_KEYSTORE_BASE64', '--repo', $Repository)
    Invoke-GhInput -Value $plain -Arguments @('secret', 'set', 'ANDROID_KEYSTORE_PASSWORD', '--repo', $Repository)
    Invoke-GhInput -Value 'racionika' -Arguments @('secret', 'set', 'ANDROID_KEY_ALIAS', '--repo', $Repository)
    Invoke-GhInput -Value $plain -Arguments @('secret', 'set', 'ANDROID_KEY_PASSWORD', '--repo', $Repository)
    & gh variable set ANDROID_SIGNING_CERT_SHA256 --repo $Repository --body $fingerprint
    if ($LASTEXITCODE -ne 0) { throw 'Fingerprint upload failed. Keep this key and retry the SAME script with the SAME password.' }
    $fingerprint | Set-Content (Join-Path $KeyDirectory 'certificate-sha256.txt') -Encoding ASCII
    Write-Host 'DONE. Keep this keystore permanently; make an encrypted offline backup and save its password separately.'
    Write-Host "Keystore: $keyFile"
    Write-Host 'Now run Actions > Android APK > Run workflow on main.'
} finally {
    $env:RACIONIKA_SETUP_PASSWORD = $null
    $plain = $null
    $repeat = $null
    if ($certFile -and (Test-Path $certFile)) { Remove-Item $certFile -Force }
    $OutputEncoding = $oldEncoding
}
