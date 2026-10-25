
import csv
import json
import sys
import time
from collections import Counter
from pathlib import Path

import requests


# Paths are resolved relative to the CivicLens project.
PROJECT_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = PROJECT_DIR / "evaluation" / "dataset"
RESULTS_DIR = PROJECT_DIR / "evaluation" / "results"
LABELS_FILE = DATASET_DIR / "labels.csv"

AI_SERVICE_URL = "http://127.0.0.1:8000/classify"
HEALTH_URL = "http://127.0.0.1:8000/health"
REQUEST_TIMEOUT_SECONDS = 120

CATEGORIES = [
    "pothole",
    "road_damage",
    "streetlight",
    "garbage",
    "drainage",
    "water_supply",
    "other",
]


def calculate_metrics(y_true, y_pred):
    """Calculate accuracy and per-class/macro classification metrics."""
    total = len(y_true)
    correct = sum(
        true_label == predicted_label
        for true_label, predicted_label in zip(y_true, y_pred)
    )

    per_class = {}

    for category in CATEGORIES:
        true_positive = sum(
            true_label == category and predicted_label == category
            for true_label, predicted_label in zip(y_true, y_pred)
        )
        false_positive = sum(
            true_label != category and predicted_label == category
            for true_label, predicted_label in zip(y_true, y_pred)
        )
        false_negative = sum(
            true_label == category and predicted_label != category
            for true_label, predicted_label in zip(y_true, y_pred)
        )

        precision_denominator = true_positive + false_positive
        recall_denominator = true_positive + false_negative

        precision = (
            true_positive / precision_denominator
            if precision_denominator
            else 0.0
        )
        recall = (
            true_positive / recall_denominator
            if recall_denominator
            else 0.0
        )
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0
        )

        per_class[category] = {
            "support": sum(label == category for label in y_true),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
        }

    macro_precision = sum(
        values["precision"] for values in per_class.values()
    ) / len(CATEGORIES)
    macro_recall = sum(
        values["recall"] for values in per_class.values()
    ) / len(CATEGORIES)
    macro_f1 = sum(
        values["f1_score"] for values in per_class.values()
    ) / len(CATEGORIES)

    return {
        "evaluated_images": total,
        "correct_predictions": correct,
        "incorrect_predictions": total - correct,
        "accuracy": round(correct / total, 4) if total else None,
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1_score": round(macro_f1, 4),
        "per_class": per_class,
    }


def write_csv(path, fieldnames, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    if not LABELS_FILE.exists():
        print(f"ERROR: Labels file not found: {LABELS_FILE}")
        sys.exit(1)

    # Check that the AI service is running before evaluating images.
    try:
        health_response = requests.get(
            HEALTH_URL, timeout=10
        )
        health_response.raise_for_status()
        health = health_response.json()
    except requests.RequestException as error:
        print("ERROR: Cannot reach the CivicLens AI service.")
        print(f"Check that it is running at {HEALTH_URL}")
        print(f"Details: {error}")
        sys.exit(1)

    if not health.get("loaded", False):
        print("ERROR: The AI model is not loaded.")
        sys.exit(1)

    print(f"AI service: {health.get('service', 'Unknown')}")
    print(f"Model: {health.get('model', 'Unknown')}")

    with LABELS_FILE.open(
        "r", newline="", encoding="utf-8-sig"
    ) as file:
        reader = csv.DictReader(file)

        required_columns = {"image_path", "true_label"}
        if not reader.fieldnames or not required_columns.issubset(
            set(reader.fieldnames)
        ):
            print(
                "ERROR: labels.csv must contain "
                "image_path,true_label columns."
            )
            sys.exit(1)

        dataset_rows = list(reader)

    if not dataset_rows:
        print("ERROR: labels.csv contains no labeled images.")
        sys.exit(1)

    results = []
    skipped = []
    y_true = []
    y_pred = []
    seen_paths = set()

    for index, row in enumerate(dataset_rows, start=2):
        relative_path = (row.get("image_path") or "").strip()
        true_label = (row.get("true_label") or "").strip().lower()

        if not relative_path or not true_label:
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": "Missing image path or true label",
            })
            continue

        # Prevent absolute paths and path traversal outside the dataset.
        image_path = (DATASET_DIR / relative_path).resolve()

        if not image_path.is_relative_to(DATASET_DIR.resolve()):
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": "Path is outside the dataset directory",
            })
            continue

        if str(image_path).lower() in seen_paths:
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": "Duplicate image path",
            })
            continue

        seen_paths.add(str(image_path).lower())

        if true_label not in CATEGORIES:
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": f"Unknown label: {true_label}",
            })
            continue

        if not image_path.is_file():
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": "Image file does not exist",
            })
            print(f"[SKIP] Missing image: {relative_path}")
            continue

        try:
            with image_path.open("rb") as image_file:
                response = requests.post(
                    AI_SERVICE_URL,
                    files={
                        "file": (
                            image_path.name,
                            image_file,
                            "image/jpeg"
                        )
                    },
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )

            response.raise_for_status()
            prediction = response.json()

            predicted_label = str(
                prediction["predictedCategory"]
            ).strip().lower()

            if predicted_label not in CATEGORIES:
                raise ValueError(
                    f"Unexpected predicted category: {predicted_label}"
                )

            confidence = float(prediction["confidence"])

            if not 0.0 <= confidence <= 1.0:
                raise ValueError(
                    f"Confidence outside [0, 1]: {confidence}"
                )

            top_predictions = prediction.get("topPredictions", [])

            results.append({
                "image_path": relative_path,
                "true_label": true_label,
                "predicted_label": predicted_label,
                "confidence": round(confidence, 6),
                "correct": true_label == predicted_label,
                "top_predictions": json.dumps(
                    top_predictions, ensure_ascii=False
                ),
            })

            y_true.append(true_label)
            y_pred.append(predicted_label)

            status = "CORRECT" if true_label == predicted_label else "WRONG"
            print(
                f"[{status}] {relative_path}: "
                f"true={true_label}, predicted={predicted_label}, "
                f"confidence={confidence:.4f}"
            )

        except (
            requests.RequestException,
            KeyError,
            ValueError,
            TypeError,
        ) as error:
            skipped.append({
                "row": index,
                "image_path": relative_path,
                "reason": str(error),
            })
            print(f"[SKIP] {relative_path}: {error}")

        # Avoid sending requests too quickly on a small local service.
        time.sleep(0.05)

    predictions_file = RESULTS_DIR / "predictions.csv"
    misclassified_file = RESULTS_DIR / "misclassified.csv"
    confusion_file = RESULTS_DIR / "confusion_matrix.csv"
    skipped_file = RESULTS_DIR / "skipped_images.csv"
    summary_file = RESULTS_DIR / "metrics.json"

    prediction_columns = [
        "image_path",
        "true_label",
        "predicted_label",
        "confidence",
        "correct",
        "top_predictions",
    ]

    write_csv(predictions_file, prediction_columns, results)

    misclassified = [
        row for row in results if not row["correct"]
    ]
    write_csv(
        misclassified_file,
        prediction_columns,
        misclassified,
    )

    # Rows are actual labels; columns are predicted labels.
    confusion = {
        actual: Counter()
        for actual in CATEGORIES
    }

    for actual, predicted in zip(y_true, y_pred):
        confusion[actual][predicted] += 1

    confusion_rows = []
    for actual in CATEGORIES:
        confusion_rows.append({
            "true_label": actual,
            **{
                category: confusion[actual][category]
                for category in CATEGORIES
            },
        })

    write_csv(
        confusion_file,
        ["true_label", *CATEGORIES],
        confusion_rows,
    )

    write_csv(
        skipped_file,
        ["row", "image_path", "reason"],
        skipped,
    )

    metrics = calculate_metrics(y_true, y_pred)

    summary = {
        "model": health.get("model", "Unknown"),
        "service": health.get("service", "Unknown"),
        "categories": CATEGORIES,
        "dataset_rows": len(dataset_rows),
        "evaluated_images": len(results),
        "skipped_images": len(skipped),
        "metrics": metrics,
        "notes": [
            "Metrics use only successfully evaluated images.",
            "Macro metrics average all seven categories, including "
            "categories with zero test examples.",
            "Results are meaningful only when true labels are verified "
            "and the dataset represents the intended use case.",
            "CLIP confidence is a model score, not a guarantee of "
            "prediction correctness.",
        ],
    }

    summary_file.write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )

    print("\n========== EVALUATION SUMMARY ==========")
    print(f"Dataset rows: {len(dataset_rows)}")
    print(f"Evaluated: {len(results)}")
    print(f"Skipped: {len(skipped)}")
    print(f"Accuracy: {metrics['accuracy']}")
    print(f"Macro precision: {metrics['macro_precision']}")
    print(f"Macro recall: {metrics['macro_recall']}")
    print(f"Macro F1-score: {metrics['macro_f1_score']}")

    print("\nResults saved to:")
    print(f"  {summary_file}")
    print(f"  {predictions_file}")
    print(f"  {misclassified_file}")
    print(f"  {confusion_file}")
    print(f"  {skipped_file}")

    if not results:
        print(
            "\nWARNING: No images were evaluated. Add real image files "
            "and valid labels before interpreting any metrics."
        )


if __name__ == "__main__":
    main()
