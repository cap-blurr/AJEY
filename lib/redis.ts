import { createClient } from "redis";

let client: any | null = null;
let connecting = false;

export async function getRedis(): Promise<any | null> {
  try {
    if (client) return client;
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (connecting) {
      // simple wait loop to avoid parallel connects in serverless cold starts
      let tries = 0;
      while (!client && tries < 20) {
        await new Promise((r) => setTimeout(r, 50));
        tries++;
      }
      return client;
    }
    connecting = true;
    const c = createClient({ url });
    c.on("error", () => {});
    await c.connect();
    client = c;
    connecting = false;
    return client;
  } catch {
    connecting = false;
    return null;
  }
}


