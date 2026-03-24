const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const withRetry = async (fn, options = {}) => {
  const retries = Number.isInteger(options.retries) ? options.retries : 2;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 300;
  const shouldRetry = options.shouldRetry || (() => true);

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) {
        throw error;
      }

      await wait(delayMs * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError || new Error("Retry operation failed.");
};
