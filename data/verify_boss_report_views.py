import importlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient


BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import database


def prepare_temp_database():
    temp_root = BASE_DIR / "data" / "_verify_tmp"
    temp_root.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    temp_dir = temp_root / f"boss_report_{run_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_db_path = temp_dir / "bookkeeping_verify.db"
    source_db_path = BASE_DIR / "data" / "bookkeeping.db"

    if source_db_path.exists():
        shutil.copy2(source_db_path, temp_db_path)
    else:
        conn = sqlite3.connect(temp_db_path)
        conn.close()

    database.DATA_DIR = temp_dir
    database.DB_PATH = temp_db_path
    database.BACKUP_DIR = temp_dir / "backups"
    database.MIGRATION_BACKUP_DONE = False
    database.init_db()
    return temp_db_path


def make_json_request(client: TestClient, method: str, path: str, payload=None):
    response = client.request(method, path, json=payload)
    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}
    return response.status_code, data


def assert_ok(status_code: int, expected: int, message: str):
    if status_code != expected:
        raise AssertionError(f"{message}: expected {expected}, got {status_code}")


def make_record(project_name: str, applicant: str, receiver: str, purpose: str, expense: float):
    return {
        "date": "2026-06-14",
        "project_name": project_name,
        "applicant": applicant,
        "payer": "",
        "receiver": receiver,
        "purpose": purpose,
        "income": 0,
        "expense": expense,
        "refundable": "No",
        "expected_refund": "",
        "status": "",
        "remark": "",
    }


def save_one_record(client: TestClient, project_name: str, applicant: str, receiver: str, purpose: str, expense: float):
    status, data = make_json_request(
        client,
        "POST",
        "/api/save",
        {
            "records": [
                {
                    "日期": "2026-06-14",
                    "项目名称": project_name,
                    "申请人": applicant,
                    "转款人": "",
                    "收款人": receiver,
                    "用途": purpose,
                    "收入": 0,
                    "支出": expense,
                    "可退回": "否",
                    "预计退回": "",
                    "状态": "",
                    "备注": "",
                }
            ]
        },
    )
    assert_ok(status, 200, f"save failed for {project_name}")
    return data


def main():
    database_path = prepare_temp_database()
    main_module = importlib.import_module("main")
    main_module = importlib.reload(main_module)

    suffix = datetime.now().strftime("%H%M%S%f")
    boss_username = f"boss_report_{suffix}"
    staff_a_username = f"staff_report_a_{suffix}"
    staff_b_username = f"staff_report_b_{suffix}"

    with TestClient(main_module.app) as admin_client:
        status, _ = make_json_request(admin_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin login failed")

        status, created_boss = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "organization_name": f"boss-report-org-{suffix}",
                "display_name": f"boss-report-{suffix}",
                "username": boss_username,
                "password": "123456",
                "role": "boss",
            },
        )
        assert_ok(status, 200, "create boss failed")
        boss_user = created_boss["user"]
        organization_id = boss_user["organization_id"]

        status, created_staff_a = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": f"staff-a-{suffix}",
                "username": staff_a_username,
                "password": "123456",
                "role": "staff",
                "organization_id": organization_id,
            },
        )
        assert_ok(status, 200, "create staff a failed")
        staff_a_user = created_staff_a["user"]

        status, created_staff_b = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": f"staff-b-{suffix}",
                "username": staff_b_username,
                "password": "123456",
                "role": "staff",
                "organization_id": organization_id,
            },
        )
        assert_ok(status, 200, "create staff b failed")
        staff_b_user = created_staff_b["user"]

    with TestClient(main_module.app) as boss_client:
        status, _ = make_json_request(boss_client, "POST", "/api/login", {"username": boss_username, "password": "123456"})
        assert_ok(status, 200, "boss login failed")
        save_one_record(boss_client, "boss-record", "boss-self", "vendor-a", "boss-spend", 100)

    with TestClient(main_module.app) as staff_a_client:
        status, _ = make_json_request(staff_a_client, "POST", "/api/login", {"username": staff_a_username, "password": "123456"})
        assert_ok(status, 200, "staff a login failed")
        save_one_record(staff_a_client, "staff-a-record", "staff-a", "vendor-b", "staff-a-spend", 80)

    with TestClient(main_module.app) as staff_b_client:
        status, _ = make_json_request(staff_b_client, "POST", "/api/login", {"username": staff_b_username, "password": "123456"})
        assert_ok(status, 200, "staff b login failed")
        save_one_record(staff_b_client, "staff-b-record", "staff-b", "vendor-c", "staff-b-spend", 60)

    with TestClient(main_module.app) as boss_verify_client:
        status, _ = make_json_request(boss_verify_client, "POST", "/api/login", {"username": boss_username, "password": "123456"})
        assert_ok(status, 200, "boss verify login failed")

        status, mine_records = make_json_request(boss_verify_client, "GET", "/api/records?view=mine")
        assert_ok(status, 200, "boss mine view failed")
        status, team_records = make_json_request(boss_verify_client, "GET", "/api/records?view=team")
        assert_ok(status, 200, "boss team view failed")
        status, all_records = make_json_request(boss_verify_client, "GET", "/api/records?view=all")
        assert_ok(status, 200, "boss all view failed")
        status, staff_a_records = make_json_request(
            boss_verify_client,
            "GET",
            f"/api/records?view=team&owner_user_id={staff_a_user['id']}",
        )
        assert_ok(status, 200, "boss filtered team view failed")

    summary = {
        "database_used": str(database_path),
        "checks": {
            "mine_view_only_contains_boss_records": len(mine_records.get("records", [])) == 1 and all(
                row["owner_user_id"] == boss_user["id"] for row in mine_records.get("records", [])
            ),
            "team_view_excludes_boss_records": len(team_records.get("records", [])) == 2 and all(
                row["owner_user_id"] != boss_user["id"] for row in team_records.get("records", [])
            ),
            "all_view_contains_all_org_records": len(all_records.get("records", [])) == 3,
            "team_owner_filter_targets_single_staff": len(staff_a_records.get("records", [])) == 1 and all(
                row["owner_user_id"] == staff_a_user["id"] for row in staff_a_records.get("records", [])
            ),
            "team_view_has_owner_options": len(team_records.get("owner_options", [])) >= 3,
            "mine_balance_label_is_current": mine_records.get("balance_label") == "当前余额",
            "team_balance_label_is_team": team_records.get("balance_label") == "团队净额",
            "all_balance_label_is_org": all_records.get("balance_label") == "组织净额",
        },
        "artifacts": {
            "organization_id": organization_id,
            "boss_id": boss_user["id"],
            "staff_a_id": staff_a_user["id"],
            "staff_b_id": staff_b_user["id"],
            "mine_view": mine_records.get("view"),
            "team_view": team_records.get("view"),
            "all_view": all_records.get("view"),
        },
    }
    summary["all_passed"] = all(summary["checks"].values())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
