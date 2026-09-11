import { onRequestPost as analyze } from "../functions/api/analyze.js";
import { onRequestPost as publish } from "../functions/api/publish.js";
import { onRequestPost as translate } from "../functions/api/translate.js";

const apiRoutes = new Map([
  ["/api/analyze", analyze],
  ["/api/publish", publish],
  ["/api/translate", translate],
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = apiRoutes.get(url.pathname);

    if (handler) {
      if (request.method !== "POST") {
        return json(
          { error: "Method not allowed." },
          405,
          { allow: "POST" },
        );
      }

      return handler({
        request,
        env,
        params: {},
        data: {},
        functionPath: url.pathname,
        waitUntil: (promise) => ctx.waitUntil(promise),
        passThroughOnException: () => {},
        next: () => env.ASSETS.fetch(request),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
