/**
 * Stop accepting new HTTP work, close idle sockets, and release the database
 * connection during container shutdown. A bounded timeout prevents a stuck
 * keep-alive/client connection from holding the process indefinitely.
 */
export function createGracefulShutdown({
  server,
  disconnect,
  clearTimers = () => {},
  timeoutMs = 10_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
}) {
  if (!server || typeof server.close !== "function") {
    throw new TypeError("A running HTTP server is required for graceful shutdown.");
  }
  if (typeof disconnect !== "function") {
    throw new TypeError("A database disconnect function is required for graceful shutdown.");
  }

  let shutdownPromise;

  return function shutdown(signal = "shutdown") {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      logger.info?.("[server] graceful shutdown started", { signal });
      clearTimers();

      let forceCloseTimer;
      const closed = new Promise((resolve, reject) => {
        try {
          server.close((error) => error ? reject(error) : resolve("closed"));
          // close() stops new connections; close idle keep-alive sockets now.
          server.closeIdleConnections?.();
        } catch (error) {
          reject(error);
        }
      });

      const forced = new Promise((resolve) => {
        forceCloseTimer = setTimeoutFn(() => {
          logger.warn?.("[server] graceful shutdown deadline reached; closing remaining connections");
          server.closeAllConnections?.();
          resolve("timeout");
        }, Math.max(1, Number(timeoutMs) || 10_000));
        forceCloseTimer?.unref?.();
      });

      try {
        await Promise.race([closed, forced]);
        await disconnect();
        logger.info?.("[server] database connection closed");
      } finally {
        if (forceCloseTimer) clearTimeoutFn(forceCloseTimer);
      }
    })();

    return shutdownPromise;
  };
}
