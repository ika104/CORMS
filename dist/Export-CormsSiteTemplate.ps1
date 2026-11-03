<#
    The Dataverse solution carries the app, the component and the flows. It does not carry the
    SharePoint site they all read and write, so a target tenant needs the lists created first -
    with the same internal column names, or every formula in the panel breaks.

    This extracts a provisioning template from the live CORMS site. Run it against the source,
    then run Invoke-PnPSiteTemplate against the new tenant's site.

    PnP.PowerShell needs its own Entra app registration since v2. If you have not done that yet:
        Register-PnPEntraIDApp -ApplicationName "CORMS PnP" -Tenant <tenant>.onmicrosoft.com -Interactive
#>
param(
    [string] $SourceUrl = "https://ssloman.sharepoint.com/sites/CORMS",
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $Out = "corms-site-template.xml"
)

$lists = @(
    # used by both CORMS Approvals and CORMS Task Form
    "CORMS_Correspondence", "CORMS_Attachments", "CORMS_AuditLog", "CORMS_Timeline",
    "CORMS_AdminConfig", "CORMS_UserRoles", "CORMS_Tasks", "CORMS_Delegations",
    # CORMS Approvals only
    "CORMS_ApprovalTasks", "CORMS_SigningSessions",
    # CORMS Task Form only
    "CORMS_Templates",
    "CORMS_CustomFolders", "CORMS_DelegationAttachments", "CORMS_DeliveryTracking",
    "CORMS_NavigationMenu", "CORMS_PhysicalAttachments", "CORMS_ReadReceipts"
)

Connect-PnPOnline -Url $SourceUrl -ClientId $ClientId -Interactive

# Schema only. Content types and fields come along so the lists are identical in the target.
Get-PnPSiteTemplate -Out $Out -Force `
    -Handlers Lists, Fields, ContentTypes, SiteSettings, Navigation `
    -ListsToExtract $lists

# CORMS_AdminConfig holds the SignNow credentials and the flow callback URLs. Those are per
# tenant and two of them cannot be known until the flows are imported, so the rows are NOT
# exported - the keys below are created empty for someone to fill in the target.
$keys = @(
    "signature.provider", "signature.providerBaseUrl", "signature.providerUsername",
    "signature.providerPassword", "signature.providerClientCredentials",
    "signature.flowUrl", "notification.flowUrl", "notification.teamsTeamId"
)
$keys | ForEach-Object { "$_," } | Set-Content -Encoding utf8 "adminconfig-keys-to-fill.csv"

Write-Host "Template written to $Out"
Write-Host "Keys the target must fill in CORMS_AdminConfig listed in adminconfig-keys-to-fill.csv"
Write-Host ""
Write-Host "In the target tenant:"
Write-Host "  Connect-PnPOnline -Url <target site> -ClientId <id> -Interactive"
Write-Host "  Invoke-PnPSiteTemplate -Path $Out"
