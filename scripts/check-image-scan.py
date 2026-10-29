#!/usr/bin/env python3
"""Apply the image gate without discarding unfixed alerts from the saved report."""
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    report = json.load(stream)
if not isinstance(report.get("Results"), list):
    raise SystemExit("Invalid or incomplete Trivy report")

blocking = []
unfixed = 0
for result in report["Results"]:
    for finding in result.get("Vulnerabilities") or []:
        if finding.get("Severity") not in ("HIGH", "CRITICAL"):
            continue
        if finding.get("FixedVersion"):
            blocking.append(finding)
        else:
            unfixed += 1

for finding in blocking:
    print(f"{finding['Severity']} {finding['VulnerabilityID']} "
          f"{finding['PkgName']} {finding['InstalledVersion']} -> {finding['FixedVersion']}")
print(f"Fixable HIGH/CRITICAL: {len(blocking)}; unfixed HIGH/CRITICAL: {unfixed}.")
raise SystemExit(1 if blocking else 0)
