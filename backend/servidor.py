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
USERS_PATH = Path(__file__).parent / "users.json"
TASKS_PATH = Path(__file__).parent / "tasks.json"

USERS: dict[str, dict] = {}
TASKS_BY_USER: dict[str, list[dict]] = {}
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
    USERS.update(data.get("users", {}))


def save_users():
    USERS_PATH.write_text(
        json.dumps({"users": USERS}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_tasks():
    ensure_json_exists(TASKS_PATH, {"tasks": {}})
    data = json.loads(TASKS_PATH.read_text(encoding="utf-8") or "{}")
    TASKS_BY_USER.clear()
    TASKS_BY_USER.update(data.get("tasks", {}))


def save_tasks():
    TASKS_PATH.write_text(
        json.dumps({"tasks": TASKS_BY_USER}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def require_user() -> str | None:
    username = (request.headers.get("X-User") or "").strip()
    if not username or username not in USERS:
        return None
    return username

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

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña son obligatorios"}), 400

    with FILE_LOCK:
        if username in USERS:
            return jsonify({"error": "El usuario ya existe"}), 409

        USERS[username] = {
            "password_hash": hash_password(password),
            "created_at": now_iso(),
        }
        TASKS_BY_USER.setdefault(username, [])
        save_users()
        save_tasks()

    return jsonify({"ok": True, "user": username}), 201

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

    return jsonify({"ok": True, "user": username})

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

    tasks = list(TASKS_BY_USER.get(user, []))

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
        TASKS_BY_USER.setdefault(user, [])
        TASKS_BY_USER[user].append(task)
        save_tasks()

    return jsonify(task), 201

@app.patch("/api/tasks/<task_id>")
def update_task(task_id: str):
    user = require_user()
    if not user:
        return jsonify({"error": "No autorizado"}), 401

    payload = request.get_json(silent=True) or {}

    with FILE_LOCK:
        tasks = TASKS_BY_USER.get(user, [])
        task = next((t for t in tasks if t.get("id") == task_id), None)
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

    with FILE_LOCK:
        tasks = TASKS_BY_USER.get(user, [])
        idx = next((i for i, t in enumerate(tasks) if t.get("id") == task_id), None)
        if idx is None:
            return jsonify({"error": "No encontrado"}), 404
        tasks.pop(idx)
        save_tasks()

    return jsonify({"deleted": True})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
