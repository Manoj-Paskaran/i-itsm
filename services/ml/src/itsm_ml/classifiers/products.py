import re

# Source product metadata refines broad SOFTWARE labels; text is not used to assign labels.
PRODUCT_RULES = [
    ("authentication", r"piv|identity|secureid|okta|duo|iam|sailpoint|authentication"),
    ("database", r"postgres|sql|database|mongodb|bigquery|databricks"),
    ("storage", r"sharefile|dropbox|onedrive|backup|storage|nas|netapp"),
    (
        "security",
        r"security|antivirus|mcafee|symantec|crowdstrike|nessus|veracode|qradar|siem|soar",
    ),
    ("network", r"meraki|network|router|vpn|airwave|firewall"),
    ("cloud", r"kubernetes|aws|azure|cloud|openshift|terraform|gcp"),
    ("hardware", r"printer|laptop|monitor|keyboard|desktop"),
    ("application", r"salesforce|sap|workday|servicenow|dynamics|tableau|power bi|asana|trello"),
]


def mask_products(text: str, product: str = "") -> str:
    """Mask the row product and product-rule matches without case sensitivity."""
    if len(product.strip()) >= 3:
        text = re.sub(rf"\b{re.escape(product.strip())}\b", "PRODUCT", text, flags=re.IGNORECASE)
    for _, pattern in PRODUCT_RULES:
        text = re.sub(rf"\b(?:{pattern})\b", "PRODUCT", text, flags=re.IGNORECASE)
    return text
