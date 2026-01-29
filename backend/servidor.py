from __future__ import annotations
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
from uuid import uuid4
import csv
from pathlib import Path
from threading import Lock

app = Flask(__name__)
CORS(app)

# --- Configuración ---
VALID_STATUSES = {"TODO", "IN_PROGRESS", "DONE"}
CSV_PATH = Path(__file__).parent / "tasks.csv"
CSV_FIELDS = ["id", "title", "points", "assignee", "status", "created_at", "updated_at"]

TASKS: dict[str, dict] = {}
FILE_LOCK = Lock()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat() + "Z"

def normalize_status(s: str) -> str:
    s = (s or "").strip().upper()
    return s if s in VALID_STATUSES else "TODO"

def ensure_csv_exists():
    if not CSV_PATH.exists():
        with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            w.writeheader()

def load_tasks_from_csv():
    """Carga robusta: no truena aunque el CSV tenga datos viejos."""
    ensure_csv_exists()
    TASKS.clear()

    with CSV_PATH.open("r", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            task_id = (row.get("id") or "").strip()
            title = (row.get("title") or "").strip()
            if not task_id or not title:
                continue

            points_raw = (row.get("points") or "1").strip()
            try:
                points = int(points_raw)
            except ValueError:
                points = 1

            TASKS[task_id] = {
                "id": task_id,
                "title": title,
                "points": points,
                "assignee": (row.get("assignee") or "").strip(),
                "status": normalize_status(row.get("status")),
                "created_at": (row.get("created_at") or now_iso()).strip(),
                "updated_at": (row.get("updated_at") or now_iso()).strip(),
            }

def save_tasks_to_csv():
    ensure_csv_exists()
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()

        tasks = list(TASKS.values())
        tasks.sort(key=lambda t: t.get("created_at", ""))

        for t in tasks:
            w.writerow({
                "id": t.get("id", ""),
                "title": t.get("title", ""),
                "points": int(t.get("points") or 1),
                "assignee": t.get("assignee", ""),
                "status": normalize_status(t.get("status")),
                "created_at": t.get("created_at", now_iso()),
                "updated_at": t.get("updated_at", now_iso()),
            })

# --- Inicialización ---
with FILE_LOCK:
    load_tasks_from_csv()

# --- Rutas ---
@app.get("/")
def home():
    return "Servidor OK. Prueba /api/health o /api/tasks"

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": now_iso(), "csv": str(CSV_PATH)})

@app.get("/api/tasks")
def list_tasks():
    # filtros
    status = request.args.get("status")
    assignee = (request.args.get("assignee") or "").strip().lower()
    points = request.args.get("points")
    sort = (request.args.get("sort") or "points_desc").strip().lower()

    tasks = list(TASKS.values())

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
        TASKS[task_id] = task
        save_tasks_to_csv()

    return jsonify(task), 201

@app.patch("/api/tasks/<task_id>")
def update_task(task_id: str):
    if task_id not in TASKS:
        return jsonify({"error": "No encontrado"}), 404

    payload = request.get_json(silent=True) or {}

    with FILE_LOCK:
        task = TASKS[task_id]

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
        save_tasks_to_csv()

    return jsonify(task)

@app.delete("/api/tasks/<task_id>")
def delete_task(task_id: str):
    with FILE_LOCK:
        if task_id not in TASKS:
            return jsonify({"error": "No encontrado"}), 404
        TASKS.pop(task_id)
        save_tasks_to_csv()

    return jsonify({"deleted": True})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
