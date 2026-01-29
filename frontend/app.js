const API_BASE = "http://127.0.0.1:5000";

const todoList = document.getElementById("todoList");
const progressList = document.getElementById("progressList");
const doneList = document.getElementById("doneList");

const countTODO = document.getElementById("countTODO");
const countIN_PROGRESS = document.getElementById("countIN_PROGRESS");
const countDONE = document.getElementById("countDONE");

const apiStatus = document.getElementById("apiStatus");
const form = document.getElementById("taskForm");

// filtros
const filterPoints = document.getElementById("filterPoints");
const filterAssignee = document.getElementById("filterAssignee");
const sortBy = document.getElementById("sortBy");
const clearFilters = document.getElementById("clearFilters");

let draggedTaskId = null;

function listElForStatus(status) {
  if (status === "TODO") return todoList;
  if (status === "IN_PROGRESS") return progressList;
  return doneList;
}

async function apiHealth() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    if (!r.ok) throw new Error();
    apiStatus.textContent = "API: OK";
  } catch {
    apiStatus.textContent = "API: OFF";
  }
}

async function fetchTasks() {
  const params = new URLSearchParams();

  if (filterPoints?.value) params.set("points", filterPoints.value);
  if (filterAssignee?.value.trim()) params.set("assignee", filterAssignee.value.trim());
  if (sortBy?.value) params.set("sort", sortBy.value);

  const url = `${API_BASE}/api/tasks?${params.toString()}`;
  const r = await fetch(url);
  const data = await r.json();
  return data.tasks || [];
}

function clearBoard() {
  todoList.innerHTML = "";
  progressList.innerHTML = "";
  doneList.innerHTML = "";
}

function updateCounts(tasks) {
  countTODO.textContent = tasks.filter(t => t.status === "TODO").length;
  countIN_PROGRESS.textContent = tasks.filter(t => t.status === "IN_PROGRESS").length;
  countDONE.textContent = tasks.filter(t => t.status === "DONE").length;
}

function closeAllEditPanels(exceptEl = null) {
  document.querySelectorAll(".edit-panel").forEach(p => {
    if (!exceptEl || !exceptEl.contains(p)) p.remove();
  });
}

function taskCard(task) {
  const el = document.createElement("div");
  el.className = "task";
  el.draggable = true;
  el.dataset.id = task.id;

  const pts = Number(task.points ?? 1);

  el.innerHTML = `
    <div class="title">${escapeHtml(task.title)}</div>
    <div class="meta">
      <span class="pill points">${pts} pts</span>
      <span class="pill assignee">${escapeHtml(task.assignee || "—")}</span>
      <span class="pill">${task.status}</span>
    </div>
    <div class="actions">
      <button class="btn ghost" title="Mover a la izquierda">←</button>
      <button class="btn ghost" title="Mover a la derecha">→</button>
      <button class="btn" title="Marcar como DONE">Done</button>
      <button class="btn" title="Editar tarea">Editar</button>
      <button class="btn danger" title="Eliminar">Eliminar</button>
    </div>
  `;

  const [btnLeft, btnRight, btnDone, btnEdit, btnDelete] =
    el.querySelectorAll(".actions button");

  btnLeft.onclick = () => updateTask(task.id, { status: prevStatus(task.status) });
  btnRight.onclick = () => updateTask(task.id, { status: nextStatus(task.status) });
  btnDone.onclick = () => updateTask(task.id, { status: "DONE" });
  btnDelete.onclick = () => deleteTask(task.id);

  // ✅ EDITAR: despliega panel inline para elegir qué editar
  btnEdit.onclick = () => {
    // si ya existe, lo cerramos
    const existing = el.querySelector(".edit-panel");
    if (existing) {
      existing.remove();
      return;
    }

    // cierra otros paneles abiertos
    closeAllEditPanels(el);

    const panel = document.createElement("div");
    panel.className = "edit-panel";

    panel.innerHTML = `
      <label>¿Qué quieres editar?</label>
      <select class="edit-what">
        <option value="title" selected>Nombre de la tarea</option>
        <option value="assignee">Responsable</option>
        <option value="points">Prioridad</option>
      </select>

      <div class="edit-fields">
        <!-- aquí se renderiza el campo según selección -->
      </div>

      <div class="actions">
        <button class="btn ghost cancel" type="button">Cancelar</button>
        <button class="btn primary save" type="button">Guardar</button>
      </div>
    `;

    const editWhat = panel.querySelector(".edit-what");
    const fields = panel.querySelector(".edit-fields");
    const btnCancel = panel.querySelector(".cancel");
    const btnSave = panel.querySelector(".save");

    function renderField(kind) {
      if (kind === "title") {
        fields.innerHTML = `
          <label>Nuevo nombre</label>
          <input class="val-title" type="text" value="${escapeHtml(task.title)}" />
        `;
      } else if (kind === "assignee") {
        fields.innerHTML = `
          <label>Nuevo responsable</label>
          <input class="val-assignee" type="text" value="${escapeHtml(task.assignee || "")}" placeholder="Ej: Valeria" />
        `;
      } else if (kind === "points") {
        fields.innerHTML = `
          <label>Nueva prioridad</label>
          <select class="val-points">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4">4</option>
          <option value="8">8</option>
          <option value="16">16</option>
          </select>
        `;
        const sel = fields.querySelector(".val-points");
        sel.value = String(task.points ?? 1);
      }
    }

    renderField(editWhat.value);

    editWhat.onchange = () => renderField(editWhat.value);

    btnCancel.onclick = () => panel.remove();

    btnSave.onclick = async () => {
      const kind = editWhat.value;
      const payload = {};

      if (kind === "title") {
        const v = fields.querySelector(".val-title").value.trim();
        if (!v) return; // no guardamos vacío
        payload.title = v;
      }

      if (kind === "assignee") {
        const v = fields.querySelector(".val-assignee").value.trim();
        payload.assignee = v; // puede ser vacío para quitar responsable
      }

      if (kind === "points") {
        const v = Number(fields.querySelector(".val-points").value);
        payload.points = Number.isFinite(v) ? v : 1;
      }

      await updateTask(task.id, payload);
      panel.remove();
    };

    el.appendChild(panel);
  };

  // drag events
  el.addEventListener("dragstart", () => {
    draggedTaskId = task.id;
    setTimeout(() => el.style.opacity = "0.6", 0);
  });

  el.addEventListener("dragend", () => {
    draggedTaskId = null;
    el.style.opacity = "1";
  });

  return el;
}

function nextStatus(status) {
  if (status === "TODO") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "DONE";
  return "DONE";
}

function prevStatus(status) {
  if (status === "DONE") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "TODO";
  return "TODO";
}

async function createTask(payload) {
  const r = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("No se pudo crear");
  await refresh();
}

async function updateTask(id, payload) {
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("No se pudo actualizar");
  await refresh();
}

async function deleteTask(id) {
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("No se pudo eliminar");
  await refresh();
}

async function refresh() {
  const tasks = await fetchTasks();
  clearBoard();
  updateCounts(tasks);

  for (const t of tasks) {
    listElForStatus(t.status).appendChild(taskCard(t));
  }
}

function setupDropzone(zoneEl, status) {
  zoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    zoneEl.classList.add("dragover");
  });

  zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("dragover"));

  zoneEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    zoneEl.classList.remove("dragover");
    if (!draggedTaskId) return;
    await updateTask(draggedTaskId, { status });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

// submit nueva tarea
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  const points = Number(document.getElementById("points").value);
  const assignee = document.getElementById("assignee").value.trim();
  if (!title) return;

  await createTask({ title, points, assignee, status: "TODO" });
  form.reset();
});

// filtros listeners
filterPoints.addEventListener("change", refresh);
sortBy.addEventListener("change", refresh);

filterAssignee.addEventListener("input", () => {
  clearTimeout(window.__assigneeTimer);
  window.__assigneeTimer = setTimeout(refresh, 250);
});

clearFilters.addEventListener("click", (e) => {
  e.preventDefault();
  filterPoints.value = "";
  filterAssignee.value = "";
  sortBy.value = "points_desc";
  refresh();
});

// dropzones
setupDropzone(todoList, "TODO");
setupDropzone(progressList, "IN_PROGRESS");
setupDropzone(doneList, "DONE");

// opcional: click fuera para cerrar paneles
document.addEventListener("click", (e) => {
  // si das click dentro de un task o panel, no cierres
  if (e.target.closest(".task")) return;
  closeAllEditPanels();
});

// Theme toggle
const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light-mode");
    themeToggle.textContent = "☀️";
    localStorage.setItem("theme", "light");
  } else {
    document.body.classList.remove("light-mode");
    themeToggle.textContent = "🌙";
    localStorage.setItem("theme", "dark");
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  setTheme(isLight ? "dark" : "light");
}

themeToggle.addEventListener("click", toggleTheme);

// Cargar tema guardado
const savedTheme = localStorage.getItem("theme") || "dark";
setTheme(savedTheme);

(async function init() {
  await apiHealth();
  await refresh();
})();
