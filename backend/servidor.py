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

# Almacenamiento en memoria (cache) y bloqueo de seguridad para archivos
TASKS: dict[str, dict] = {}
FILE_LOCK = Lock()

# --- Funciones de Utilidad ---

def now_iso() -> str:
    """Retorna el tiempo actual en formato ISO UTC."""
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
    ensure_csv_exists()
    TASKS.clear()
    with CSV_PATH.open("r", newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            task_id = (row.get("id") or "").strip()
            if not task_id: continue
            
            TASKS[task_id] = {
                "id": task_id,
                "title": (row.get("title") or "Sin título").strip(),
                "points": int(row.get("points") or 1),
                "assignee": (row.get("assignee") or "").strip(),
                "status": normalize_status(row.get("status")),
                "created_at": row.get("created_at") or now_iso(),
                "updated_at": row.get("updated_at") or now_iso(),
            }

def save_tasks_to_csv():
    ensure_csv_exists()
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        # Ordenamos las tareas por fecha antes de guardar
        tasks = sorted(TASKS.values(), key=lambda t: t.get("created_at", ""))
        for t in tasks:
            w.writerow(t)

# --- Inicialización ---
with FILE_LOCK:
    load_tasks_from_csv()

# --- Rutas de la API ---

@app.get("/")
def home():
    return "¡Servidor Flask funcionando! Prueba /api/tasks o /api/health 🚀"

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": now_iso(), "csv": str(CSV_PATH)})

@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    tasks = list(TASKS.values())
    if status:
        s = normalize_status(status)
        tasks = [t for t in tasks if t["status"] == s]
    
    # Corregido: .get() usa paréntesis, no corchetes
    tasks.sort(key=lambda t: t.get("created_at", "")) 
    return jsonify({"tasks": tasks})

@app.post("/api/tasks")
def create_task():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return jsonify({"error": "El título es obligatorio"}), 400

    task_id = str(uuid4())
    task = {
        "id": task_id,
        "title": title,
        "points": int(payload.get("points") or 1),
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
        if "title" in payload: task["title"] = payload["title"]
        if "status" in payload: task["status"] = normalize_status(payload["status"])
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