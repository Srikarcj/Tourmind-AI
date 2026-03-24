const formatMeta = meta => {
  if (!meta) {
    return "";
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (_error) {
    return "";
  }
};

const log = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== "production") {
      log("debug", message, meta);
    }
  }
};
