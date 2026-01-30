from __future__ import annotations
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
from uuid import uuid4
from pathlib import Path
from threading import Lock
import json
import hashlib

app = Flask(__name__)
CORS(app)

# --- Configuración ---
VALID_STATUSES = {"TODO", "IN_PROGRESS", "DONE"}
VALID_ROLES = {"product_owner", "normal", "invitado"}
USERS_PATH = Path(__file__).parent / "users.json"
TASKS_PATH = Path(__file__).parent / "tasks.json"

USERS: dict[str, dict] = {}
TASKS: list[dict] = []
FILE_LOCK = Lock()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat() + "Z"

def normalize_status(s: str) -> str:
    s = (s or "").strip().upper()
    return s if s in VALID_STATUSES else "TODO"

def ensure_json_exists(path: Path, default_obj: dict):
    if not path.exists():
        path.write_text(json.dumps(default_obj, ensure_ascii=False, indent=2), encoding="utf-8")


def load_users():
    ensure_json_exists(USERS_PATH, {"users": {}})
    data = json.loads(USERS_PATH.read_text(encoding="utf-8") or "{}")
    USERS.clear()
    raw = data.get("users", {})
    for username, info in raw.items():
        role = (info or {}).get("role") or "normal"
        if role not in VALID_ROLES:
            role = "normal"
        USERS[username] = {
            "password_hash": (info or {}).get("password_hash", ""),
            "created_at": (info or {}).get("created_at", now_iso()),
            "role": role,
        }


def save_users():
    USERS_PATH.write_text(
        json.dumps({"users": USERS}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_tasks():
    ensure_json_exists(TASKS_PATH, {"tasks": []})
    data = json.loads(TASKS_PATH.read_text(encoding="utf-8") or "{}")
    raw = data.get("tasks", [])

    tasks_list: list[dict] = []
    if isinstance(raw, list):
        tasks_list = raw
    elif isinstance(raw, dict):
        # compatibilidad: puede venir como {user: [tasks]} o {id: task}
        if all(isinstance(v, list) for v in raw.values()):
            for v in raw.values():
                tasks_list.extend(v)
        elif all(isinstance(v, dict) for v in raw.values()):
            tasks_list = list(raw.values())

    normalized: list[dict] = []
    for t in tasks_list:
        task_id = (t.get("id") or "").strip()
        title = (t.get("title") or "").strip()
        if not task_id or not title:
            continue
        try:
            points = int(t.get("points") or 1)
        except ValueError:
            points = 1
        normalized.append({
            "id": task_id,
            "title": title,
            "points": points,
            "assignee": (t.get("assignee") or "").strip(),
            "status": normalize_status(t.get("status")),
            "created_at": (t.get("created_at") or now_iso()).strip(),
            "updated_at": (t.get("updated_at") or now_iso()).strip(),
        })

    TASKS.clear()
    TASKS.extend(normalized)


def save_tasks():
    tasks_sorted = sorted(TASKS, key=lambda t: t.get("created_at", ""))
    TASKS_PATH.write_text(
        json.dumps({"tasks": tasks_sorted}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def require_user() -> str | None:
    username = (request.headers.get("X-User") or "").strip()
    if not username:
        return None
    # permitir invitado sin verificación
    if username == "invitado":
        return "invitado"
    # verificar que el usuario exista
    if username not in USERS:
        return None
    return username


def get_user_role(username: str) -> str:
    if username == "invitado":
        return "invitado"
    role = (USERS.get(username) or {}).get("role") or "normal"
    return role if role in VALID_ROLES else "normal"

# --- Inicialización ---
with FILE_LOCK:
    load_users()
    load_tasks()

# --- Rutas ---
@app.get("/")
def home():
    return "Servidor OK. Prueba /api/health o /api/tasks"

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": now_iso(), "users": str(USERS_PATH), "tasks": str(TASKS_PATH)})

@app.post("/api/register")
def register():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()
    role = (payload.get("role") or "normal").strip().lower()

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios"}), 400

    if role not in VALID_ROLES or role == "invitado":
        role = "normal"

    with FILE_LOCK:
        if username in USERS:
            return jsonify({"error": "El usuario ya existe"}), 409

        USERS[username] = {
            "password_hash": hash_password(password),
            "created_at": now_iso(),
            "role": role,
        }
        save_users()

    return jsonify({"ok": True, "user": username, "role": role}), 201


@app.post("/api/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios"}), 400

    user = USERS.get(username)
    if not user or user.get("password_hash") != hash_password(password):
        return jsonify({"error": "Credenciales inválidas"}), 401

    return jsonify({"ok": True, "user": username, "role": get_user_role(username)})

@app.get("/api/tasks")
def list_tasks():
    user = require_user()
    if not user:
        return jsonify({"error": "No autorizado"}), 401

    # filtros
    status = request.args.get("status")
    assignee = (request.args.get("assignee") or "").strip().lower()
    points = request.args.get("points")
    sort = (request.args.get("sort") or "points_desc").strip().lower()

    tasks = list(TASKS)

    if status:
        s = normalize_status(status)
        tasks = [t for t in tasks if t.get("status") == s]

    if assignee:
        tasks = [t for t in tasks if (t.get("assignee") or "").strip().lower() == assignee]

    if points:
        try:
            p = int(points)
            tasks = [t for t in tasks if int(t.get("points") or 1) == p]
        except ValueError:
            pass

    # orden
    if sort == "points_desc":
        tasks.sort(key=lambda t: (int(t.get("points") or 1), t.get("created_at", "")), reverse=True)
    elif sort == "created_desc":
        tasks.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    else:  # created_asc
        tasks.sort(key=lambda t: t.get("created_at", ""))

    return jsonify({"tasks": tasks})

@app.post("/api/tasks")
def create_task():
    user = require_user()
    if not user:
        return jsonify({"error": "No autorizado"}), 401

    role = get_user_role(user)
    if role not in {"product_owner", "normal"}:
        return jsonify({"error": "No autorizado"}), 403

    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return jsonify({"error": "El título es obligatorio"}), 400

    try:
        points = int(payload.get("points") or 1)
    except ValueError:
        points = 1

    task_id = str(uuid4())
    task = {
        "id": task_id,
        "title": title,
        "points": points,
        "assignee": (payload.get("assignee") or "").strip(),
        "status": normalize_status(payload.get("status") or "TODO"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    with FILE_LOCK:
        TASKS.append(task)
        save_tasks()

    return jsonify(task), 201

@app.patch("/api/tasks/<task_id>")
def update_task(task_id: str):
    user = require_user()
    if not user:
        return jsonify({"error": "No autorizado"}), 401

    role = get_user_role(user)
    if role != "product_owner":
        return jsonify({"error": "No autorizado"}), 403

    payload = request.get_json(silent=True) or {}

    with FILE_LOCK:
        task = next((t for t in TASKS if t.get("id") == task_id), None)
        if not task:
            return jsonify({"error": "No encontrado"}), 404

        if "title" in payload:
            title = (payload.get("title") or "").strip()
            if not title:
                return jsonify({"error": "El título no puede estar vacío"}), 400
            task["title"] = title

        if "assignee" in payload:
            task["assignee"] = (payload.get("assignee") or "").strip()

        if "points" in payload:
            try:
                task["points"] = int(payload.get("points") or 1)
            except ValueError:
                task["points"] = 1

        if "status" in payload:
            task["status"] = normalize_status(payload["status"])

        task["updated_at"] = now_iso()
        save_tasks()

    return jsonify(task)

@app.delete("/api/tasks/<task_id>")
def delete_task(task_id: str):
    user = require_user()
    if not user:
        return jsonify({"error": "No autorizado"}), 401

    role = get_user_role(user)
    if role not in {"product_owner", "normal"}:
        return jsonify({"error": "No autorizado"}), 403

    with FILE_LOCK:
        idx = next((i for i, t in enumerate(TASKS) if t.get("id") == task_id), None)
        if idx is None:
            return jsonify({"error": "No encontrado"}), 404
        TASKS.pop(idx)
        save_tasks()

    return jsonify({"deleted": True})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
