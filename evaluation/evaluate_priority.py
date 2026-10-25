
import csv
import getpass
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"
INPUT = ROOT / "priority_reports.csv"
API = "http://localhost:5000/api"
TIMEOUT = 30


def main():
    RESULTS.mkdir(parents=True, exist_ok=True)

    if not INPUT.exists():
        sys.exit(f"Dataset not found: {INPUT}")

    with INPUT.open(
        "r", newline="", encoding="utf-8-sig"
    ) as file:
        reader = csv.DictReader(file)
        required = {"report_id", "reference_rank"}

        if not reader.fieldnames or not required.issubset(
            set(reader.fieldnames)
        ):
            sys.exit(
                "CSV headers must be report_id,reference_rank"
            )

        rows = list(reader)

    if not rows:
        sys.exit("No reports listed in priority_reports.csv")

    email = input("Admin email: ").strip()
    password = getpass.getpass("Admin password: ")

    try:
        response = requests.post(
            f"{API}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        login = response.json()
    except (requests.RequestException, ValueError) as error:
        sys.exit(f"Login failed: {error}")

    if login.get("user", {}).get("role") != "admin":
        sys.exit("An admin account is required.")

    token = login.get("token")
    if not token:
        sys.exit("Login response did not contain a token.")

    headers = {"Authorization": f"Bearer {token}"}
    evaluated = []
    skipped = []

    for row in rows:
        report_id = (row.get("report_id") or "").strip()
        raw_rank = (row.get("reference_rank") or "").strip()

        if not report_id:
            skipped.append({
                "report_id": "",
                "reason": "Missing report ID",
            })
            continue

        try:
            reference_rank = int(raw_rank)
            if reference_rank < 1:
                raise ValueError("Rank must be positive")
        except ValueError:
            skipped.append({
                "report_id": report_id,
                "reason": "Invalid reference rank",
            })
            continue

        try:
            response = requests.post(
                f"{API}/reports/{report_id}/recalculate-priority",
                headers=headers,
                timeout=TIMEOUT,
            )

            if response.status_code != 200:
                skipped.append({
                    "report_id": report_id,
                    "reason": (
                        f"API returned HTTP {response.status_code}: "
                        f"{response.text[:200]}"
                    ),
                })
                continue

            payload = response.json()
            report = payload["report"]
            priority = payload["priority"]
            breakdown = priority["breakdown"]

            evaluated.append({
                "report_id": report_id,
                "title": report.get("title", ""),
                "category": report.get("category", ""),
                "severity": report.get("severity", 3),
                "created_at": str(report.get("createdAt", "")),
                "reference_rank": reference_rank,
                "priority_score": priority["score"],
                "severity_points": breakdown["severity"],
                "age_points": breakdown["age"],
                "recurrence_points": breakdown["recurrence"],
                "nearby_count": priority["nearbyCount"],
            })

            print(
                f"[OK] {report_id}: "
                f"score={priority['score']}, "
                f"reference_rank={reference_rank}"
            )

        except (
            requests.RequestException,
            KeyError,
            TypeError,
            ValueError,
        ) as error:
            skipped.append({
                "report_id": report_id,
                "reason": str(error),
            })

    # Rank 1 means highest calculated score.
    evaluated.sort(
        key=lambda item: (
            -float(item["priority_score"]),
            item["report_id"],
        )
    )

    for rank, item in enumerate(evaluated, start=1):
        item["calculated_rank"] = rank
        item["rank_difference"] = (
            rank - int(item["reference_rank"])
        )

    output_csv = RESULTS / "priority_evaluation.csv"
    columns = [
        "report_id",
        "title",
        "category",
        "severity",
        "created_at",
        "reference_rank",
        "calculated_rank",
        "rank_difference",
        "priority_score",
        "severity_points",
        "age_points",
        "recurrence_points",
        "nearby_count",
    ]

    with output_csv.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(evaluated)

    skipped_csv = RESULTS / "priority_skipped.csv"
    with skipped_csv.open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(
            file, fieldnames=["report_id", "reason"]
        )
        writer.writeheader()
        writer.writerows(skipped)

    comparable = [
        item for item in evaluated
        if item["reference_rank"] is not None
    ]

    exact_rank_matches = sum(
        item["calculated_rank"] == item["reference_rank"]
        for item in comparable
    )

    summary = {
        "reports_in_dataset": len(rows),
        "reports_evaluated": len(evaluated),
        "reports_skipped": len(skipped),
        "exact_rank_matches": exact_rank_matches,
        "exact_rank_match_rate": (
            round(exact_rank_matches / len(comparable), 4)
            if comparable else None
        ),
        "note": (
            "This compares calculated rankings with the supplied "
            "reference ranks. Results are not meaningful until "
            "reference ranks are independently assigned using a "
            "documented severity, recurrence, and age rubric. "
            "The endpoint recalculates and saves each report's score."
        ),
    }

    summary_file = RESULTS / "priority_metrics.json"
    summary_file.write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )

    print("\n====== PRIORITY EVALUATION ======")
    print(f"Evaluated: {len(evaluated)}")
    print(f"Skipped: {len(skipped)}")
    print(f"Exact rank matches: {exact_rank_matches}")
    print(f"Rank match rate: {summary['exact_rank_match_rate']}")
    print(f"\nResults: {output_csv}")
    print(f"Summary: {summary_file}")
    print(f"Skipped: {skipped_csv}")


if __name__ == "__main__":
    main()
