export async function fetchWithRetry(url: string, options: any, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      
      // Do not retry client errors like 400, 401, 403, 404
      if (!response.ok && [429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`Retryable status: ${response.status}`);
      }
      
      return response;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      
      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const delay = Math.pow(2, attempt - 1) * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Fetch failed after retries");
}
