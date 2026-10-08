const app = require("./app");

const port = Number(process.env.PORT || 3000);

if (require.main === module) {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`API disponible en el puerto ${port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Se recibió ${signal}; se esperan las solicitudes activas.`);

    const timeout = setTimeout(() => {
      console.error("Se agotó el tiempo para cerrar las solicitudes activas.");
      process.exit(1);
    }, 100_000);
    timeout.unref();

    server.close((err) => {
      clearTimeout(timeout);
      if (err) {
        console.error("No se pudo cerrar el servidor HTTP correctamente:", err);
        process.exitCode = 1;
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
