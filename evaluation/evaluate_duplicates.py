
import csv
import getpass
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
RESULTS_DIR = ROOT / "results"
PAIRS_FILE = ROOT / "duplicate_pairs.csv"

API_BASE = "http://localhost:5000/api"
DUPLICATE_ROUTE = "/reports/{report_id}/duplicates"
TIMEOUT = 30


def is_true(value):
    return str(value).strip().lower() in {
        "true", "1", "yes", "y"
    }


def safe_divide(numerator, denominator):
    return numerator / denominator if denominator else 0.0


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    if not PAIRS_FILE.exists():
        sys.exit(f"Dataset not found: {PAIRS_FILE}")

    with PAIRS_FILE.open(
        "r", newline="", encoding="utf-8-sig"
    ) as file:
        reader = csv.DictReader(file)
        required = {
            "pair_id", "report_a", "report_b", "true_duplicate"
        }

        if not reader.fieldnames or not required.issubset(
            set(reader.fieldnames)
        ):
            sys.exit(
                "CSV headers must be: pair_id,report_a,"
                "report_b,true_duplicate"
            )

        pairs = list(reader)

    if not pairs:
        sys.exit("No evaluation pairs found.")

    email = input("Admin email: ").strip()
    password = getpass.getpass("Admin password: ")

    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        login = response.json()
    except (requests.RequestException, ValueError) as error:
        sys.exit(f"Admin login failed: {error}")

    if login.get("user", {}).get("role") != "admin":
        sys.exit("This evaluation requires an admin account.")

    token = login.get("token")
    if not token:
        sys.exit("Login response did not contain a token.")

    headers = {"Authorization": f"Bearer {token}"}
    results = []
    skipped = []

    for row in pairs:
        pair_id = (row.get("pair_id") or "").strip()
        report_a = (row.get("report_a") or "").strip()
        report_b = (row.get("report_b") or "").strip()
        raw_label = (row.get("true_duplicate") or "").strip().lower()

        if not all([pair_id, report_a, report_b]):
            skipped.append({
                "pair_id": pair_id,
                "reason": "Missing pair ID or report ID",
            })
            continue

        if report_a == report_b:
            skipped.append({
                "pair_id": pair_id,
                "reason": "A report cannot be paired with itself",
            })
            continue

        if raw_label not in {
            "true", "false", "1", "0", "yes", "no", "y", "n"
        }:
            skipped.append({
                "pair_id": pair_id,
                "reason": "true_duplicate must be true or false",
            })
            continue

        expected = is_true(raw_label)
        url = (
            f"{API_BASE}"
            f"{DUPLICATE_ROUTE.format(report_id=report_a)}"
        )

        try:
            response = requests.get(
                url,
                headers=headers,
                timeout=TIMEOUT,
            )

            if response.status_code != 200:
                skipped.append({
                    "pair_id": pair_id,
                    "reason": (
                        f"API returned HTTP {response.status_code}: "
                        f"{response.text[:200]}"
                    ),
                })
                continue

            payload = response.json()
            candidates = payload.get("possibleDuplicates", [])

            # The API returns candidate report objects.
            candidate_ids = {
                str(item.get("_id", ""))
                for item in candidates
                if isinstance(item, dict)
            }

            predicted = report_b in candidate_ids
            correct = predicted == expected

            results.append({
                "pair_id": pair_id,
                "report_a": report_a,
                "report_b": report_b,
                "true_duplicate": expected,
                "predicted_duplicate": predicted,
                "correct": correct,
                "distance_method": payload.get("method", ""),
            })

            print(
                f"[{'CORRECT' if correct else 'WRONG'}] {pair_id}: "
                f"expected={expected}, predicted={predicted}"
            )

        except (requests.RequestException, ValueError) as error:
            skipped.append({
                "pair_id": pair_id,
                "reason": str(error),
            })

    output_csv = RESULTS_DIR / "duplicate_evaluation.csv"
    with output_csv.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        columns = [
            "pair_id", "report_a", "report_b",
            "true_duplicate", "predicted_duplicate",
            "correct", "distance_method",
        ]
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(results)

    skipped_csv = RESULTS_DIR / "duplicate_skipped.csv"
    with skipped_csv.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(
            file, fieldnames=["pair_id", "reason"]
        )
        writer.writeheader()
        writer.writerows(skipped)

    tp = sum(
        r["true_duplicate"] and r["predicted_duplicate"]
        for r in results
    )
    fp = sum(
        not r["true_duplicate"] and r["predicted_duplicate"]
        for r in results
    )
    fn = sum(
        r["true_duplicate"] and not r["predicted_duplicate"]
        for r in results
    )
    tn = sum(
        not r["true_duplicate"] and not r["predicted_duplicate"]
        for r in results
    )

    precision = safe_divide(tp, tp + fp)
    recall = safe_divide(tp, tp + fn)
    f1 = safe_divide(
        2 * precision * recall,
        precision + recall,
    )
    accuracy = safe_divide(tp + tn, len(results))

    summary = {
        "method": (
            "Existing GET /api/reports/:id/duplicates endpoint; "
            "a pair is predicted duplicate when report_b appears "
            "in report_a's possibleDuplicates response."
        ),
        "pairs_in_dataset": len(pairs),
        "pairs_evaluated": len(results),
        "pairs_skipped": len(skipped),
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "true_negative": tn,
        "accuracy": round(accuracy, 4) if results else None,
        "precision": round(precision, 4) if results else None,
        "recall": round(recall, 4) if results else None,
        "f1_score": round(f1, 4) if results else None,
        "limitations": [
            "Results depend on manually verified pair labels.",
            "The existing endpoint filters by category and distance.",
            "The endpoint updates possibleDuplicates on report_a.",
            "This measures candidate retrieval, not confirmed duplicates.",
        ],
    }

    summary_file = RESULTS_DIR / "duplicate_metrics.json"
    summary_file.write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )

    print("\n====== DUPLICATE EVALUATION ======")
    print(f"Evaluated: {len(results)}")
    print(f"Skipped: {len(skipped)}")
    print(f"TP={tp}, FP={fp}, FN={fn}, TN={tn}")
    print(f"Accuracy: {summary['accuracy']}")
    print(f"Precision: {summary['precision']}")
    print(f"Recall: {summary['recall']}")
    print(f"F1-score: {summary['f1_score']}")
    print(f"\nResults: {output_csv}")
    print(f"Metrics: {summary_file}")
    print(f"Skipped pairs: {skipped_csv}")


if __name__ == "__main__":
    main()
