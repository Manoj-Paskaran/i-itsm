"""Training-only snapshot selection; no I/O or model fitting."""

import pandas as pd

from itsm_ml.risk.features import ELAPSED_FRACTION_CAP, FEATURE_NAMES, RESOLUTION_TARGETS


def prepare(raw: pd.DataFrame) -> pd.DataFrame:
    # Outcome is a future label, not a feature: source flags mostly change at closure.
    outcomes = (
        raw.assign(outcome=raw.made_sla.astype(str).str.casefold().map({"true": 0, "false": 1}))
        .groupby("number")
        .outcome.max()
    )
    # Select only columns observable at the event snapshot; no closure metadata.
    keep = [
        "number",
        "incident_state",
        "opened_at",
        "sys_updated_at",
        "impact",
        "urgency",
        "priority",
        "reassignment_count",
        "made_sla",
    ]
    frame = raw[keep].copy()
    frame = frame[~frame.incident_state.str.casefold().isin(["closed", "resolved", "canceled"])]
    start = pd.to_datetime(frame.opened_at, format="%d/%m/%Y %H:%M", errors="coerce")
    snapshot = pd.to_datetime(frame.sys_updated_at, format="%d/%m/%Y %H:%M", errors="coerce")
    frame["minutesOpen"] = (snapshot - start).dt.total_seconds() / 60
    for name in ["impact", "urgency", "priority"]:
        frame[name] = pd.to_numeric(frame[name].str.extract(r"^(\d)")[0], errors="coerce")
    frame["impact"] = frame.impact.map({1: 4, 2: 2, 3: 1})
    frame["urgency"] = frame.urgency.map({1: 4, 2: 2, 3: 1})
    frame["priority"] = frame.priority.map({1: 1, 2: 2, 3: 3, 4: 4, 5: 4})
    frame["reassignmentCount"] = pd.to_numeric(frame.reassignment_count, errors="coerce")
    targets = {int(key[1:]): value for key, value in RESOLUTION_TARGETS.items()}
    frame["elapsedFractionRaw"] = frame.minutesOpen / frame.priority.map(targets)
    frame["elapsedFraction"] = frame.elapsedFractionRaw.clip(0, ELAPSED_FRACTION_CAP)
    frame["breach"] = frame.number.map(outcomes)
    frame = frame.dropna(subset=FEATURE_NAMES + ["breach"])
    frame = frame[(frame.minutesOpen >= 0) & (frame.reassignmentCount >= 0)]
    return frame


def split_snapshots(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    from sklearn.model_selection import train_test_split

    incidents = frame.groupby("number").breach.max()
    development, test_ids = train_test_split(
        incidents.index.to_numpy(), test_size=0.2, random_state=42, stratify=incidents
    )
    train_ids, val_ids = train_test_split(
        development, test_size=0.25, random_state=42, stratify=incidents.loc[development]
    )
    return (
        frame[frame.number.isin(train_ids)].copy(),
        frame[frame.number.isin(val_ids)].copy(),
        frame[frame.number.isin(test_ids)].copy(),
    )
