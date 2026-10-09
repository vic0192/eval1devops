const express = require("express");
const path = require("node:path");
const { router: usersRouter } = require("./users");
const { router: messagesRouter } = require("./messages");
const errorHandler = require("./error-handler");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  return res.json({ state: "ok-testing" });
});

app.use("/api/users", usersRouter);
app.use("/api/messages", messagesRouter);

app.use((_req, res) => {
  return res.status(404).json({ error: "Ruta no encontrada." });
});

app.use(errorHandler);

module.exports = app;
