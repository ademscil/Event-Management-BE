param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,

    [Parameter(Mandatory = $true)]
    [string]$Repo,

    [Parameter(Mandatory = $true)]
    [string]$Token
)

$ErrorActionPreference = "Stop"

$headers = @{
    "Accept" = "application/vnd.github+json"
    "Authorization" = "Bearer $Token"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function Set-BranchProtection {
    param(
        [string]$Branch,
        [int]$ApprovalsRequired
    )

    $uri = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"
    $body = @{
        required_status_checks = @{
            strict = $true
            contexts = @("test")
        }
        enforce_admins = $true
        required_pull_request_reviews = @{
            dismiss_stale_reviews = $true
            require_code_owner_reviews = $false
            required_approving_review_count = $ApprovalsRequired
        }
        restrictions = $null
        required_conversation_resolution = $true
        allow_force_pushes = $false
        allow_deletions = $false
        required_linear_history = $true
    } | ConvertTo-Json -Depth 6

    Write-Host "Applying protection for '$Branch'..."
    Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Branch '$Branch' protected."
}

try {
    Set-BranchProtection -Branch "development" -ApprovalsRequired 1
    Set-BranchProtection -Branch "main" -ApprovalsRequired 2
    Write-Host "All branch protection rules applied successfully."
}
catch {
    Write-Error "Failed to apply branch protection: $($_.Exception.Message)"
    exit 1
}
