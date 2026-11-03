"""Deterministic template data, generated independently of external evaluation."""

import itertools
import json
import random
from pathlib import Path

SYMPTOMS = {
    "hardware": [
        "keyboard keys stopped working",
        "monitor is flickering",
        "printer jams",
        "laptop will not power on",
        "mouse is broken",
    ],
    "software": [
        "software installation fails",
        "license has expired",
        "update cannot finish",
        "patch installer exits",
        "package is incompatible",
    ],
    "network": [
        "wifi disconnects",
        "VPN connection drops",
        "DNS lookup fails",
        "router is unreachable",
        "internet connection times out",
    ],
    "database": [
        "SQL query times out",
        "database cannot connect",
        "PostgreSQL deadlock occurs",
        "database replication stalls",
        "Oracle transaction fails",
    ],
    "cloud": [
        "AWS instance will not start",
        "Azure deployment fails",
        "cloud resource is unavailable",
        "Kubernetes pod cannot start",
        "GCP quota is exceeded",
    ],
    "security": [
        "phishing email arrived",
        "malware detected",
        "ransomware encrypted files",
        "antivirus alert appears",
        "security scan found a threat",
    ],
    "authentication": [
        "password reset fails",
        "login rejected",
        "MFA token invalid",
        "account is locked",
        "single sign-on fails",
    ],
    "application": [
        "application crashes",
        "portal returns an error",
        "payment page is blank",
        "dashboard freezes",
        "app form fails to submit",
    ],
    "storage": [
        "disk is full",
        "storage volume is unavailable",
        "backup failed",
        "file share is missing",
        "drive has no space",
    ],
}
SERVICES = ["Payments", "HR", "Finance", "Sales", "Operations", "Support"]
PHRASES = [
    "Please help: {} on {}.",
    "We found that {} for {}.",
    "Urgent: {} in {}.",
    "Could you investigate why {} on {}?",
    "Since morning {} for {}.",
]
NOISE = [
    "",
    " Several colleagues affected.",
    " Restart did not help.",
    " This happens intermittently.",
]


def generate(seed: int = 42) -> list[dict[str, str]]:
    rng = random.Random(seed)
    rows = []
    for category, symptoms in SYMPTOMS.items():
        combinations = list(itertools.product(symptoms, SERVICES, PHRASES, NOISE))
        rng.shuffle(combinations)
        for symptom, service, phrase, noise in combinations[:300]:
            rows.append(
                {
                    "text": phrase.format(symptom, service) + noise,
                    "category": category,
                    "source": "local-template-v1",
                }
            )
    return rows


if __name__ == "__main__":
    target = Path("data/synthetic-tickets.jsonl")
    target.write_text("".join(json.dumps(row) + "\n" for row in generate()))
    print(f"Wrote {len(generate())} deterministic tickets")
