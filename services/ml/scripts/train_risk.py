"""Group-split, snapshot-only SLA risk experiment. No closure features are used."""

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib
import mlflow
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, CalibrationDisplay
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from itsm_ml.risk.dataset import prepare, split_snapshots
from itsm_ml.risk.features import FEATURE_NAMES, RESOLUTION_TARGETS
from itsm_ml.risk.monotonicity import is_non_decreasing, window_curve

matplotlib.use("Agg")
SEED = 42


def main():
    frame = prepare(pd.read_csv("data/raw/uci498.csv", keep_default_na=False))
    train, validation, test = split_snapshots(frame)
    train_ids, val_ids, test_ids = (part.number.unique() for part in (train, validation, test))
    assert not (
        set(train_ids) & set(test_ids)
        or set(train_ids) & set(val_ids)
        or set(test_ids) & set(val_ids)
    )
    x_train, y_train = train[FEATURE_NAMES].to_numpy(), train.breach.to_numpy()
    x_val, y_val = validation[FEATURE_NAMES].to_numpy(), validation.breach.to_numpy()
    cv = list(GroupKFold(3).split(x_train, y_train, groups=train.number))
    models = {
        "logreg": make_pipeline(
            StandardScaler(), LogisticRegression(max_iter=1000, random_state=SEED)
        ),
        "hist-gradient-boosting": HistGradientBoostingClassifier(
            max_iter=100,
            max_leaf_nodes=15,
            random_state=SEED,
            monotonic_cst=[
                int(name in {"reassignmentCount", "minutesOpen", "elapsedFraction"})
                for name in FEATURE_NAMES
            ],
        ),
    }
    Path("mlruns").mkdir(exist_ok=True)
    mlflow.set_tracking_uri("sqlite:///mlruns/tracking.db")
    mlflow.set_experiment("itsm-sla-risk-v1")
    comparison = {}
    for name, model in models.items():
        with mlflow.start_run(run_name=name):
            model.fit(x_train, y_train)
            p = model.predict_proba(x_val)[:, 1]
            raw_brier = brier_score_loss(y_val, p)
            calibrated = CalibratedClassifierCV(model, method="sigmoid", cv=cv)
            calibrated.fit(x_train, y_train)
            calibrated_p = calibrated.predict_proba(x_val)[:, 1]
            use_calibration = brier_score_loss(y_val, calibrated_p) < raw_brier
            if use_calibration:
                models[name] = calibrated
                p = calibrated_p
            comparison[name] = {
                "roc_auc": float(roc_auc_score(y_val, p)),
                "pr_auc": float(average_precision_score(y_val, p)),
                "brier": float(brier_score_loss(y_val, p)),
                "calibrated": bool(use_calibration),
            }
            mlflow.log_params({"seed": SEED, "group_split": "incident-number"})
            mlflow.log_metrics({k: v for k, v in comparison[name].items() if k != "calibrated"})
    winner = "hist-gradient-boosting"
    best = models[winner]
    p_test = best.predict_proba(test[FEATURE_NAMES].to_numpy())[:, 1]
    metrics = {
        "roc_auc": float(roc_auc_score(test.breach, p_test)),
        "pr_auc": float(average_precision_score(test.breach, p_test)),
        "brier": float(brier_score_loss(test.breach, p_test)),
    }
    in_window = test.elapsedFractionRaw <= 1
    window_metrics = {
        "roc_auc": float(roc_auc_score(test.breach[in_window], p_test[in_window])),
        "pr_auc": float(average_precision_score(test.breach[in_window], p_test[in_window])),
    }
    fractions = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95]
    curves = {priority: window_curve(best, priority, fractions) for priority in RESOLUTION_TARGETS}
    for priority, curve in curves.items():
        assert is_non_decreasing(curve), f"Non-monotonic SLA window curve for {priority}: {curve}"
    metadata = {
        "version": 1,
        "seed": SEED,
        "features": FEATURE_NAMES,
        "train_date": datetime.now(timezone.utc).isoformat(),
        "winner": winner,
        "validation": comparison,
        "test": metrics,
        "test_in_window": window_metrics,
        "window_curves": {"fractions": fractions, "probabilities": curves},
        "rows": {"train": len(train), "validation": len(validation), "test": len(test)},
        "incidents": {"train": len(train_ids), "validation": len(val_ids), "test": len(test_ids)},
        "test_breach_prevalence": float(test.breach.mean()),
        "resolution_targets_minutes": RESOLUTION_TARGETS,
    }
    joblib.dump({"estimator": best, "metadata": metadata}, "artifacts/sla_risk.joblib")
    Path("artifacts/risk-metrics.json").write_text(json.dumps(metadata, indent=2) + "\n")
    import matplotlib.pyplot as plt

    CalibrationDisplay.from_predictions(test.breach, p_test, n_bins=10)
    plt.tight_layout()
    plt.savefig("../../docs/report/img/risk-calibration.png")
    section = "\n## ML-2 — SLA-breach prediction\n\n"
    section += "Reproduce: `uv run python scripts/fetch_data.py uci`, then "
    section += (
        "`uv run --group train python scripts/train_risk.py` from `services/ml`. Seed 42.\n\n"
    )
    section += (
        "Source: UCI dataset 498, Incident Management Process Enriched Event Log (CC BY 4.0). "
    )
    section += (
        "Each non-terminal event is a snapshot; target is the incident-level "
        "eventual `not made_sla` outcome. "
    )
    section += (
        "The source usually updates made_sla at closure, so the eventual outcome "
        "labels earlier snapshots; closure information is used only for labels, "
        "never features. Splits are stratified 60/20/20 by incident number; no "
        "incident crosses splits. "
    )
    section += "Calibration CV also groups by incident. Closure dates/codes, resolutions and IDs "
    section += "are excluded from model features.\n\n"
    section += "Contract features: impact, urgency, priority, reassignmentCount, minutesOpen, "
    section += (
        "elapsedFraction. UCI High/Medium/Low severity maps to 4/2/1; planning priority maps "
    )
    section += "to P4. Elapsed time uses sys_updated_at minus opened_at. The elapsed fraction "
    section += "assumes spec p.7 resolution targets: P1=30, P2=120, P3=480, P4=1440 minutes. "
    section += (
        "The same assumption is used at serving; rule fallback uses the actual request window. "
    )
    section += "Anonymised category/service are ignored in v1.\n\n"
    section += f"Rows: `{metadata['rows']}`; incident counts: `{metadata['incidents']}`. "
    section += f"Test breach prevalence: {metadata['test_breach_prevalence']:.4f}.\n\n"
    section += "| Model | Validation ROC-AUC | Validation PR-AUC | Brier | Calibrated |\n"
    section += "|---|---:|---:|---:|---|\n"
    for name, values in comparison.items():
        section += (
            f"| {name} | {values['roc_auc']:.4f} | {values['pr_auc']:.4f} | "
            f"{values['brier']:.4f} | {values['calibrated']} |\n"
        )
    section += f"\nSelected **{winner}** for serving; logistic regression is a baseline only. "
    section += (
        f"Held-out test ROC-AUC **{metrics['roc_auc']:.4f}**, PR-AUC **{metrics['pr_auc']:.4f}**, "
    )
    section += f"Brier **{metrics['brier']:.4f}**. Sigmoid calibration is retained only if "
    section += "validation Brier improves.\n\n![Test calibration](img/risk-calibration.png)\n\n"
    section += (
        f"In-window test ROC-AUC **{window_metrics['roc_auc']:.4f}**, "
        f"PR-AUC **{window_metrics['pr_auc']:.4f}** (raw elapsed fraction ≤ 1). "
        "The headline full-test ROC-AUC comes mainly from priority and long-overdue snapshots; "
        "the in-window score is the honest figure for live alerts.\n\n"
    )
    section += (
        "| Priority | Target (min) | Rows | Breach rate | Median minutes open | "
        "P90 minutes open | Median raw fraction | Raw fraction ≤ 1 |\n"
    )
    section += "|---|---:|---:|---:|---:|---:|---:|---:|\n"
    for priority, target in RESOLUTION_TARGETS.items():
        subset = train[train.priority == int(priority[1:])]
        section += (
            f"| {priority} | {target} | {len(subset)} | {subset.breach.mean():.1%} | "
            f"{subset.minutesOpen.median():.1f} | {subset.minutesOpen.quantile(0.9):.1f} | "
            f"{subset.elapsedFractionRaw.median():.2f} | "
            f"{(subset.elapsedFractionRaw <= 1).mean():.1%} |\n"
        )
    overdue = (train.elapsedFractionRaw > 1).mean()
    section += (
        "\nThe API sends elapsedFraction in [0, 1] and minutesOpen in [0, T] for "
        f"in-window tickets. {overdue:.1%} of training rows are already past the assumed "
        "target, and those overdue rows carry most of the time signal, which the API "
        "never sends for an open, in-window ticket.\n\n"
    )
    section += "| Priority | " + " | ".join(str(f) for f in fractions) + " |\n"
    section += "|---|" + "---:|" * len(fractions) + "\n"
    for priority, curve in curves.items():
        section += f"| {priority} | " + " | ".join(f"{value:.4f}" for value in curve) + " |\n"
    section += (
        "\nRules answer by default (`SLA_RISK_ENGINE=rules`). The model is loaded, "
        "monotonic and selectable, but is not used for live badges because of the "
        "in-window score.\n\n"
    )
    section += (
        "Limitations: UCI impact and urgency map only to {1, 2, 4}; "
        "3 never occurs in training although the API can send it. "
    )
    section += "UCI policies differ from our assumed targets; dataset label is not "
    section += "recomputed from those targets. Event rows weight longer incidents more heavily. "
    section += "No category/service signal, no temporal holdout and no evidence of transfer to "
    section += "our deployment yet. An already breached request always returns 1.0/high.\n"
    report = Path("../../docs/report/ml-evaluation.md")
    original = report.read_text().split("\n## ML-2")[0]
    report.write_text(original + section)
    print(json.dumps({"winner": winner, "validation": comparison, "test": metrics}, indent=2))


if __name__ == "__main__":
    main()
