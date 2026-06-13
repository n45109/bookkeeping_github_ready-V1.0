"""
工作记账软件 — 后端服务（多用户版）
"""
import json
import os
import logging
import sqlite3
import traceback
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from openai import OpenAI

from database import (
    get_conn, init_db, get_setting, set_setting, has_setting,
    save_records, update_record, load_records, has_records, get_all_records, delete_records, get_record_owner, get_record,
    get_balance, export_to_excel, DB_PATH,
    authenticate, get_user, get_user_by_session, list_users, create_user, can_manage_organization_records, can_manage_system,
    get_organization_summary, delete_user, user_has_related_records, update_organization_name, list_organizations,
    create_organization, set_organization_owner, get_user_by_username, get_organization,
    create_session, delete_session, get_report_records, log_audit_event, get_admin_dashboard_snapshot,
    get_user_with_password, verify_password, update_user_password,
)

# ========== 配置 ==========
# 维护提示：后续新增后端功能时，请同步补齐成功日志、失败日志和前端错误上报链路。
BASE_DIR = Path(__file__).parent
API_KEY = os.getenv("DEEPSEEK_API_KEY", "sk-982fcfbe7171436f9e31012b7ba0b3c8")
API_BASE = "https://api.deepseek.com"
MODEL = "deepseek-chat"
COOKIE_NAME = "jizhang_token"
LOG_DIR = BASE_DIR / "data"
LOG_DIR.mkdir(parents=True, exist_ok=True)
APP_LOG = LOG_DIR / "app.log"
ERROR_LOG = LOG_DIR / "error.log"

app_logger = logging.getLogger("bookkeeping.app")
error_logger = logging.getLogger("bookkeeping.error")
if not app_logger.handlers:
    app_logger.setLevel(logging.INFO)
    app_handler = logging.FileHandler(APP_LOG, encoding="utf-8")
    app_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    app_logger.addHandler(app_handler)
if not error_logger.handlers:
    error_logger.setLevel(logging.ERROR)
    err_handler = logging.FileHandler(ERROR_LOG, encoding="utf-8")
    err_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    error_logger.addHandler(err_handler)

client = OpenAI(api_key=API_KEY, base_url=API_BASE)
app = FastAPI(title="记账软件")

# ========== 会话依赖 ==========

def log_error(event: str, **extra):
    detail = {k: v for k, v in extra.items() if v is not None}
    error_logger.error("%s | %s", event, json.dumps(detail, ensure_ascii=False))


def get_current_user(request: Request) -> dict:
    """从 cookie 获取当前登录用户，未登录抛出 401"""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "未登录")
    user = get_user_by_session(token)
    if not user:
        raise HTTPException(401, "会话已过期，请重新登录")
    return user


def can_access_record(user: dict, record_id: int) -> bool:
    record = get_record(record_id)
    if not record:
        return False
    if can_manage_system(user):
        return True
    if user.get("organization_id") != record.get("organization_id"):
        return False
    if can_manage_organization_records(user):
        return True
    return record.get("owner_user_id") == user["id"]


def require_org_manager(user: dict):
    if not can_manage_organization_records(user):
        raise HTTPException(403, "仅老板或开发人员可操作")


def require_system_admin(user: dict):
    if not can_manage_system(user):
        raise HTTPException(403, "仅开发人员账号可操作")

# ========== AI 分类 ==========

SYSTEM_PROMPT = """你是记账助手。将用户的口语化记账文字转换为结构化 JSON 数组返回。

规则：
1. 如果一段话包含多笔交易，拆分成多条
2. 日期：模糊日期转具体日期（"昨天"=昨天，"上个月"=上个月）。没有日期用今天
3. 中文数字转阿拉伯数字（三十万=300000，两万=20000）
4. 字段提取：
   - 申请人：谁申请的/谁发起的
   - 转款人：谁转出的钱（可能为空）
   - 收款人：钱给了谁
   - 用途：钱的用途说明
   - 收入/支出：收钱填收入列支出为空，花钱填支出列收入为空。两个不同时填
   - 可退回："是"或"否"，提到"退回""可退""退还"就是"是"，默认"否"
   - 预计退回：用户说"预计X天/月后退回"转成具体日期，否则留空
   - 备注：损耗说明、部分退回金额、退回条件等
   - 项目名称：用户明确提到项目名则提取，否则留空

返回格式：[{"日期":"2025-02-12","项目名称":"","申请人":"陆敏","转款人":"","收款人":"6975卡","用途":"转入","收入":300000,"支出":"","可退回":"否","预计退回":"","备注":""}]

只返回 JSON 数组，不要任何其他文字。"""

def classify(text: str) -> list[dict]:
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    user_msg = f"今天是{today}，昨天是{yesterday}。\n\n用户输入：{text}"
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        raw = resp.choices[0].message.content.strip()
        usage = resp.usage
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw), usage
    except json.JSONDecodeError:
        raise HTTPException(500, "AI 返回格式异常，请换种说法重试。")
    except Exception:
        raise HTTPException(500, "AI 服务调用失败，请检查网络后重试。")


# ========== 认证 API ==========

@app.post("/api/login")
async def api_login(data: dict, response: Response):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        raise HTTPException(400, "请输入账号和密码")
    app_logger.info("login_attempt username=%s", username)
    user = authenticate(username, password)
    if not user:
        raise HTTPException(401, "账号或密码错误")
    token = create_session(user["id"])
    app_logger.info("login_success user_id=%s username=%s", user["id"], user["username"])
    log_audit_event("login_success", user=user, request_path="/api/login")
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, max_age=7*24*3600, samesite="lax"
    )
    return {"ok": True, "user": {"id": user["id"], "username": user["username"], "display_name": user["display_name"], "is_admin": user["is_admin"], "role": user.get("role"), "organization_id": user.get("organization_id")}}


@app.post("/api/frontend-error")
async def api_frontend_error(data: dict, request: Request):
    user = None
    token = request.cookies.get(COOKIE_NAME)
    if token:
        user = get_user_by_session(token)
    log_error(
        "frontend_error",
        user_id=user["id"] if user else None,
        username=user["username"] if user else None,
        page=data.get("page"),
        frontend_message=data.get("message"),
        source=data.get("source"),
        line=data.get("line"),
        column=data.get("column"),
        stack=data.get("stack"),
        kind=data.get("kind"),
    )
    log_audit_event(
        "frontend_error",
        user=user,
        request_path="/api/frontend-error",
        detail={
            "kind": data.get("kind"),
            "message": data.get("message"),
            "source": data.get("source"),
        },
    )
    return {"ok": True}


@app.post("/api/logout")
async def api_logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_by_session(token) if token else None
    if token:
        delete_session(token)
    if user:
        log_audit_event("logout", user=user, request_path="/api/logout")
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@app.post("/api/change-password")
async def api_change_password(data: dict, request: Request):
    user = get_current_user(request)
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")

    if not current_password or not new_password or not confirm_password:
        raise HTTPException(400, "请填写当前密码、新密码和确认密码")
    if new_password != confirm_password:
        raise HTTPException(400, "两次输入的新密码不一致")
    if len(new_password) < 6:
        raise HTTPException(400, "新密码至少需要 6 位")

    stored_user = get_user_with_password(user["id"])
    if not stored_user or not verify_password(current_password, stored_user["password_hash"]):
        raise HTTPException(400, "当前密码不正确")

    update_user_password(user["id"], new_password)
    log_audit_event("change_password", user=user, request_path="/api/change-password")
    return {"ok": True}


# ========== 记账 API（需登录）==========

@app.get("/api/me")
async def api_me_endpoint(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return {"user": None}
    user = get_user_by_session(token)
    if not user:
        return {"user": None}
    return {"user": user}


@app.post("/api/classify")
async def api_classify(data: dict, request: Request):
    user = get_current_user(request)
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(400, "请输入记账文字")
    if not has_records(user) and not has_setting(user["id"], "initial_balance"):
        return {"need_init": True}
    records, usage = classify(text)
    balance = get_balance(user)
    preview = []
    for rec in records:
        income = float(rec.get("收入") or 0)
        expense = float(rec.get("支出") or 0)
        balance = balance + income - expense
        preview.append({**rec, "余额": balance})
    log_audit_event(
        "classify",
        user=user,
        request_path="/api/classify",
        detail={"preview_count": len(preview)},
        prompt_tokens=getattr(usage, "prompt_tokens", 0),
        completion_tokens=getattr(usage, "completion_tokens", 0),
        total_tokens=getattr(usage, "total_tokens", 0),
    )
    return {"records": preview}


@app.post("/api/save")
async def api_save(data: dict, request: Request):
    user = get_current_user(request)
    records = data.get("records", [])
    if not records:
        raise HTTPException(400, "没有要保存的记录")
    save_records(records, user["id"])
    app_logger.info("save_records user_id=%s count=%s", user["id"], len(records))
    log_audit_event(
        "save_records",
        user=user,
        request_path="/api/save",
        detail={"count": len(records)},
    )
    return {"ok": True, "count": len(records)}


@app.get("/api/load")
async def api_load(request: Request):
    user = get_current_user(request)
    return load_records(user)


@app.get("/api/recent")
async def api_recent(request: Request):
    user = get_current_user(request)
    return load_records(user, limit=10)


@app.get("/api/records")
async def api_records(request: Request):
    user = get_current_user(request)
    view = request.query_params.get("view")
    owner_user_id = request.query_params.get("owner_user_id")
    return get_report_records(user, view=view, owner_user_id=owner_user_id)


@app.put("/api/records/{record_id}")
async def api_update_record(record_id: int, data: dict, request: Request):
    user = get_current_user(request)
    if not can_access_record(user, record_id):
        raise HTTPException(404, "记录不存在")
    update_record(record_id, data)
    log_audit_event(
        "update_record",
        user=user,
        request_path=f"/api/records/{record_id}",
        detail={"record_id": record_id},
    )
    return {"ok": True}

@app.delete("/api/records")
async def api_delete_records(data: dict, request: Request):
    user = get_current_user(request)
    record_ids = [int(x) for x in (data.get("ids") or []) if str(x).strip()]
    if not record_ids:
        raise HTTPException(400, "没有要删除的记录")
    deleted = delete_records(record_ids, user)
    app_logger.info("delete_records user_id=%s ids=%s deleted=%s", user["id"], record_ids, deleted)
    log_audit_event(
        "delete_records",
        user=user,
        request_path="/api/records",
        detail={"ids": record_ids, "deleted": deleted},
    )
    return {"ok": True, "deleted": deleted}


@app.post("/api/init-balance")
async def api_init_balance(data: dict, request: Request):
    user = get_current_user(request)
    balance = data.get("balance", 0)
    if has_records(user) or has_setting(user["id"], "initial_balance"):
        raise HTTPException(400, "已初始化过")
    set_setting(user["id"], "initial_balance", str(float(balance)))
    return {"ok": True}


@app.get("/api/export")
async def api_export(request: Request):
    user = get_current_user(request)
    if not has_records(user):
        raise HTTPException(400, "没有数据可导出")
    try:
        path = export_to_excel(user)
    except ModuleNotFoundError as exc:
        log_error("export_dependency_missing", user_id=user["id"], missing_module=str(exc))
        raise HTTPException(500, "导出功能缺少依赖 openpyxl，请稍后修复后再试")
    app_logger.info("export_excel user_id=%s path=%s", user["id"], path)
    log_audit_event(
        "export_excel",
        user=user,
        request_path="/api/export",
        detail={"path": str(path)},
    )
    return FileResponse(path, filename=Path(path).name,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ========== 管理员 API ==========

@app.get("/api/admin/users")
async def api_admin_users(request: Request):
    user = get_current_user(request)
    require_org_manager(user)
    org_id = request.query_params.get("organization_id")
    if can_manage_system(user):
        if org_id:
            try:
                organization_id = int(org_id)
            except ValueError as exc:
                raise HTTPException(400, "organization_id 格式不正确") from exc
            return {"users": list_users(organization_id)}
        return {"users": list_users()}
    return {"users": list_users(user.get("organization_id"))}


@app.get("/api/admin/organizations")
async def api_admin_organizations(request: Request):
    user = get_current_user(request)
    require_system_admin(user)
    return {"organizations": list_organizations()}


@app.get("/api/admin/dashboard")
async def api_admin_dashboard(request: Request):
    user = get_current_user(request)
    require_system_admin(user)
    return get_admin_dashboard_snapshot()


@app.post("/api/admin/users/{user_id}/reset-password")
async def api_admin_reset_password(user_id: int, data: dict, request: Request):
    admin = get_current_user(request)
    require_system_admin(admin)
    target_user = get_user(user_id)
    if not target_user:
        raise HTTPException(404, "用户不存在")
    if target_user.get("is_admin") or target_user.get("role") == "admin":
        raise HTTPException(400, "开发人员账号请自行修改密码")

    new_password = data.get("new_password", "")
    if not new_password:
        raise HTTPException(400, "请填写新密码")
    if len(new_password) < 6:
        raise HTTPException(400, "新密码至少需要 6 位")

    update_user_password(user_id, new_password)
    log_audit_event(
        "reset_password",
        user=admin,
        request_path=f"/api/admin/users/{user_id}/reset-password",
        detail={"target_user_id": user_id, "target_username": target_user.get("username")},
    )
    return {"ok": True}


@app.get("/api/org-structure")
async def api_org_structure(request: Request):
    user = get_current_user(request)
    org_id = request.query_params.get("organization_id")
    organization_id = user.get("organization_id")
    if can_manage_system(user) and org_id:
        try:
            organization_id = int(org_id)
        except ValueError as exc:
            raise HTTPException(400, "organization_id 格式不正确") from exc
    if not organization_id:
        raise HTTPException(400, "当前用户未归属任何组织")
    summary = get_organization_summary(organization_id)
    if not summary:
        raise HTTPException(404, "组织不存在")
    can_manage = can_manage_organization_records(user)
    members = []
    for member in summary["members"]:
        members.append({
            "id": member["id"],
            "username": member["username"],
            "display_name": member["display_name"],
            "role": member.get("role"),
            "is_admin": member.get("is_admin"),
            "organization_id": member.get("organization_id"),
            "can_delete": can_manage and not bool(member.get("is_admin")) and member.get("role") != "boss",
        })
    return {
        "organization": summary["organization"],
        "members": members,
        "viewer": {
            "id": user["id"],
            "role": user.get("role"),
            "can_manage": can_manage,
        }
    }


@app.put("/api/org-structure")
async def api_update_org_structure(data: dict, request: Request):
    user = get_current_user(request)
    require_org_manager(user)
    organization_id = user.get("organization_id")
    if can_manage_system(user) and data.get("organization_id") is not None:
        organization_id = data.get("organization_id")
        if isinstance(organization_id, str):
            if not organization_id.strip().isdigit():
                raise HTTPException(400, "organization_id 格式不正确")
            organization_id = int(organization_id.strip())
    if not organization_id:
        raise HTTPException(400, "当前用户未归属任何组织")
    if not get_organization(organization_id):
        raise HTTPException(404, "组织不存在")
    organization = update_organization_name(organization_id, data.get("name", ""))
    return {"organization": organization}


@app.post("/api/admin/users")
async def api_admin_create_user(data: dict, request: Request):
    admin = get_current_user(request)
    require_org_manager(admin)
    username = data.get("username", "").strip()
    password = data.get("password", "")
    display_name = data.get("display_name", username)
    role = data.get("role") or "staff"
    if not username or not password:
        raise HTTPException(400, "账号和密码不能为空")
    if get_user_by_username(username):
        raise HTTPException(400, "账号已存在，请换一个登录账号")
    organization_id = admin.get("organization_id")
    if can_manage_system(admin):
        organization_id = data.get("organization_id")
        if organization_id in ("", None):
            organization_id = None
        elif isinstance(organization_id, str):
            if not organization_id.strip().isdigit():
                raise HTTPException(400, "organization_id 格式不正确")
            organization_id = int(organization_id.strip())
        organization_name = (data.get("organization_name") or "").strip()
        if organization_id is None and role == "boss":
            organization = create_organization(organization_name or display_name or username)
            organization_id = organization["id"]
        elif organization_id is not None and not get_organization(organization_id):
            raise HTTPException(400, "指定的组织不存在")
        elif organization_id is None and role != "admin":
            raise HTTPException(400, "非管理员账号必须指定 organization_id")
    else:
        if role != "staff":
            raise HTTPException(403, "老板当前只能新增员工账号")
    try:
        user = create_user(username, password, display_name, organization_id, role)
    except ValueError as exc:
        raise HTTPException(400, "角色不合法") from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(400, "账号创建失败，请检查输入信息") from exc
    if role == "boss" and organization_id:
        set_organization_owner(organization_id, user["id"])
    return {"user": user}


@app.delete("/api/admin/users/{user_id}")
async def api_admin_delete_user(user_id: int, request: Request):
    admin = get_current_user(request)
    require_org_manager(admin)
    if admin["id"] == user_id:
        raise HTTPException(400, "不能删除当前登录账号")
    user = get_user(user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if not can_manage_system(admin) and user.get("organization_id") != admin.get("organization_id"):
        raise HTTPException(404, "用户不存在")
    if user.get("is_admin") or user.get("role") == "admin":
        raise HTTPException(400, "不能删除开发人员账号")
    if user.get("role") == "boss" and not can_manage_system(admin):
        raise HTTPException(400, "老板账号只能由开发人员账号管理")
    if user_has_related_records(user_id):
        raise HTTPException(400, "该员工账号已有账单记录，暂不允许删除")
    delete_user(user_id)
    return {"ok": True}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log_error(
        "backend_exception",
        path=str(request.url.path),
        method=request.method,
        error=str(exc),
        traceback=traceback.format_exc(),
    )
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})

# 静态文件和首页
@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "static" / "index.html")

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

@app.get("/api/health")
async def api_health():
    return {"ok": True}

init_db()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

