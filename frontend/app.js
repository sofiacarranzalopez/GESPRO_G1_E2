const API_BASE = "http://127.0.0.1:5000";

const todoList = document.getElementById("todoList");
const progressList = document.getElementById("progressList");
const doneList = document.getElementById("doneList");

const countTODO = document.getElementById("countTODO");
const countIN_PROGRESS = document.getElementById("countIN_PROGRESS");
const countDONE = document.getElementById("countDONE");

const apiStatus = document.getElementById("apiStatus");
const form = document.getElementById("taskForm");

// login
const loginCard = document.getElementById("loginCard");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginHint = document.getElementById("loginHint");
const btnRegisterPanel = document.getElementById("btnRegisterPanel");
const btnGuest = document.getElementById("btnGuest");
const registerPanel = document.getElementById("registerPanel");
const registerForm = document.getElementById("registerForm");
const regUser = document.getElementById("regUser");
const regPass = document.getElementById("regPass");
const regRole = document.getElementById("regRole");
const registerHint = document.getElementById("registerHint");
const logoutBtn = document.getElementById("logoutBtn");
const userStatus = document.getElementById("userStatus");
const appContent = document.getElementById("appContent");
const createCard = document.getElementById("createCard");

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
  const user = getCurrentUser();
  if (!user) return [];
  const params = new URLSearchParams();

  if (filterPoints?.value) params.set("points", filterPoints.value);
  if (filterAssignee?.value.trim()) params.set("assignee", filterAssignee.value.trim());
  if (sortBy?.value) params.set("sort", sortBy.value);

  const url = `${API_BASE}/api/tasks?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "X-User": user }
  });
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

  const role = getCurrentRole() || "normal";
  const canUpdate = role === "product_owner";
  const canDelete = role === "product_owner" || role === "normal";

  const actionsEl = el.querySelector(".actions");
  const [btnLeft, btnRight, btnDone, btnEdit, btnDelete] =
    actionsEl.querySelectorAll(".actions button");

  if (role === "invitado") actionsEl.classList.add("hidden");

  if (canUpdate) {
    btnLeft.onclick = () => updateTask(task.id, { status: prevStatus(task.status) });
    btnRight.onclick = () => updateTask(task.id, { status: nextStatus(task.status) });
    btnDone.onclick = () => updateTask(task.id, { status: "DONE" });

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
  } else {
    btnLeft.disabled = true;
    btnRight.disabled = true;
    btnDone.disabled = true;
    btnEdit.disabled = true;
  }

  if (canDelete) {
    btnDelete.onclick = () => deleteTask(task.id);
  } else {
    btnDelete.disabled = true;
  }

  if (canUpdate) {
    // drag events
    el.addEventListener("dragstart", () => {
      draggedTaskId = task.id;
      setTimeout(() => el.style.opacity = "0.6", 0);
    });

    el.addEventListener("dragend", () => {
      draggedTaskId = null;
      el.style.opacity = "1";
    });
  } else {
    el.draggable = false;
  }

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
  const user = getCurrentUser();
  if (!user) throw new Error("No autorizado");
  const r = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User": user },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("No se pudo crear");
  await refresh();
}

async function updateTask(id, payload) {
  const user = getCurrentUser();
  if (!user) throw new Error("No autorizado");
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-User": user },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("No se pudo actualizar");
  await refresh();
}

async function deleteTask(id) {
  const user = getCurrentUser();
  if (!user) throw new Error("No autorizado");
  const r = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "DELETE",
    headers: { "X-User": user }
  });
  if (!r.ok) throw new Error("No se pudo eliminar");
  await refresh();
}

async function refresh() {
  if (!getCurrentUser()) return;
  const tasks = await fetchTasks();
  clearBoard();
  updateCounts(tasks);

  for (const t of tasks) {
    listElForStatus(t.status).appendChild(taskCard(t));
  }
}

function setupDropzone(zoneEl, status) {
  zoneEl.addEventListener("dragover", (e) => {
    if (!canUpdateTasks()) return;
    e.preventDefault();
    zoneEl.classList.add("dragover");
  });

  zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("dragover"));

  zoneEl.addEventListener("drop", async (e) => {
    if (!canUpdateTasks()) return;
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

function getCurrentUser() {
  return localStorage.getItem("currentUser") || "";
}

function getCurrentRole() {
  return localStorage.getItem("currentRole") || "";
}

function canCreateTasks() {
  const role = getCurrentRole();
  return role === "product_owner" || role === "normal";
}

function canUpdateTasks() {
  const role = getCurrentRole();
  return role === "product_owner";
}

function canDeleteTasks() {
  const role = getCurrentRole();
  return role === "product_owner" || role === "normal";
}

function setLoginHint(msg, kind = "") {
  if (!loginHint) return;
  loginHint.textContent = msg;
  loginHint.className = `hint ${kind}`.trim();
}

function setUserUI() {
  const user = getCurrentUser();
  const role = getCurrentRole() || "normal";
  if (user) {
    userStatus.textContent = `${user} (${role})`;
    loginCard.classList.add("hidden");
    appContent.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    if (createCard) {
      if (role === "invitado") createCard.classList.add("hidden");
      else createCard.classList.remove("hidden");
    }
  } else {
    userStatus.textContent = "Inicio";
    loginCard.classList.remove("hidden");
    appContent.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    if (createCard) createCard.classList.remove("hidden");
    clearBoard();
    updateCounts([]);
  }
}

async function loginRequest(username, password) {
  const r = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo iniciar sesión");
  }
  return r.json();
}

async function registerRequest(username, password, role = "normal") {
  const r = await fetch(`${API_BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role })
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "No se pudo registrar");
  }
  return r.json();
}

// submit nueva tarea
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!getCurrentUser()) return;
  if (!canCreateTasks()) return;
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

// login handlers
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = loginUser.value.trim();
  const password = loginPass.value.trim();
  if (!username || !password) return;
  try {
    const data = await loginRequest(username, password);
    localStorage.setItem("currentUser", username);
    localStorage.setItem("currentRole", data.role || "normal");
    setLoginHint("Bienvenido", "ok");
    loginForm.reset();
    registerPanel.classList.add("hidden");
    setUserUI();
    await refresh();
  } catch (err) {
    setLoginHint(err.message, "error");
  }
});

btnRegisterPanel.addEventListener("click", () => {
  registerPanel.classList.toggle("hidden");
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = regUser.value.trim();
  const password = regPass.value.trim();
  const role = regRole.value || "normal";
  if (!username || !password) return;
  try {
    const data = await registerRequest(username, password, role);
    localStorage.setItem("currentUser", username);
    localStorage.setItem("currentRole", data.role || role);
    setLoginHint("", "");
    registerHint.textContent = "Cuenta creada. Bienvenido!";
    registerHint.className = "hint ok";
    registerForm.reset();
    setTimeout(() => {
      registerPanel.classList.add("hidden");
      setUserUI();
      refresh();
    }, 500);
  } catch (err) {
    registerHint.textContent = err.message;
    registerHint.className = "hint error";
  }
});

btnGuest.addEventListener("click", () => {
  localStorage.setItem("currentUser", "invitado");
  localStorage.setItem("currentRole", "invitado");
  setLoginHint("", "");
  registerPanel.classList.add("hidden");
  setUserUI();
  refresh();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("currentRole");
  setLoginHint("");
  setUserUI();
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
  setUserUI();
  await refresh();
})();
