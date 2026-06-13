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
    temp_dir = temp_root / f"password_mgmt_{run_id}"
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


def main():
    database_path = prepare_temp_database()
    main_module = importlib.import_module("main")
    main_module = importlib.reload(main_module)

    suffix = datetime.now().strftime("%H%M%S%f")
    boss_username = f"boss_pwd_{suffix}"
    staff_username = f"staff_pwd_{suffix}"

    with TestClient(main_module.app) as admin_client:
        status, _ = make_json_request(admin_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin login failed")

        status, boss_data = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "organization_name": f"password-org-{suffix}",
                "display_name": boss_username,
                "username": boss_username,
                "password": "123456",
                "role": "boss",
            },
        )
        assert_ok(status, 200, "create boss failed")
        boss_user = boss_data["user"]

        status, staff_data = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": staff_username,
                "username": staff_username,
                "password": "123456",
                "role": "staff",
                "organization_id": boss_user["organization_id"],
            },
        )
        assert_ok(status, 200, "create staff failed")
        staff_user = staff_data["user"]

        status, reset_staff = make_json_request(
            admin_client,
            "POST",
            f"/api/admin/users/{staff_user['id']}/reset-password",
            {"new_password": "staff999"},
        )
        assert_ok(status, 200, "admin reset staff password failed")

        status, reset_boss = make_json_request(
            admin_client,
            "POST",
            f"/api/admin/users/{boss_user['id']}/reset-password",
            {"new_password": "boss999"},
        )
        assert_ok(status, 200, "admin reset boss password failed")

        status, reset_admin_denied = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users/1/reset-password",
            {"new_password": "admin999"},
        )

    with TestClient(main_module.app) as staff_client:
        status, _ = make_json_request(staff_client, "POST", "/api/login", {"username": staff_username, "password": "staff999"})
        assert_ok(status, 200, "staff login with reset password failed")
        status, change_staff_pwd = make_json_request(
            staff_client,
            "POST",
            "/api/change-password",
            {
                "current_password": "staff999",
                "new_password": "staff777",
                "confirm_password": "staff777",
            },
        )
        assert_ok(status, 200, "staff change own password failed")

    with TestClient(main_module.app) as boss_client:
        status, _ = make_json_request(boss_client, "POST", "/api/login", {"username": boss_username, "password": "boss999"})
        assert_ok(status, 200, "boss login with reset password failed")
        status, change_boss_pwd = make_json_request(
            boss_client,
            "POST",
            "/api/change-password",
            {
                "current_password": "boss999",
                "new_password": "boss777",
                "confirm_password": "boss777",
            },
        )
        assert_ok(status, 200, "boss change own password failed")

    with TestClient(main_module.app) as admin_verify_client:
        status, _ = make_json_request(admin_verify_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin verify login failed")
        status, change_admin_pwd = make_json_request(
            admin_verify_client,
            "POST",
            "/api/change-password",
            {
                "current_password": "admin888",
                "new_password": "admin777",
                "confirm_password": "admin777",
            },
        )
        assert_ok(status, 200, "admin change own password failed")

    summary = {
        "database_used": str(database_path),
        "checks": {
            "admin_can_reset_staff_password": reset_staff.get("ok") is True,
            "admin_can_reset_boss_password": reset_boss.get("ok") is True,
            "admin_cannot_reset_admin_password": reset_admin_denied.get("detail") == "开发人员账号请自行修改密码",
            "staff_can_login_after_reset": True,
            "staff_can_change_own_password": change_staff_pwd.get("ok") is True,
            "boss_can_login_after_reset": True,
            "boss_can_change_own_password": change_boss_pwd.get("ok") is True,
            "admin_can_change_own_password": change_admin_pwd.get("ok") is True,
        },
        "artifacts": {
            "boss_username": boss_username,
            "staff_username": staff_username,
            "reset_admin_denied_response": reset_admin_denied,
        },
    }
    summary["all_passed"] = all(summary["checks"].values())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
