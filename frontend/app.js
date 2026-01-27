const API_BASE = "http://127.0.0.1:5000";

const todoList = document.getElementById("todoList");
const progressList = document.getElementById("progressList");
const doneList = document.getElementById("doneList");

const countTODO = document.getElementById("countTODO");
const countIN_PROGRESS = document.getElementById("countIN_PROGRESS");
const countDONE = document.getElementById("countDONE");

const apiStatus = document.getElementById("apiStatus");
const form = document.getElementById("taskForm");

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
  const r = await fetch(`${API_BASE}/api/tasks`);
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

function taskCard(task) {
  const el = document.createElement("div");
  el.className = "task";
  el.draggable = true;

  el.innerHTML = `
    <div class="title">${escapeHtml(task.title)}</div>
    <div class="meta">
      <span class="pill points">${task.points} pts</span>
      ${task.assignee ? `<span class="pill assignee">${escapeHtml(task.assignee)}</span>` : ""}
      <span class="pill">${task.status}</span>
    </div>
    <div class="actions">
      <button class="btn ghost" title="Mover a la izquierda">←</button>
      <button class="btn ghost" title="Mover a la derecha">→</button>
      <button class="btn" title="Marcar como DONE">Done</button>
      <button class="btn danger" title="Eliminar">Eliminar</button>
    </div>
  `;

  const [btnLeft, btnRight, btnDone, btnDelete] = el.querySelectorAll("button");

  btnLeft.onclick = () => updateTask(task.id, { status: prevStatus(task.status) });
  btnRight.onclick = () => updateTask(task.id, { status: nextStatus(task.status) });
  btnDone.onclick = () => updateTask(task.id, { status: "DONE" });
  btnDelete.onclick = () => deleteTask(task.id);

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
  zoneEl.addEventListener("dragover", (e) => { e.preventDefault(); zoneEl.classList.add("dragover"); });
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  const points = Number(document.getElementById("points").value);
  const assignee = document.getElementById("assignee").value.trim();
  if (!title) return;

  await createTask({ title, points, assignee, status: "TODO" });
  form.reset();
});

setupDropzone(todoList, "TODO");
setupDropzone(progressList, "IN_PROGRESS");
setupDropzone(doneList, "DONE");

(async function init() {
  await apiHealth();
  await refresh();
})();
