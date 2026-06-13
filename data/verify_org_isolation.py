import json
from pathlib import Path
import shutil
import sqlite3
import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import database

from database import (
    assign_user_organization,
    create_organization,
    create_user,
    get_all_records,
    get_user_by_username,
    init_db,
    save_records,
)


def prepare_temp_database():
    temp_dir = BASE_DIR / "data" / "_verify_tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_db_path = temp_dir / "bookkeeping_verify.db"
    source_db_path = BASE_DIR / "data" / "bookkeeping.db"

    if temp_db_path.exists():
        temp_db_path.unlink()
    temp_wal = temp_db_path.with_suffix(".db-wal")
    temp_shm = temp_db_path.with_suffix(".db-shm")
    if temp_wal.exists():
        temp_wal.unlink()
    if temp_shm.exists():
        temp_shm.unlink()

    if source_db_path.exists():
        shutil.copy2(source_db_path, temp_db_path)
        source_wal = source_db_path.with_suffix(".db-wal")
        source_shm = source_db_path.with_suffix(".db-shm")
        if source_wal.exists():
            shutil.copy2(source_wal, temp_wal)
        if source_shm.exists():
            shutil.copy2(source_shm, temp_shm)
    else:
        conn = sqlite3.connect(temp_db_path)
        conn.close()

    database.DATA_DIR = temp_dir
    database.DB_PATH = temp_db_path
    database.BACKUP_DIR = temp_dir / "backups"
    database.MIGRATION_BACKUP_DONE = False



def ensure_user(
    username: str,
    password: str,
    display_name: str,
    organization_id: int,
    role: str,
    is_admin: bool = False,
):
    user = get_user_by_username(username)
    if user is None:
        user = create_user(username, password, display_name, organization_id, role)
    return assign_user_organization(
        user["id"],
        organization_id,
        role=role,
        is_admin=is_admin,
    )



def make_record(project_name: str, applicant: str, receiver: str, expense: float, owner_user_id: int):
    return {
        "日期": "2026-06-07",
        "项目名称": project_name,
        "申请人": applicant,
        "转款人": "",
        "收款人": receiver,
        "用途": "validation",
        "收入": 0,
        "支出": expense,
        "可退回": "否",
        "预计退回": "",
        "状态": "",
        "备注": f"{project_name} validation record",
        "owner_user_id": owner_user_id,
    }



def load_validation_projects(user: dict) -> list[str]:
    return [
        row["project_name"]
        for row in get_all_records(user)["records"]
        if row["project_name"].startswith("OrgA-") or row["project_name"].startswith("OrgB-")
    ]



def main():
    prepare_temp_database()
    init_db()

    org_a = create_organization("Org A Validation")
    org_b = create_organization("Org B Validation")

    boss_a = ensure_user("boss_a", "123456", "Boss A", org_a["id"], "boss")
    staff_a = ensure_user("staff_a", "123456", "Staff A", org_a["id"], "staff")
    boss_b = ensure_user("boss_b", "123456", "Boss B", org_b["id"], "boss")
    staff_b = ensure_user("staff_b", "123456", "Staff B", org_b["id"], "staff")

    save_records([make_record("OrgA-Boss", "Boss A", "A", 101, boss_a["id"])], boss_a["id"])
    save_records([make_record("OrgA-Staff", "Staff A", "A", 102, staff_a["id"])], staff_a["id"])
    save_records([make_record("OrgB-Boss", "Boss B", "B", 201, boss_b["id"])], boss_b["id"])
    save_records([make_record("OrgB-Staff", "Staff B", "B", 202, staff_b["id"])], staff_b["id"])

    result = {
        "boss_a_projects": load_validation_projects(boss_a),
        "staff_a_projects": load_validation_projects(staff_a),
        "boss_b_projects": load_validation_projects(boss_b),
        "staff_b_projects": load_validation_projects(staff_b),
    }

    checks = {
        "boss_a_sees_org_a_only": sorted(result["boss_a_projects"]) == ["OrgA-Boss", "OrgA-Staff"],
        "staff_a_sees_self_only": result["staff_a_projects"] == ["OrgA-Staff"],
        "boss_b_sees_org_b_only": sorted(result["boss_b_projects"]) == ["OrgB-Boss", "OrgB-Staff"],
        "staff_b_sees_self_only": result["staff_b_projects"] == ["OrgB-Staff"],
    }

    print(
        json.dumps(
            {
                "database_used": str(database.DB_PATH),
                "result": result,
                "checks": checks,
                "all_passed": all(checks.values()),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
