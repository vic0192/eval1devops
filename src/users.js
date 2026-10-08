const express = require("express");
const { randomUUID } = require("node:crypto");

const router = express.Router();
const users = new Map();

function validUserInput(body) {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof body.name === "string" &&
    body.name.trim().length > 0 &&
    body.name.trim().length <= 120 &&
    typeof body.email === "string" &&
    body.email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  );
}

async function findUser(id) {
  return users.get(id);
}

router.post("/", async (req, res) => {
  if (!validUserInput(req.body)) {
    return res.status(400).json({
      error: "El nombre (hasta 120 caracteres) y un correo válido (hasta 254 caracteres) son obligatorios."
    });
  }

  const email = req.body.email.trim().toLowerCase();
  const user = {
    id: randomUUID(),
    name: req.body.name.trim(),
    email
  };

  if ([...users.values()].some((existing) => existing.email === email)) {
    return res.status(409).json({ error: "Ya existe un usuario con ese correo." });
  }
  users.set(user.id, user);
  return res.status(201).json({ data: user });
});

router.get("/", async (_req, res) => {
  return res.json({ data: [...users.values()] });
});

router.get("/:id", async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  return res.json({ data: user });
});

router.put("/:id", async (req, res) => {
  const existing = await findUser(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  if (!validUserInput(req.body)) {
    return res.status(400).json({
      error: "El nombre (hasta 120 caracteres) y un correo válido (hasta 254 caracteres) son obligatorios."
    });
  }

  const updated = {
    ...existing,
    name: req.body.name.trim(),
    email: req.body.email.trim().toLowerCase()
  };
  if ([...users.values()].some(
    (user) => user.id !== existing.id && user.email === updated.email
  )) {
    return res.status(409).json({ error: "Ya existe un usuario con ese correo." });
  }
  users.set(updated.id, updated);
  return res.json({ data: updated });
});

router.delete("/:id", async (req, res) => {
  if (!users.has(req.params.id)) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  users.delete(req.params.id);
  return res.status(204).end();
});

async function resetUsers() {
  users.clear();
}

module.exports = { router, resetUsers, findUser };
