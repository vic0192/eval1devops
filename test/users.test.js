const request = require("supertest");
const app = require("../src/app");
const { resetUsers } = require("../src/users");
const { resetMessages } = require("../src/messages");
const errorHandler = require("../src/error-handler");

const alice = { name: "Ana Pérez", email: "ana@example.com" };

beforeEach(async () => {
  await resetMessages();
  await resetUsers();
});

describe("API REST de usuarios", () => {
  test("GET / sirve el panel de administración", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("Pruebas de la API");
    expect(response.text).toContain("Crear usuario para prueba");
    expect(response.text).toContain("Hacer prueba de eliminaciones");
    expect(response.text).toContain('id="deletion-results-panel"');
  });

  test("GET /app.js y /styles.css sirve los recursos del panel", async () => {
    const [script, stylesheet] = await Promise.all([
      request(app).get("/app.js"),
      request(app).get("/styles.css")
    ]);

    expect(script.status).toBe(200);
    expect(script.headers["content-type"]).toMatch(/javascript/);
    expect(script.text).toContain("runLiveTests");
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers["content-type"]).toMatch(/css/);
    expect(stylesheet.text).toContain("--accent");
  });

  test("GET /api/health confirma que la API está disponible", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ state: "ok-testing" });
  });

  test("permite enviar mensajes, consultar bandejas y rechazar con aviso al remitente", async () => {
    const sender = await request(app).post("/api/users").send(alice);
    const recipient = await request(app)
      .post("/api/users")
      .send({ name: "Beto", email: "beto@example.com" });
    const message = await request(app)
      .post("/api/messages")
      .send({
        senderId: sender.body.data.id,
        recipientId: recipient.body.data.id,
        subject: "Hola",
        body: "Te envío un mensaje."
      });

    expect(message.status).toBe(201);
    expect(message.body.data).toMatchObject({
      senderName: "Ana Pérez",
      recipientName: "Beto",
      subject: "Hola",
      body: "Te envío un mensaje.",
      status: "sent",
      rejectedAt: null
    });

    const inbox = await request(app).get("/api/messages").query({
      userId: recipient.body.data.id,
      folder: "inbox"
    });
    const sent = await request(app).get("/api/messages").query({
      userId: sender.body.data.id,
      folder: "sent"
    });
    expect(inbox.body.data).toHaveLength(1);
    expect(sent.body.data[0].id).toBe(message.body.data.id);

    const forbidden = await request(app)
      .patch(`/api/messages/${message.body.data.id}/reject`)
      .send({ recipientId: sender.body.data.id });
    expect(forbidden.status).toBe(403);

    const rejected = await request(app)
      .patch(`/api/messages/${message.body.data.id}/reject`)
      .send({ recipientId: recipient.body.data.id });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("rejected");
    expect(rejected.body.data.rejectedAt).toEqual(expect.any(String));

    const duplicateReject = await request(app)
      .patch(`/api/messages/${message.body.data.id}/reject`)
      .send({ recipientId: recipient.body.data.id });
    expect(duplicateReject.status).toBe(409);
    const senderView = await request(app).get("/api/messages").query({
      userId: sender.body.data.id,
      folder: "sent"
    });
    expect(senderView.body.data[0].status).toBe("rejected");
  });

  test("valida contenido, usuarios y bandejas de los mensajes", async () => {
    const sender = await request(app).post("/api/users").send(alice);
    const recipient = await request(app)
      .post("/api/users")
      .send({ name: "Beto", email: "beto@example.com" });
    const invalidContent = await request(app).post("/api/messages").send({
      senderId: sender.body.data.id,
      recipientId: recipient.body.data.id,
      subject: " ",
      body: "Mensaje"
    });
    const oversizedContent = await request(app).post("/api/messages").send({
      senderId: sender.body.data.id,
      recipientId: recipient.body.data.id,
      subject: "x".repeat(121),
      body: "Mensaje"
    });
    const selfMessage = await request(app).post("/api/messages").send({
      senderId: sender.body.data.id,
      recipientId: sender.body.data.id,
      subject: "Hola",
      body: "Mensaje"
    });
    const unknownUser = await request(app).post("/api/messages").send({
      senderId: "inexistente",
      recipientId: recipient.body.data.id,
      subject: "Hola",
      body: "Mensaje"
    });
    const invalidInbox = await request(app).get("/api/messages").query({
      userId: "inexistente",
      folder: "inbox"
    });
    const invalidFolder = await request(app).get("/api/messages").query({
      userId: sender.body.data.id,
      folder: "archive"
    });
    const missingMessage = await request(app)
      .patch("/api/messages/inexistente/reject")
      .send({ recipientId: recipient.body.data.id });

    expect(invalidContent.status).toBe(400);
    expect(oversizedContent.status).toBe(400);
    expect(selfMessage.status).toBe(400);
    expect(unknownUser.status).toBe(404);
    expect(invalidInbox.status).toBe(400);
    expect(invalidFolder.status).toBe(400);
    expect(missingMessage.status).toBe(404);
  });

  test("POST /api/users crea un usuario y normaliza su correo", async () => {
    const response = await request(app)
      .post("/api/users")
      .send({ name: " Ana Pérez ", email: " ANA@example.com " });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: "Ana Pérez",
      email: "ana@example.com"
    });
    expect(response.body.data.id).toEqual(expect.any(String));
  });

  test("GET /api/users lista los usuarios creados", async () => {
    await request(app).post("/api/users").send(alice);

    const response = await request(app).get("/api/users");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject(alice);
  });

  test("GET /api/users/:id devuelve un usuario existente", async () => {
    const created = await request(app).post("/api/users").send(alice);

    const response = await request(app).get(
      `/api/users/${created.body.data.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(created.body.data);
  });

  test("PUT /api/users/:id actualiza un usuario", async () => {
    const created = await request(app).post("/api/users").send(alice);

    const response = await request(app)
      .put(`/api/users/${created.body.data.id}`)
      .send({ name: "Ana María", email: "ana.maria@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: created.body.data.id,
      name: "Ana María",
      email: "ana.maria@example.com"
    });
  });

  test("PUT permite conservar el correo existente con otra capitalización", async () => {
    const created = await request(app).post("/api/users").send(alice);

    const response = await request(app)
      .put(`/api/users/${created.body.data.id}`)
      .send({ name: "Ana María", email: "ANA@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe("ana@example.com");
  });

  test("PUT devuelve 404 si el usuario no existe", async () => {
    const response = await request(app)
      .put("/api/users/inexistente")
      .send(alice);

    expect(response.status).toBe(404);
  });

  test("DELETE /api/users/:id elimina un usuario", async () => {
    const created = await request(app).post("/api/users").send(alice);

    const deleted = await request(app).delete(
      `/api/users/${created.body.data.id}`
    );
    const fetched = await request(app).get(
      `/api/users/${created.body.data.id}`
    );

    expect(deleted.status).toBe(204);
    expect(fetched.status).toBe(404);
  });

  test("rechaza nombre vacío y correo inválido", async () => {
    const emptyName = await request(app)
      .post("/api/users")
      .send({ name: " ", email: "ana@example.com" });
    const invalidEmail = await request(app)
      .post("/api/users")
      .send({ name: "Ana", email: "no-es-un-correo" });

    expect(emptyName.status).toBe(400);
    expect(invalidEmail.status).toBe(400);
  });

  test("rechaza correos duplicados, sin distinguir mayúsculas", async () => {
    await request(app).post("/api/users").send(alice);

    const response = await request(app)
      .post("/api/users")
      .send({ name: "Otra Ana", email: "ANA@example.com" });

    expect(response.status).toBe(409);
  });

  test("rechaza la actualización si el correo pertenece a otro usuario", async () => {
    await request(app).post("/api/users").send(alice);
    const bob = await request(app)
      .post("/api/users")
      .send({ name: "Beto", email: "beto@example.com" });

    const response = await request(app)
      .put(`/api/users/${bob.body.data.id}`)
      .send({ name: "Beto", email: "ANA@example.com" });

    expect(response.status).toBe(409);
  });

  test("devuelve 404 cuando no existe un usuario o una ruta", async () => {
    const missingUser = await request(app).get("/api/users/inexistente");
    const missingDelete = await request(app).delete("/api/users/inexistente");
    const missingRoute = await request(app).get("/ruta-inexistente");

    expect(missingUser.status).toBe(404);
    expect(missingDelete.status).toBe(404);
    expect(missingRoute.status).toBe(404);
  });

  test("responde con 400 ante JSON malformado", async () => {
    const response = await request(app)
      .post("/api/users")
      .set("Content-Type", "application/json")
      .send('{"name":');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("El cuerpo JSON no es válido.");
  });

  test("responde con 413 si el cuerpo JSON supera el límite", async () => {
    const response = await request(app)
      .post("/api/users")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "x".repeat(11_000), email: "ana@example.com" }));

    expect(response.status).toBe(413);
  });

  test("el middleware reporta errores internos y devuelve 500", () => {
    const error = new Error("fallo inesperado");
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(error, {}, response, jest.fn());

    expect(log).toHaveBeenCalledWith("Error interno de la API:", error);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "Error interno del servidor."
    });
    log.mockRestore();
  });
});
