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
    temp_dir = temp_root / f"role_flow_{run_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_db_path = temp_dir / "bookkeeping_verify.db"
    source_db_path = BASE_DIR / "data" / "bookkeeping.db"

    if source_db_path.exists():
        shutil.copy2(source_db_path, temp_db_path)
        for suffix in (".db-wal", ".db-shm"):
            source_sidecar = source_db_path.with_suffix(suffix)
            target_sidecar = temp_db_path.with_suffix(suffix)
            if source_sidecar.exists():
                shutil.copy2(source_sidecar, target_sidecar)
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
    boss_username = f"boss_flow_{suffix}"
    staff_username = f"staff_flow_{suffix}"
    staff2_username = f"staff_extra_{suffix}"

    with TestClient(main_module.app) as admin_client:
        status, _ = make_json_request(admin_client, "POST", "/api/login", {"username": "admin", "password": "admin888"})
        assert_ok(status, 200, "admin login failed")

        status, organizations_before = make_json_request(admin_client, "GET", "/api/admin/organizations")
        assert_ok(status, 200, "admin organizations list failed")
        org_count_before = len(organizations_before.get("organizations", []))

        status, created_boss = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "organization_name": f"role-flow-org-{suffix}",
                "display_name": f"role-flow-boss-{suffix}",
                "username": boss_username,
                "password": "123456",
                "role": "boss",
            },
        )
        assert_ok(status, 200, "admin create boss failed")
        boss_user = created_boss["user"]
        organization_id = boss_user["organization_id"]

        status, organizations_after = make_json_request(admin_client, "GET", "/api/admin/organizations")
        assert_ok(status, 200, "admin organizations refresh failed")

        status, org_structure_before_staff = make_json_request(
            admin_client,
            "GET",
            f"/api/org-structure?organization_id={organization_id}",
        )
        assert_ok(status, 200, "admin org structure failed")

        status, created_staff = make_json_request(
            admin_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": f"role-flow-staff-{suffix}",
                "username": staff_username,
                "password": "123456",
                "role": "staff",
                "organization_id": organization_id,
            },
        )
        assert_ok(status, 200, "admin create staff failed")
        staff_user = created_staff["user"]

        status, all_users = make_json_request(admin_client, "GET", "/api/admin/users")
        assert_ok(status, 200, "admin global user list failed")

    with TestClient(main_module.app) as boss_client:
        status, boss_org_structure = make_json_request(
            boss_client, "POST", "/api/login", {"username": boss_username, "password": "123456"}
        )
        assert_ok(status, 200, "boss login failed")

        status, boss_org_structure = make_json_request(boss_client, "GET", "/api/org-structure")
        assert_ok(status, 200, "boss org structure failed")

        status, forbidden_boss_create = make_json_request(
            boss_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": "blocked-boss",
                "username": f"blocked_boss_{suffix}",
                "password": "123456",
                "role": "boss",
            },
        )

        status, created_second_staff = make_json_request(
            boss_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": f"extra-staff-{suffix}",
                "username": staff2_username,
                "password": "123456",
                "role": "staff",
            },
        )
        assert_ok(status, 200, "boss create staff failed")

        status, renamed_org = make_json_request(
            boss_client,
            "PUT",
            "/api/org-structure",
            {"name": f"role-flow-org-renamed-{suffix}"},
        )
        assert_ok(status, 200, "boss rename organization failed")

    with TestClient(main_module.app) as staff_client:
        status, _ = make_json_request(staff_client, "POST", "/api/login", {"username": staff_username, "password": "123456"})
        assert_ok(status, 200, "staff login failed")

        status, _ = make_json_request(staff_client, "GET", "/api/org-structure")
        assert_ok(status, 200, "staff org structure failed")

        status, staff_create_blocked = make_json_request(
            staff_client,
            "POST",
            "/api/admin/users",
            {
                "display_name": "blocked-staff",
                "username": f"blocked_staff_{suffix}",
                "password": "123456",
                "role": "staff",
            },
        )

        status, staff_rename_blocked = make_json_request(
            staff_client,
            "PUT",
            "/api/org-structure",
            {"name": "should-not-rename"},
        )

        status, saved = make_json_request(
            staff_client,
            "POST",
            "/api/save",
            {
                "records": [
                    {
                        "日期": "2026-06-13",
                        "项目名称": "role-flow-record",
                        "申请人": "staff-self",
                        "转款人": "",
                        "收款人": "vendor-a",
                        "用途": "verify-staff-save",
                        "收入": 0,
                        "支出": 88,
                        "可退回": "否",
                        "预计退回": "",
                        "状态": "",
                        "备注": "role-flow-check",
                    }
                ]
            },
        )
        assert_ok(status, 200, "staff save record failed")

        status, staff_records = make_json_request(staff_client, "GET", "/api/records")
        assert_ok(status, 200, "staff records load failed")

    with TestClient(main_module.app) as boss_verify_client:
        status, _ = make_json_request(
            boss_verify_client, "POST", "/api/login", {"username": boss_username, "password": "123456"}
        )
        assert_ok(status, 200, "boss second login failed")
        status, boss_records = make_json_request(boss_verify_client, "GET", "/api/records")
        assert_ok(status, 200, "boss default records load failed")
        status, boss_team_records = make_json_request(boss_verify_client, "GET", "/api/records?view=team")
        assert_ok(status, 200, "boss team records load failed")
        status, boss_all_records = make_json_request(boss_verify_client, "GET", "/api/records?view=all")
        assert_ok(status, 200, "boss all records load failed")

    summary = {
        "database_used": str(database_path),
        "checks": {
            "admin_can_create_boss_org": boss_user["organization_id"] is not None,
            "admin_org_count_increased": len(organizations_after.get("organizations", [])) == org_count_before + 1,
            "admin_can_view_target_org": org_structure_before_staff["organization"]["id"] == organization_id,
            "admin_can_create_staff_in_target_org": staff_user["organization_id"] == organization_id,
            "admin_global_user_list_contains_created_accounts": sorted(
                [
                    user["username"]
                    for user in all_users.get("users", [])
                    if user["username"] in {boss_username, staff_username}
                ]
            ) == sorted([boss_username, staff_username]),
            "boss_can_view_own_org": boss_org_structure["organization"]["id"] == organization_id,
            "boss_cannot_create_boss": forbidden_boss_create.get("detail") == "老板当前只能新增员工账号",
            "boss_can_create_staff": created_second_staff["user"]["username"] == staff2_username,
            "boss_can_rename_org": renamed_org["organization"]["name"] == f"role-flow-org-renamed-{suffix}",
            "staff_is_read_only_for_org_admin_ops": (
                staff_create_blocked.get("detail") == "仅老板或开发人员可操作"
                and staff_rename_blocked.get("detail") == "仅老板或开发人员可操作"
            ),
            "staff_can_save_own_record": saved["count"] == 1,
            "staff_only_sees_own_records": len(staff_records.get("records", [])) == 1 and all(
                row["owner_user_id"] == staff_user["id"] for row in staff_records.get("records", [])
            ),
            "boss_default_view_is_own_records": all(
                row["owner_user_id"] == boss_user["id"] for row in boss_records.get("records", [])
            ),
            "boss_team_view_sees_staff_records": any(
                row["owner_user_id"] == staff_user["id"] for row in boss_team_records.get("records", [])
            ),
            "boss_all_view_contains_staff_records": any(
                row["owner_user_id"] == staff_user["id"] for row in boss_all_records.get("records", [])
            ),
        },
        "artifacts": {
            "created_boss_username": boss_username,
            "created_staff_username": staff_username,
            "created_second_staff_username": staff2_username,
            "organization_id": organization_id,
            "boss_forbidden_create_response": forbidden_boss_create,
            "boss_default_records_count": len(boss_records.get("records", [])),
            "boss_team_records_count": len(boss_team_records.get("records", [])),
            "boss_all_records_count": len(boss_all_records.get("records", [])),
            "staff_forbidden_create_response": staff_create_blocked,
            "staff_forbidden_rename_response": staff_rename_blocked,
        },
    }
    summary["all_passed"] = all(summary["checks"].values())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
