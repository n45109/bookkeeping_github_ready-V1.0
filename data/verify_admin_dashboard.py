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
    temp_dir = temp_root / f"admin_dashboard_{run_id}"
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


def create_staff(client: TestClient, username: str, organization_id: int):
    status, data = make_json_request(
        client,
        "POST",
        "/api/admin/users",
        {
            "display_name": username,
            "username": username,
            "password": "123456",
            "role": "staff",
            "organization_id": organization_id,
        },
    )
    assert_ok(status, 200, f"create staff failed for {username}")
    return data["user"]


def save_record(client: TestClient, project_name: str):
    status, data = make_json_request(
        client,
        "POST",
        "/api/save",
        {
            "records": [
                {
                    "日期": "2026-06-14",
                    "项目名称": project_name,
                    "申请人": "tester",
                    "转款人": "",
                    "收款人": "vendor",
                    "用途": "verify",
                    "收入": 0,
                    "支出": 66,
                    "可退回": "否",
                    "预计退回": "",
                    "状态": "",
                    "备注": "",
                }
            ]
        },
    )
    assert_ok(status, 200, f"save record failed for {project_name}")
    return data


def main():
    database_path = prepare_temp_database()
    main_module = importlib.import_module("main")
    main_module = importlib.reload(main_module)

    suffix = datetime.now().strftime("%H%M%S%f")
    boss_username = f"boss_admin_dash_{suffix}"
    staff_username = f"staff_admin_dash_{suffix}"

    with TestClient(main_module.app) as admin_client:
        status, _ = make_json_request(admin_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin login failed")

        status, boss_data = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "organization_name": f"admin-dash-org-{suffix}",
                "display_name": boss_username,
                "username": boss_username,
                "password": "123456",
                "role": "boss",
            },
        )
        assert_ok(status, 200, "create boss failed")
        boss_user = boss_data["user"]
        organization_id = boss_user["organization_id"]
        create_staff(admin_client, staff_username, organization_id)

    with TestClient(main_module.app) as boss_client:
        status, _ = make_json_request(boss_client, "POST", "/api/login", {"username": boss_username, "password": "123456"})
        assert_ok(status, 200, "boss login failed")
        save_record(boss_client, "admin-dashboard-record")

    with TestClient(main_module.app) as admin_verify_client:
        status, _ = make_json_request(admin_verify_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin verify login failed")
        status, dashboard = make_json_request(admin_verify_client, "GET", "/api/admin/dashboard")
        assert_ok(status, 200, "admin dashboard failed")

    counts = dashboard.get("counts", {})
    token_usage = dashboard.get("token_usage", {})
    summary = {
        "database_used": str(database_path),
        "checks": {
            "counts_include_core_entities": all(key in counts for key in ["organizations", "users", "records", "sessions", "audit_events"]),
            "record_count_is_positive": counts.get("records", 0) >= 1,
            "audit_event_count_is_positive": counts.get("audit_events", 0) >= 3,
            "database_size_is_reported": dashboard.get("database_size_bytes", 0) > 0,
            "recent_activity_is_present": len(dashboard.get("recent_activity", [])) >= 1,
            "per_user_activity_is_present": len(dashboard.get("per_user_activity", [])) >= 1,
            "record_distribution_is_present": len(dashboard.get("record_distribution", [])) >= 1,
            "recent_records_are_present": len(dashboard.get("recent_records", [])) >= 1,
            "token_usage_shape_is_present": all(key in token_usage for key in ["prompt_tokens", "completion_tokens", "total_tokens"]),
        },
        "artifacts": {
            "counts": counts,
            "recent_activity_size": len(dashboard.get("recent_activity", [])),
            "per_user_activity_size": len(dashboard.get("per_user_activity", [])),
            "record_distribution_size": len(dashboard.get("record_distribution", [])),
            "recent_records_size": len(dashboard.get("recent_records", [])),
        },
    }
    summary["all_passed"] = all(summary["checks"].values())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
