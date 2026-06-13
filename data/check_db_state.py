import sqlite3
from pathlib import Path
import database

path = Path(__file__).resolve().parent / 'bookkeeping.db'
conn = sqlite3.connect(path)
print('TABLES=', conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall())
print('MIGRATIONS=', conn.execute("SELECT version, note FROM schema_migrations ORDER BY version").fetchall())
print('USERS=', conn.execute("SELECT username, display_name, role, organization_id FROM users ORDER BY id").fetchall())
conn.close()
