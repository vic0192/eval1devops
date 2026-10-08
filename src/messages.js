const express = require("express");
const { randomUUID } = require("node:crypto");
const { findUser } = require("./users");

const router = express.Router();
const messages = new Map();

function validMessageInput(body) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof body.senderId === "string" &&
    typeof body.recipientId === "string" &&
    body.senderId !== body.recipientId &&
    typeof body.subject === "string" &&
    body.subject.trim().length > 0 &&
    body.subject.trim().length <= 120 &&
    typeof body.body === "string" &&
    body.body.trim().length > 0 &&
    body.body.trim().length <= 2000
  );
}

router.get("/", async (req, res) => {
  const { userId, folder } = req.query;
  if (typeof userId !== "string" || !await findUser(userId)) {
    return res.status(400).json({ error: "Selecciona un usuario válido." });
  }
  if (folder !== "inbox" && folder !== "sent") {
    return res.status(400).json({ error: "La bandeja debe ser inbox o sent." });
  }

  const results = [...messages.values()]
    .filter((message) => (
      folder === "inbox"
        ? message.recipientId === userId
        : message.senderId === userId
    ))
    .sort((first, second) => second.sentAt.localeCompare(first.sentAt));
  return res.json({ data: results });
});

router.post("/", async (req, res) => {
  if (!validMessageInput(req.body)) {
    return res.status(400).json({
      error: "Remitente, destinatario, asunto y mensaje son obligatorios; el asunto admite hasta 120 caracteres y el mensaje hasta 2000."
    });
  }

  const [sender, recipient] = await Promise.all([
    findUser(req.body.senderId),
    findUser(req.body.recipientId)
  ]);
  if (!sender || !recipient) {
    return res.status(404).json({ error: "El remitente o destinatario no existe." });
  }

  const message = {
    id: randomUUID(),
    senderId: sender.id,
    senderName: sender.name,
    senderEmail: sender.email,
    recipientId: recipient.id,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    subject: req.body.subject.trim(),
    body: req.body.body.trim(),
    status: "sent",
    sentAt: new Date().toISOString(),
    rejectedAt: null
  };
  messages.set(message.id, message);
  return res.status(201).json({ data: message });
});

router.patch("/:id/reject", async (req, res) => {
  let message = messages.get(req.params.id);
  if (!message) {
    return res.status(404).json({ error: "Mensaje no encontrado." });
  }
  if (req.body?.recipientId !== message.recipientId) {
    return res.status(403).json({ error: "Solo el destinatario puede rechazar este mensaje." });
  }
  if (message.status === "rejected") {
    return res.status(409).json({ error: "El mensaje ya fue rechazado." });
  }

  message = { ...message, status: "rejected", rejectedAt: new Date().toISOString() };
  messages.set(message.id, message);
  return res.json({ data: message });
});

async function resetMessages() {
  messages.clear();
}

module.exports = { router, resetMessages };
