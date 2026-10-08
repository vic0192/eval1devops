function errorHandler(err, _req, res, _next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo JSON no es válido." });
  }
  if (err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ error: "El cuerpo de la solicitud es demasiado grande." });
  }
  console.error("Error interno de la API:", err);
  return res.status(500).json({ error: "Error interno del servidor." });
}

module.exports = errorHandler;
