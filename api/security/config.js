module.exports = function handler(request, response) {
  response.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  return response.status(200).json({
    turnstile: {
      required: true,
      site_key: String(process.env.TURNSTILE_SITE_KEY || "")
    }
  });
};
