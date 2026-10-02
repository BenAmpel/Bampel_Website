"""Build the alert bank for the verification study (Clark, verification collapse).

Writes netlify/lib/lab/types/alert-triage-alerts.mjs (the default alert bank for alert-triage studies). The bank lives server-side only, because it holds
ground truth and which evidence panel supports which verdict.

Each scenario family has a malicious and a benign template. Each template has two
parameter sets, giving 4 alerts per family (variants 0-3: mal, benign, mal, benign).
Every alert has the same surface signal across truths, so the summary alone does not
decide the case: participants must integrate the evidence panels.

Panel "supports" codes: "malicious", "benign", or "neutral". Each alert has one
decisive panel for the truth, one panel that points the other way (misleading),
and the rest supporting or neutral.

All organizations, people, domains, and IPs are fictional (RFC 5737 / .example).
"""
import json, pathlib

PANELS = ["network", "user", "system", "context"]

F = []  # families

def fam(fid, title, severity, summary, mal, ben, params_mal, params_ben, ai):
    F.append(dict(id=fid, title=title, severity=severity, summary=summary,
                  mal=mal, ben=ben, pm=params_mal, pb=params_ben, ai=ai))

# 1. Impossible travel sign-in
fam("travel", "Impossible travel sign-in", "High",
    "{user} signed in from {city} {mins} minutes after a sign-in from Atlanta, GA.",
    mal={
        "network": ("Sign-in source {ip} is a residential proxy range in {city}. The previous sign-in came from the corporate network in Atlanta.", "malicious"),
        "user": ("{user} has never signed in from outside the US. Five MFA push requests were denied in 3 minutes before one was approved.", "malicious"),
        "system": ("The sign-in passed MFA, and no password reset or failed-password attempts were recorded for the account.", "benign"),
        "context": ("{user} is a senior accountant. HR travel records show no trip booked. A new inbox rule forwarding invoices to an external address was created 6 minutes after sign-in, from a new browser on an unregistered device.", "malicious"),
    },
    ben={
        "network": ("Sign-in source {ip} geolocates to {city}. It belongs to the company's VPN exit node in that region.", "benign"),
        "user": ("{user} has signed in from {city} on 3 prior trips. Activity after sign-in matches normal work: email and the expense system.", "benign"),
        "system": ("The sign-in used {user}'s registered laptop and a hardware security key. No MFA prompts were denied.", "benign"),
        "context": ("The geolocation vendor flagged {city} as unusual for this account. Threat intel lists the country as high-risk for credential attacks this quarter.", "malicious"),
    },
    params_mal=[dict(user="J. Ortega", city="Bucharest, Romania", mins=42, ip="198.51.100.23"),
                dict(user="P. Nakamura", city="Lagos, Nigeria", mins=55, ip="203.0.113.77")],
    params_ben=[dict(user="R. Patel", city="Lisbon, Portugal", mins=38, ip="192.0.2.140"),
                dict(user="M. Chen", city="Singapore", mins=61, ip="198.51.100.201")],
    ai={"malicious": "Repeated denied MFA pushes followed by an approval, plus a new external forwarding rule, match an account takeover pattern.",
        "benign": "The sign-in came through the corporate VPN on a registered device with a hardware key, consistent with business travel."})

# 2. Large outbound transfer
fam("exfil", "Large outbound data transfer", "High",
    "{host} sent {gb} GB to an external storage service at {time}.",
    mal={
        "network": ("Destination {dom} was registered 3 days ago and is not on the approved vendor list. Traffic used an uncommon port, 8443.", "malicious"),
        "user": ("The transfer ran under {user}'s account. {user} was offline per the badge system and VPN logs at the time.", "malicious"),
        "system": ("A command-line archive tool created password-protected .7z files from the finance share 10 minutes before the upload.", "malicious"),
        "context": ("The finance team runs month-end closing this week, and large file activity on {host} is common during closing.", "benign"),
    },
    ben={
        "network": ("The {gb} GB upload went to {dom} over HTTPS. The volume is far above this host's 30-day average.", "malicious"),
        "user": ("The transfer ran under svc-backup, a service account that runs every night.", "benign"),
        "system": ("The process was the signed backup agent from the approved backup vendor, started by its scheduled task.", "benign"),
        "context": ("{dom} is the company's contracted backup provider. Change ticket CHG-{tk} moved the full backup to this night.", "benign"),
    },
    params_mal=[dict(host="FIN-WS-114", gb=8.2, time="2:13 AM", dom="files-sync-share.example", user="L. Moreau"),
                dict(host="HR-WS-031", gb=5.6, time="1:47 AM", dom="cloudbox-transfer.example", user="D. Kim")],
    params_ben=[dict(host="FIN-FS-02", gb=41.0, time="1:05 AM", dom="vaultbackup.example", tk="20417"),
                dict(host="ENG-FS-07", gb=63.5, time="12:40 AM", dom="vaultbackup.example", tk="20563")],
    ai={"malicious": "A newly registered destination, an archive created minutes earlier, and an account whose owner was offline indicate data exfiltration.",
        "benign": "The upload was made by the approved backup agent under a service account, to the contracted backup provider, with a change ticket."})

# 3. Encoded PowerShell
fam("pwsh", "Encoded PowerShell execution", "Medium",
    "An encoded PowerShell command ran on {host}.",
    mal={
        "network": ("After the command ran, {host} made HTTPS requests to {dom} every 60 seconds, a regular beaconing pattern.", "malicious"),
        "user": ("{user} opened an email attachment, invoice_{n}.docm, 20 seconds before the command ran.", "malicious"),
        "system": ("The parent process was WINWORD.EXE. The decoded command downloads and runs a script from {dom}.", "malicious"),
        "context": ("Encoded PowerShell is also used by the IT team's device management tool across many hosts.", "benign"),
    },
    ben={
        "network": ("The command contacted an internal update server only. No external connections followed.", "benign"),
        "user": ("No user was signed in to {host} at the time. The workstation was idle.", "neutral"),
        "system": ("The parent process was the device management agent. The script is signed by the IT department's certificate.", "benign"),
        "context": ("Threat intel reports a surge in encoded PowerShell attacks this month, and the detection rule fired at high severity.", "malicious"),
    },
    params_mal=[dict(host="SALES-WS-207", user="A. Brooks", dom="cdn-update-check.example", n="8841"),
                dict(host="OPS-WS-088", user="T. Nguyen", dom="static-asset-sync.example", n="3317")],
    params_ben=[dict(host="MKT-WS-019"), dict(host="LEGAL-WS-044")],
    ai={"malicious": "PowerShell spawned by Word after a macro-enabled attachment opened, followed by regular beaconing, indicates a malicious payload.",
        "benign": "The command came from the signed device management agent and only contacted the internal update server."})

# 4. Phishing link click
fam("phish", "User clicked a flagged link", "Medium",
    "{user} clicked a link in an email that the mail filter flagged as suspicious.",
    mal={
        "network": ("The link resolved to {dom}, a lookalike of the company's sign-in page hosted on a free web host.", "malicious"),
        "user": ("{user} submitted a form on the page. Fifteen minutes later, {user}'s account signed in from a new IP, {ip}.", "malicious"),
        "system": ("The email came from an external address but displayed the name 'IT Help Desk'.", "malicious"),
        "context": ("The security awareness team ran a phishing simulation in {user}'s department last month.", "benign"),
    },
    ben={
        "network": ("The link resolved to {dom}, a domain first seen in company traffic today.", "malicious"),
        "user": ("{user} did not enter credentials. The page shown was a training notice.", "benign"),
        "system": ("The email headers show it was sent by the company's phishing simulation platform.", "benign"),
        "context": ("Security awareness campaign SIM-{n} is scheduled this week for {user}'s department, and {dom} is the simulation landing domain.", "benign"),
    },
    params_mal=[dict(user="K. Alvarez", dom="northwind-signin.example", ip="203.0.113.19"),
                dict(user="S. Haddad", dom="nwt-portal-login.example", ip="198.51.100.66")],
    params_ben=[dict(user="E. Johansson", dom="learn-secure-training.example", n="0921"),
                dict(user="B. Okafor", dom="learn-secure-training.example", n="0934")],
    ai={"malicious": "Credentials were submitted to a lookalike sign-in page and the account then signed in from a new IP, indicating credential theft.",
        "benign": "The email came from the sanctioned phishing simulation platform and the user saw a training notice without entering credentials."})

# 5. Privilege escalation
fam("priv", "Account added to an administrators group", "High",
    "{user} was added to the Domain Admins group.",
    mal={
        "network": ("The change was made from {host}, which does not normally run admin tools.", "malicious"),
        "user": ("The change was made by svc-print, a printer service account that has never modified group membership.", "malicious"),
        "system": ("The change happened at {time}, outside the approved change window. Security event logging on the domain controller was cleared 2 minutes later.", "malicious"),
        "context": ("{user} is on the IT infrastructure team, which holds admin rights for maintenance.", "benign"),
    },
    ben={
        "network": ("The change came from an admin jump server on the management network.", "benign"),
        "user": ("The change was made by the identity team's lead administrator, who approves admin access.", "benign"),
        "system": ("Domain Admins membership changes are rare. This is the first in 4 months.", "malicious"),
        "context": ("Change ticket CHG-{tk} grants {user} temporary admin rights for a server migration, expiring in 5 days.", "benign"),
    },
    params_mal=[dict(user="contractor-04", host="PRN-SRV-03", time="3:22 AM"),
                dict(user="temp-intern-12", host="KIOSK-11", time="11:58 PM")],
    params_ben=[dict(user="N. Ivanova", tk="20488"), dict(user="O. Mensah", tk="20602")],
    ai={"malicious": "A printer service account granted domain admin rights outside the change window and logs were then cleared, indicating an attacker escalating privileges.",
        "benign": "The change was made by the identity lead from a jump server under an approved, time-limited change ticket."})

# 6. Internal scanning
fam("scan", "Internal network scanning", "Medium",
    "{host} connected to {n} internal hosts on ports 445 and 3389 within 10 minutes.",
    mal={
        "network": ("Connections went to sequential addresses across 4 subnets, a pattern typical of worm-like scanning.", "malicious"),
        "user": ("{host} is a reception desk PC. Its user, {user}, was at lunch per the badge system.", "malicious"),
        "system": ("An unsigned executable, {exe}, started in the temp folder just before the scanning began.", "malicious"),
        "context": ("The vulnerability management team scans the network every week.", "benign"),
    },
    ben={
        "network": ("The connections reached {n} hosts across all subnets, much more than this host usually touches.", "malicious"),
        "user": ("{host} is the vulnerability scanner appliance owned by the security team.", "benign"),
        "system": ("The scan was started by the scanner's scheduler under the vuln-scan service account.", "benign"),
        "context": ("The weekly scan window is Tuesdays 1:00 to 3:00 PM. This scan started at 1:02 PM on Tuesday.", "benign"),
    },
    params_mal=[dict(host="RECEP-PC-02", n=212, user="G. Silva", exe="svchelper.exe"),
                dict(host="CONF-PC-15", n=187, user="shared kiosk", exe="updtsvc.exe")],
    params_ben=[dict(host="SEC-VULN-01", n=640), dict(host="SEC-VULN-02", n=598)],
    ai={"malicious": "An unsigned executable on an unattended reception PC launched sequential scanning across subnets, consistent with worm propagation.",
        "benign": "The scan came from the security team's scanner appliance under its service account during the weekly scan window."})

# 7. New scheduled task
fam("persist", "New scheduled task created", "Medium",
    "A new scheduled task named '{task}' was created on {host}.",
    mal={
        "network": ("The task's program contacted {dom} on first run.", "malicious"),
        "user": ("The task was created by {user}'s account while {user} was on approved leave.", "malicious"),
        "system": ("The task runs {exe} from the user's AppData temp folder every 15 minutes. The file is unsigned and was written 1 minute before the task was created.", "malicious"),
        "context": ("Many legitimate applications create scheduled tasks with update-style names.", "benign"),
    },
    ben={
        "network": ("On first run the task contacted {dom}, a domain this host has not contacted before.", "malicious"),
        "user": ("The task was created by the SYSTEM account during a software installation.", "neutral"),
        "system": ("The task runs a vendor updater from Program Files. The file is signed by the software vendor.", "benign"),
        "context": ("IT deployed this vendor's software to {host}'s department yesterday under change ticket CHG-{tk}.", "benign"),
    },
    params_mal=[dict(task="ChromeUpdateTaskUser", host="ACCT-WS-061", dom="api-telemetry-hub.example", user="H. Rossi", exe="chrome_upd.exe"),
                dict(task="OneSyncHelper", host="PR-WS-022", dom="sync-metrics-cdn.example", user="I. Dubois", exe="onesync.exe")],
    params_ben=[dict(task="DesignSuiteUpdater", host="CREAT-WS-014", dom="updates.designsuite.example", tk="20511"),
                dict(task="PDFToolsUpdate", host="LEGAL-WS-009", dom="update.pdftools.example", tk="20540")],
    ai={"malicious": "An unsigned file in a temp folder, scheduled every 15 minutes and contacting an unknown domain, created while the owner was on leave, indicates persistence.",
        "benign": "The task runs a vendor-signed updater from Program Files following an approved software deployment."})

# 8. Unusual database queries
fam("db", "Unusual database query volume", "High",
    "Account {acct} read {rows} rows from the customer database in {mins} minutes.",
    mal={
        "network": ("The queries came from {host}, a host never before seen connecting to the database.", "malicious"),
        "user": ("{acct} belongs to a contractor whose engagement ended {days} days ago. The account was never disabled.", "malicious"),
        "system": ("The queries selected every column, including payment card fields, with no filtering.", "malicious"),
        "context": ("The analytics team runs large customer extracts at quarter end, and this is the last week of the quarter.", "benign"),
    },
    ben={
        "network": ("The read volume is about 9 times this account's daily average.", "malicious"),
        "user": ("{acct} is the reporting service account used by the analytics team.", "benign"),
        "system": ("The queries match the saved quarterly reporting job, and payment card fields were masked by the database.", "benign"),
        "context": ("Quarterly reporting job QR-{n} ran on its schedule, approved by the data governance office.", "benign"),
    },
    params_mal=[dict(acct="ext-dev-07", rows="2.4M", mins=18, host="203.0.113.88", days=41),
                dict(acct="ext-qa-03", rows="1.9M", mins=12, host="198.51.100.150", days=26)],
    params_ben=[dict(acct="svc-reporting", rows="3.1M", mins=22, n="2026Q3"),
                dict(acct="svc-reporting", rows="2.7M", mins=19, n="2026Q3-b")],
    ai={"malicious": "A deprovisioned contractor account pulled unfiltered customer data, including card fields, from a never-seen host, indicating data theft.",
        "benign": "The reads match the scheduled quarterly reporting job under the analytics service account, with card data masked."})

LABELS = {"network": "Network activity", "user": "User behavior", "system": "System events", "context": "Context & threat intel"}

def build():
    alerts = []
    for f in F:
        variants = [("malicious", f["pm"][0]), ("benign", f["pb"][0]), ("malicious", f["pm"][1]), ("benign", f["pb"][1])]
        for v, (truth, p) in enumerate(variants):
            tmpl = f["mal"] if truth == "malicious" else f["ben"]
            panels = []
            for key in PANELS:
                text, sup = tmpl[key]
                panels.append({"key": key, "label": LABELS[key], "text": text.format(**p), "supports": sup})
            misleading = [x["key"] for x in panels if x["supports"] not in (truth, "neutral")]
            other = "benign" if truth == "malicious" else "malicious"
            alerts.append({
                "id": f"{f['id']}-{v}", "family": f["id"], "variant": v, "truth": truth,
                "title": f["title"], "severity": f["severity"],
                "summary": f["summary"].format(**p),
                "panels": panels,
                "misleadingPanels": misleading,
                "aiRationale": {
                    "correct": f["ai"][truth],
                    "incorrect": _incorrect(f, truth, panels),
                },
            })
    return alerts

def _incorrect(f, truth, panels):
    """Rationale for an incorrect verdict: cites the misleading panel only."""
    mis = [x for x in panels if x["supports"] not in (truth, "neutral")]
    cue = mis[0]["text"] if mis else panels[0]["text"]
    verdict = "benign" if truth == "malicious" else "malicious"
    return f"Assessment based on {mis[0]['label'].lower() if mis else 'available evidence'}: {cue} This pattern is consistent with {verdict} activity."

PRACTICE = {
    "id": "practice", "family": "practice", "variant": 0, "truth": "benign",
    "title": "Practice: failed sign-ins", "severity": "Low",
    "summary": "Account t.lee had 4 failed sign-ins in 2 minutes, then a successful sign-in.",
    "panels": [
        {"key": "network", "label": LABELS["network"], "text": "All attempts came from the office network in Atlanta.", "supports": "benign"},
        {"key": "user", "label": LABELS["user"], "text": "T. Lee reset their password yesterday.", "supports": "benign"},
        {"key": "system", "label": LABELS["system"], "text": "The failures used the old password, then the new one succeeded.", "supports": "benign"},
        {"key": "context", "label": LABELS["context"], "text": "Password-guessing attacks against the company rose last month.", "supports": "malicious"},
    ],
    "misleadingPanels": ["context"],
    "aiRationale": {"correct": "The failed attempts came from the office network and match the password reset the user made yesterday.", "incorrect": ""},
}

if __name__ == "__main__":
    alerts = build()
    assert len(alerts) == 32 and len({a["id"] for a in alerts}) == 32
    for a in alerts:
        assert any(p["supports"] == a["truth"] for p in a["panels"]), a["id"]
        assert a["misleadingPanels"], a["id"]
    out = pathlib.Path(__file__).with_name("alert-triage-alerts.mjs")
    out.write_text("// Generated by build_alert_triage_alerts.py. Do not edit by hand; edit the generator.\n"
                   "// Server-side only: contains ground truth.\n"
                   f"export const ALERTS = {json.dumps(alerts, indent=1)};\n"
                   f"export const PRACTICE = {json.dumps(PRACTICE, indent=1)};\n")
    print(f"wrote {out} with {len(alerts)} alerts")
