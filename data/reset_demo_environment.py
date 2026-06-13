import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import database


DEMO_ORGANIZATION_NAME = "演示公司"
DEMO_BOSS_USERNAME = "boss_demo"
DEMO_BOSS_PASSWORD = "123456"
DEMO_BOSS_DISPLAY_NAME = "演示老板"
DEMO_STAFF_USERNAME = "staff_demo"
DEMO_STAFF_PASSWORD = "123456"
DEMO_STAFF_DISPLAY_NAME = "演示员工"


def clear_directory(path: Path):
    if not path.exists():
        return
    for child in path.iterdir():
        if child.is_file():
            child.unlink()


def main():
    conn = database.get_conn()
    try:
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("DELETE FROM records")
        conn.execute("DELETE FROM audit_events")
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM settings")
        conn.execute("DELETE FROM users")
        conn.execute("DELETE FROM organizations")
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('users', 'organizations', 'records', 'sessions', 'audit_events')"
        )

        admin_hash = database.hash_password("admin888")
        conn.execute(
            """
            INSERT INTO users (username, password_hash, display_name, is_admin, organization_id, role)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("admin", admin_hash, "开发人员", 1, None, database.ROLE_ADMIN),
        )

        cur = conn.execute(
            "INSERT INTO organizations (name, owner_user_id) VALUES (?, ?)",
            (DEMO_ORGANIZATION_NAME, None),
        )
        organization_id = cur.lastrowid

        boss_hash = database.hash_password(DEMO_BOSS_PASSWORD)
        cur = conn.execute(
            """
            INSERT INTO users (username, password_hash, display_name, is_admin, organization_id, role)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                DEMO_BOSS_USERNAME,
                boss_hash,
                DEMO_BOSS_DISPLAY_NAME,
                0,
                organization_id,
                database.ROLE_BOSS,
            ),
        )
        boss_id = cur.lastrowid

        staff_hash = database.hash_password(DEMO_STAFF_PASSWORD)
        conn.execute(
            """
            INSERT INTO users (username, password_hash, display_name, is_admin, organization_id, role)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                DEMO_STAFF_USERNAME,
                staff_hash,
                DEMO_STAFF_DISPLAY_NAME,
                0,
                organization_id,
                database.ROLE_STAFF,
            ),
        )

        conn.execute(
            "UPDATE organizations SET owner_user_id = ? WHERE id = ?",
            (boss_id, organization_id),
        )
        conn.execute("PRAGMA foreign_keys=ON")
        conn.commit()
    finally:
        conn.close()

    clear_directory(BASE_DIR / "data" / "exports")

    print(
        "\n".join(
            [
                "reset_ok",
                f"organization={DEMO_ORGANIZATION_NAME}",
                "admin=admin/admin888",
                f"boss={DEMO_BOSS_USERNAME}/{DEMO_BOSS_PASSWORD}",
                f"staff={DEMO_STAFF_USERNAME}/{DEMO_STAFF_PASSWORD}",
            ]
        )
    )


if __name__ == "__main__":
    main()
