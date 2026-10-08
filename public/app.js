const tableBody = document.querySelector("#users-table-body");
const createForm = document.querySelector("#create-user-form");
const userNameInput = document.querySelector("#user-name");
const userEmailInput = document.querySelector("#user-email");
const refreshButton = document.querySelector("#refresh-button");
const runTestsButton = document.querySelector("#run-tests-button");
const createDeletionTestUserButton = document.querySelector("#create-deletion-test-user-button");
const runDeletionTestsButton = document.querySelector("#run-deletion-tests-button");
const resultsContainer = document.querySelector("#test-results");
const deletionResultsPanel = document.querySelector("#deletion-results-panel");
const deletionResultsContainer = document.querySelector("#deletion-test-results");
const progress = document.querySelector("#test-progress");
const toast = document.querySelector("#toast");
const searchInput = document.querySelector("#user-search");
const searchField = document.querySelector("#user-search-field");
const sortField = document.querySelector("#user-sort");
const mailboxUser = document.querySelector("#mailbox-user");
const mailSender = document.querySelector("#mail-sender");
const mailRecipient = document.querySelector("#mail-recipient");
const mailList = document.querySelector("#mail-list");
const mailComposeForm = document.querySelector("#mail-compose-form");
let allUsers = [];
let currentFolder = "inbox";
const deletionTestUserStorageKey = "integrador-cicd-deletion-test-user-id";
let deletionTestUserId = localStorage.getItem(deletionTestUserStorageKey);

const api = {
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new Error("No se pudo conectar con la API. Comprueba que el servidor esté activo.");
    }

    if (response.status === 204) return { status: response.status, data: null };
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error || "La API devolvió un error.", response.status);
    return { status: response.status, data: body.data ?? body };
  },
  list() {
    return this.request("/api/users");
  },
  create(user) {
    return this.request("/api/users", { method: "POST", body: JSON.stringify(user) });
  },
  get(id) {
    return this.request(`/api/users/${encodeURIComponent(id)}`);
  },
  update(id, user) {
    return this.request(`/api/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(user)
    });
  },
  remove(id) {
    return this.request(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  listMessages(userId, folder) {
    const query = new URLSearchParams({ userId, folder });
    return this.request(`/api/messages?${query}`);
  },
  sendMessage(message) {
    return this.request("/api/messages", { method: "POST", body: JSON.stringify(message) });
  },
  rejectMessage(id, recipientId) {
    return this.request(`/api/messages/${encodeURIComponent(id)}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ recipientId })
    });
  }
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("es");
}

function setText(element, value) {
  element.textContent = value;
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function renderUsers(users, refreshMailbox = true) {
  allUsers = users;
  updateDeletionTestControls(users);
  const count = users.length;
  setText(document.querySelector("#user-total"), String(count));
  setText(document.querySelector("#nav-user-count"), String(count));
  updateMailUserOptions(users);
  if (refreshMailbox) loadMessages();

  const search = searchInput.value.trim().toLocaleLowerCase("es");
  const field = searchField.value;
  const sortOrder = sortField.value === "desc" ? -1 : 1;
  const visibleUsers = users
    .filter((user) => {
      if (!search) return true;
      const name = user.name.toLocaleLowerCase("es");
      const email = user.email.toLocaleLowerCase("es");
      return field === "name"
        ? name.includes(search)
        : field === "email"
          ? email.includes(search)
          : name.includes(search) || email.includes(search);
    })
    .sort((first, second) => sortOrder * first.name.localeCompare(second.name, "es"));
  setText(document.querySelector("#table-user-count"), String(visibleUsers.length));
  setText(document.querySelector("#list-footer-count"), `${visibleUsers.length} de ${count} ${count === 1 ? "usuario" : "usuarios"}`);
  setText(document.querySelector("#filter-count"), search || field !== "all"
    ? `${visibleUsers.length} ${visibleUsers.length === 1 ? "resultado" : "resultados"}`
    : `Mostrando ${visibleUsers.length}`);

  if (visibleUsers.length === 0) {
    const message = count === 0
      ? "Aún no hay usuarios. Agrega el primero arriba."
      : "No hay usuarios que coincidan con la búsqueda.";
    tableBody.innerHTML = `<tr><td class="empty-state" colspan="4">${message}</td></tr>`;
    return;
  }

  tableBody.innerHTML = visibleUsers.map((user) => `
    <tr>
      <td>
        <div class="user-person">
          <span class="user-avatar" aria-hidden="true">${escapeAttribute(initials(user.name))}</span>
          <span class="user-info">
            <strong>${escapeAttribute(user.name)}</strong>
            <span>${escapeAttribute(user.email)}${user.id === deletionTestUserId ? " · Usuario temporal de prueba" : ""}</span>
          </span>
        </div>
      </td>
      <td><span class="status-badge${user.id === deletionTestUserId ? " status-test-pending" : ""}">${user.id === deletionTestUserId ? "Prueba pendiente" : "Activo"}</span></td>
      <td><code class="user-id">${escapeAttribute(user.id.slice(0, 8))}…</code></td>
      <td>
        <div class="row-actions">
          <button class="action-button" type="button" data-action="edit" data-id="${escapeAttribute(user.id)}" aria-label="Editar ${escapeAttribute(user.name)}" title="Editar usuario">✎</button>
          <button class="action-button action-delete" type="button" data-action="delete" data-id="${escapeAttribute(user.id)}" aria-label="Eliminar ${escapeAttribute(user.name)}" title="Eliminar usuario">×</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function updateDeletionTestControls(users) {
  const pendingUser = users.find((user) => user.id === deletionTestUserId);
  if (deletionTestUserId && !pendingUser) {
    localStorage.removeItem(deletionTestUserStorageKey);
    deletionTestUserId = null;
  }
  const ready = Boolean(pendingUser);
  createDeletionTestUserButton.disabled = ready;
  runDeletionTestsButton.disabled = !ready;
  const note = document.querySelector("#deletion-user-note");
  note.classList.toggle("is-ready", ready);
  setText(
    note,
    ready
      ? `${pendingUser.name} está visible en el directorio y se conservará al recargar. Se eliminará solo al ejecutar la prueba.`
      : "Crea el usuario de prueba para mostrarlo en el directorio. No se borrará hasta que ejecutes la prueba de eliminaciones."
  );
}

function updateMailUserOptions(users) {
  for (const select of [mailboxUser, mailSender, mailRecipient]) {
    const previous = select.value;
    select.replaceChildren();
    for (const user of users) {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = `${user.name} · ${user.email}`;
      select.append(option);
    }
    if (users.some((user) => user.id === previous)) select.value = previous;
  }
  if (users.length > 1 && mailSender.value === mailRecipient.value) {
    mailRecipient.value = users.find((user) => user.id !== mailSender.value).id;
  }
  const hasUsers = users.length > 0;
  mailboxUser.disabled = !hasUsers;
  mailSender.disabled = !hasUsers;
  mailRecipient.disabled = users.length < 2;
  mailComposeForm.querySelector('[type="submit"]').disabled = users.length < 2;
  if (!hasUsers) {
    mailList.innerHTML = '<div class="mail-empty">Crea al menos dos usuarios para intercambiar mensajes.</div>';
    setText(document.querySelector("#mailbox-count"), "0 mensajes");
    setText(document.querySelector("#nav-message-count"), "0");
  }
}

let toastTimeout;

function showToast(message, isError = false) {
  setText(toast, message);
  toast.classList.toggle("toast-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

function setSystemStatus(online, message) {
  const status = document.querySelector("#system-status");
  status.classList.toggle("status-online", online);
  status.classList.toggle("status-offline", !online);
  const dot = status.querySelector(".live-dot");
  dot.classList.toggle("is-offline", !online);
  setText(status.querySelector("span:last-child"), message);
}

async function refreshUsers() {
  const origin = window.location.origin;
  setText(document.querySelector("#api-origin"), origin);

  try {
    const [, response] = await Promise.all([
      api.request("/api/health"),
      api.list()
    ]);
    renderUsers(response.data);
    setSystemStatus(true, "API operativa");
    return response.data;
  } catch (error) {
    setText(document.querySelector("#user-total"), "—");
    setText(document.querySelector("#nav-user-count"), "!");
    setText(document.querySelector("#table-user-count"), "—");
    setText(document.querySelector("#list-footer-count"), "Sin conexión");
    setText(document.querySelector("#filter-count"), "Sin conexión");
    setSystemStatus(false, "API sin conexión");
    tableBody.innerHTML = `<tr><td class="empty-state" colspan="4">${escapeAttribute(error.message)}</td></tr>`;
    return null;
  }
}

function renderMessages(messages) {
    mailList.replaceChildren();
    const rejectedCount = messages.filter((message) => message.status === "rejected").length;
    setText(document.querySelector("#mailbox-count"), `${messages.length} ${messages.length === 1 ? "mensaje" : "mensajes"}`);
    if (currentFolder === "inbox") {
      setText(document.querySelector("#nav-message-count"), String(messages.length));
    }

    if (messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mail-empty";
      empty.textContent = currentFolder === "inbox" ? "Esta bandeja de entrada está vacía." : "Todavía no has enviado mensajes.";
      mailList.append(empty);
      return;
    }

    for (const message of messages) {
      const item = document.createElement("article");
      item.className = "mail-item";
      const details = document.createElement("div");
      const meta = document.createElement("div");
      meta.className = "mail-meta";
      const person = document.createElement("strong");
      person.textContent = currentFolder === "inbox"
        ? `${message.senderName} · ${message.senderEmail}`
        : `Para: ${message.recipientName} · ${message.recipientEmail}`;
      const date = document.createElement("time");
      date.dateTime = message.sentAt;
      date.textContent = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.sentAt));
      meta.append(person, date);
      const subject = document.createElement("h3");
      subject.textContent = message.subject;
      const body = document.createElement("p");
      body.textContent = message.body;
      if (message.status === "rejected" && currentFolder === "sent") {
        const notice = document.createElement("p");
        notice.className = "rejection-notice";
        notice.textContent = `El destinatario rechazó este mensaje${message.rejectedAt ? ` el ${new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.rejectedAt))}` : ""}.`;
        details.append(meta, subject, body, notice);
      } else {
        details.append(meta, subject, body);
      }

      const actions = document.createElement("div");
      actions.className = "mail-item-actions";
      const status = document.createElement("span");
      status.className = `mail-status${message.status === "rejected" ? " is-rejected" : ""}`;
      status.textContent = message.status === "rejected" ? "Rechazado" : "Enviado";
      actions.append(status);
      if (currentFolder === "inbox" && message.status !== "rejected") {
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "button button-outline mail-reject";
        reject.dataset.messageId = message.id;
        reject.textContent = "Rechazar";
        actions.append(reject);
      }
      item.append(details, actions);
      mailList.append(item);
    }
    if (currentFolder === "inbox") {
      setText(document.querySelector("#nav-message-count"), String(messages.length - rejectedCount));
    }
  }

async function loadMessages() {
    const userId = mailboxUser.value;
    if (!userId || !allUsers.some((user) => user.id === userId)) return;
    try {
      const response = await api.listMessages(userId, currentFolder);
      renderMessages(response.data);
    } catch (error) {
      mailList.replaceChildren();
      const failure = document.createElement("div");
      failure.className = "mail-empty";
      failure.textContent = error.message;
      mailList.append(failure);
      showToast(error.message, true);
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = createForm.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    await api.create({
      name: userNameInput.value.trim(),
      email: userEmailInput.value.trim()
    });
    createForm.reset();
    await refreshUsers();
    userNameInput.focus();
    showToast("Usuario creado correctamente.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const user = (await api.list().catch((error) => {
    showToast(error.message, true);
    return { data: [] };
  })).data.find((item) => item.id === button.dataset.id);
  if (!user) return;

  if (button.dataset.action === "delete") {
    if (!window.confirm(`¿Eliminar a ${user.name}?`)) return;
    button.disabled = true;
    try {
      await api.remove(user.id);
      await refreshUsers();
      showToast("Usuario eliminado.");
    } catch (error) {
      showToast(error.message, true);
      button.disabled = false;
    }
    return;
  }

  const row = button.closest("tr");
  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 120;
  name.required = true;
  name.value = user.name;
  name.setAttribute("aria-label", "Editar nombre");
  const email = document.createElement("input");
  email.type = "email";
  email.maxLength = 254;
  email.required = true;
  email.value = user.email;
  email.setAttribute("aria-label", "Editar correo");
  const form = document.createElement("form");
  form.className = "edit-form";
  form.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center";
  name.className = "edit-input";
  email.className = "edit-input";
  const save = document.createElement("button");
  save.className = "action-button";
  save.type = "submit";
  save.title = "Guardar cambios";
  save.setAttribute("aria-label", "Guardar cambios");
  save.textContent = "✓";
  const cancel = document.createElement("button");
  cancel.className = "action-button";
  cancel.type = "button";
  cancel.title = "Cancelar edición";
  cancel.setAttribute("aria-label", "Cancelar edición");
  cancel.textContent = "×";
  form.append(name, email, save, cancel);
  const firstCell = row.cells[0];
  firstCell.replaceChildren(form);
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    save.disabled = true;
    try {
      await api.update(user.id, { name: name.value.trim(), email: email.value.trim() });
      await refreshUsers();
      showToast("Cambios guardados.");
    } catch (error) {
      showToast(error.message, true);
      save.disabled = false;
    }
  });
  cancel.addEventListener("click", () => refreshUsers());
  name.focus();
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.classList.add("is-loading");
  await refreshUsers();
  refreshButton.classList.remove("is-loading");
  refreshButton.disabled = false;
});

for (const control of [searchInput, searchField, sortField]) {
  control.addEventListener("input", () => renderUsers(allUsers, false));
  control.addEventListener("change", () => renderUsers(allUsers, false));
}

mailboxUser.addEventListener("change", loadMessages);
mailSender.addEventListener("change", () => {
  if (mailSender.value === mailRecipient.value) {
    mailRecipient.value = allUsers.find((user) => user.id !== mailSender.value)?.id || "";
  }
});

document.querySelectorAll(".mail-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    currentFolder = tab.dataset.folder;
    document.querySelectorAll(".mail-tab").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    loadMessages();
  });
});

mailComposeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = mailComposeForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const recipientId = mailRecipient.value;
    const senderId = mailSender.value;
    await api.sendMessage({
      senderId,
      recipientId,
      subject: document.querySelector("#mail-subject").value,
      body: document.querySelector("#mail-body").value
    });
    mailComposeForm.reset();
    mailSender.value = senderId;
    mailRecipient.value = recipientId;
    mailboxUser.value = recipientId;
    currentFolder = "inbox";
    document.querySelector("#inbox-tab").click();
    showToast("Mensaje enviado a la bandeja del destinatario.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = allUsers.length < 2;
  }
});

mailRecipient.addEventListener("change", () => {
  if (mailRecipient.value === mailSender.value) {
    mailRecipient.value = allUsers.find((user) => user.id !== mailSender.value)?.id || "";
    showToast("El remitente y destinatario deben ser usuarios distintos.", true);
  }
});

mailList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-message-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await api.rejectMessage(button.dataset.messageId, mailboxUser.value);
    await loadMessages();
    showToast("Mensaje rechazado; el remitente verá la notificación en Enviados.");
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
});

function addTestResult(result) {
  addTestResultTo(resultsContainer, result);
}

function addTestResultTo(container, result) {
  const row = document.createElement("div");
  row.className = `test-result${result.passed ? "" : " is-fail"}`;
  const symbol = document.createElement("span");
  symbol.className = "result-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = result.passed ? "✓" : "!";
  const name = document.createElement("span");
  name.className = "result-name";
  name.textContent = result.name;
  const detail = document.createElement("span");
  detail.className = "result-detail";
  detail.textContent = result.detail;
  row.append(symbol, name, detail);
  container.append(row);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runDeletionTests() {
  runDeletionTestsButton.disabled = true;
  createDeletionTestUserButton.disabled = true;
  deletionResultsPanel.hidden = false;
  deletionResultsContainer.replaceChildren();
  setText(document.querySelector("#deletion-run-note"), "Ejecutando…");
  let passed = 0;
  let failed = 0;

  async function check(name, expectedStatus, operation) {
    try {
      const response = await operation();
      const actualStatus = response.status;
      const succeeded = actualStatus === expectedStatus;
      if (succeeded) passed += 1;
      else failed += 1;
      addTestResultTo(deletionResultsContainer, {
        name,
        passed: succeeded,
        detail: `esperado ${expectedStatus} · recibido ${actualStatus}`
      });
      return response;
    } catch (error) {
      const actualStatus = error.status;
      const succeeded = actualStatus === expectedStatus;
      if (succeeded) passed += 1;
      else failed += 1;
      addTestResultTo(deletionResultsContainer, {
        name,
        passed: succeeded,
        detail: `esperado ${expectedStatus} · recibido ${actualStatus || "sin respuesta"}`
      });
      return null;
    }
  }

  try {
    const testUserId = deletionTestUserId;
    if (!testUserId) {
      throw new Error("Primero crea el usuario temporal para la prueba de eliminaciones.");
    }

    const existing = await check(
      "GET · mostrar usuario de prueba antes de eliminarlo",
      200,
      () => api.get(testUserId)
    );
    if (!existing) {
      throw new Error("No se encontró el usuario temporal; créalo de nuevo antes de ejecutar la prueba.");
    }

    setText(
      document.querySelector("#deletion-run-note"),
      `Eliminando ${existing.data.name}…`
    );
    const deleted = await check(
      "DELETE · eliminar el usuario temporal visible",
      204,
      () => api.remove(testUserId)
    );
    if (deleted?.status === 204) {
      localStorage.removeItem(deletionTestUserStorageKey);
      deletionTestUserId = null;
      await check(
        "GET · confirmar que el usuario ya no existe",
        404,
        () => api.get(testUserId)
      );
    } else {
      addTestResultTo(deletionResultsContainer, {
        name: "GET · confirmar que el usuario ya no existe",
        passed: false,
        detail: "no se confirmó el borrado del usuario temporal"
      });
      failed += 1;
    }

    const suffix = `${Date.now()}-${crypto.randomUUID()}`;
    const missingId = `delete-test-inexistente-${suffix}`;
    await check("DELETE · responder 404 para un usuario inexistente", 404, () => api.remove(missingId));
  } catch (error) {
    failed += 1;
    addTestResultTo(deletionResultsContainer, {
      name: "Prueba de eliminaciones",
      passed: false,
      detail: error.message
    });
  } finally {
    await refreshUsers();
    setText(
      document.querySelector("#deletion-run-note"),
      failed === 0 ? `${passed} de ${passed} pruebas aprobadas` : `${failed} ${failed === 1 ? "fallo" : "fallos"}`
    );
    updateDeletionTestControls(allUsers);
    showToast(
      failed === 0
        ? `Prueba de eliminaciones completada: ${passed} verificaciones aprobadas.`
        : `${failed} pruebas de eliminación requieren atención.`,
      failed > 0
    );
  }
}

createDeletionTestUserButton.addEventListener("click", async () => {
  createDeletionTestUserButton.disabled = true;
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  try {
    const created = await api.create({
      name: "Usuario prueba de eliminación",
      email: `delete-test-${suffix}@example.com`
    });
    deletionTestUserId = created.data.id;
    localStorage.setItem(deletionTestUserStorageKey, deletionTestUserId);
    searchInput.value = "";
    searchField.value = "all";
    await refreshUsers();
    const row = tableBody.querySelector(`[data-id="${CSS.escape(deletionTestUserId)}"]`)?.closest("tr");
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Usuario de prueba creado y visible. Se conservará hasta que ejecutes la prueba de eliminaciones.");
  } catch (error) {
    createDeletionTestUserButton.disabled = false;
    showToast(error.message, true);
  }
});

async function runLiveTests() {
  runTestsButton.disabled = true;
  runDeletionTestsButton.disabled = true;
  refreshButton.disabled = true;
  progress.classList.add("is-running");
  resultsContainer.replaceChildren();
  setText(document.querySelector("#run-note"), "Ejecutando verificaciones…");

  let passed = 0;
  let failed = 0;
  let createdId;
  let secondId;
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  const firstUser = { name: "Prueba CI", email: `api-test-${suffix}@example.com` };
  const secondUser = { name: "Prueba CI 2", email: `api-test-2-${suffix}@example.com` };

  async function check(name, expectedStatus, operation) {
    await sleep(160);
    try {
      const response = await operation();
      const ok = response.status === expectedStatus;
      if (ok) passed += 1;
      else failed += 1;
      addTestResult({
        name,
        passed: ok,
        detail: `esperado ${expectedStatus} · recibido ${response.status}`
      });
      return response;
    } catch (error) {
      const ok = error.status === expectedStatus;
      if (ok) passed += 1;
      else failed += 1;
      addTestResult({
        name,
        passed: ok,
        detail: `esperado ${expectedStatus} · recibido ${error.status || "sin respuesta"}`
      });
      return null;
    }
  }

  try {
    await check("GET · /api/health", 200, () => api.request("/api/health"));
    await check("GET · listar usuarios", 200, () => api.list());

    const created = await check("POST · crear usuario", 201, () => api.create(firstUser));
    createdId = created?.data.id;
    const duplicate = await check("POST · rechazar correo duplicado", 409, () => api.create(firstUser));

    if (createdId) {
      await check("GET · buscar usuario por ID", 200, () => api.get(createdId));
      const updated = await check(
        "PUT · actualizar usuario",
        200,
        () => api.update(createdId, { name: "Prueba CI actualizada", email: firstUser.email })
      );
      if (updated && (updated.data.name !== "Prueba CI actualizada" || updated.data.id !== createdId)) {
        failed += 1;
        passed -= 1;
        const result = resultsContainer.lastElementChild;
        result.classList.add("is-fail");
        result.querySelector(".result-symbol").textContent = "!";
        result.querySelector(".result-detail").textContent = "la respuesta no refleja los cambios";
      }
      await check("PUT · rechazar datos inválidos", 400, () => api.update(createdId, {
        name: "",
        email: "correo-no-valido"
      }));
    } else {
      for (const name of [
        "GET · buscar usuario por ID",
        "PUT · actualizar usuario",
        "PUT · rechazar datos inválidos"
      ]) {
        failed += 1;
        addTestResult({ name, passed: false, detail: "requiere que POST cree un usuario" });
      }
    }

    const secondCreated = await check("POST · crear segundo usuario", 201, () => api.create(secondUser));
    secondId = secondCreated?.data.id;
    if (createdId && secondId) {
      await check("PUT · rechazar correo de otro usuario", 409, () => api.update(secondId, firstUser));
    } else {
      failed += 1;
      addTestResult({
        name: "PUT · rechazar correo de otro usuario",
        passed: false,
        detail: "requiere dos usuarios de prueba"
      });
    }

    const missing = await api.request(`/api/users/live-test-inexistente-${suffix}`).then(
      (response) => ({ status: response.status }),
      (error) => ({ status: error.status })
    );
    const notFoundPass = missing.status === 404;
    if (notFoundPass) passed += 1;
    else failed += 1;
    addTestResult({
      name: "GET · responder 404 por usuario inexistente",
      passed: notFoundPass,
      detail: `esperado 404 · recibido ${missing.status || "sin respuesta"}`
    });

    if (createdId) {
      await check("DELETE · eliminar usuario", 204, () => api.remove(createdId));
      createdId = undefined;
      await check("GET · confirmar usuario eliminado", 404, () => api.get(created?.data.id));
    } else {
      for (const name of ["DELETE · eliminar usuario", "GET · confirmar usuario eliminado"]) {
        failed += 1;
        addTestResult({ name, passed: false, detail: "requiere que POST cree un usuario" });
      }
    }

    if (secondId) {
      const response = await api.remove(secondId).then(
        (result) => result,
        (error) => ({ status: error.status, data: { error: error.message } })
      );
      if (response.status !== 204) {
        failed += 1;
        addTestResult({
          name: "Limpieza · eliminar segundo usuario de prueba",
          passed: false,
          detail: `esperado 204 · recibido ${response.status}`
        });
        showToast("No se pudo eliminar un registro temporal de prueba.", true);
      }
    }
  } catch (error) {
    failed += 1;
    addTestResult({ name: "Pruebas HTTP", passed: false, detail: error.message });
  } finally {
    if (createdId || secondId) {
      for (const id of [createdId, secondId]) {
        if (id) await api.remove(id).catch(() => {});
      }
    }
    await refreshUsers();
    progress.classList.remove("is-running");
    setText(document.querySelector("#run-note"), failed === 0 ? "Verificación completada" : `${failed} ${failed === 1 ? "fallo" : "fallos"}`);
    setText(document.querySelector("#live-test-count"), `${passed + failed} de 12 verificaciones aprobadas`);
    runTestsButton.disabled = false;
    updateDeletionTestControls(allUsers);
    refreshButton.disabled = false;
    if (failed === 0) showToast(`Correcto: ${passed} verificaciones HTTP aprobadas.`);
    else showToast(`${failed} verificaciones requieren atención.`, true);
  }
}

runTestsButton.addEventListener("click", runLiveTests);
runDeletionTestsButton.addEventListener("click", runDeletionTests);
document.querySelector("#new-user-button").addEventListener("click", () => {
  userNameInput.focus();
  createForm.scrollIntoView({ behavior: "smooth", block: "center" });
});

setText(document.querySelector("#api-origin"), window.location.origin);
refreshUsers();
