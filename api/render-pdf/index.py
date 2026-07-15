import base64
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from render_plan_pdf import render  # noqa: E402

MAX_BODY_BYTES = 3 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not self._origin_allowed():
            return self._json(403, {"error": "origin_not_allowed"})

        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                return self._json(413, {"error": "request_too_large"})
            request = json.loads(self.rfile.read(length))
            payload = str(request.get("payload", ""))
            signature = str(request.get("signature", ""))
            envelope = verify_envelope(payload, signature)
            kind = "workout" if envelope.get("workout_plan") else "nutrition"

            with tempfile.TemporaryDirectory(prefix="fitnet-pdf-") as temp_dir:
                payload_path = Path(temp_dir) / "plan.json"
                output_path = Path(temp_dir) / f"fitnet-{kind}-plan.pdf"
                payload_path.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
                render(
                    str(payload_path),
                    str(output_path),
                    str(ROOT / "data" / "exercise_library.json"),
                    str(ROOT / "data" / "food_library.json"),
                )
                pdf = output_path.read_bytes()

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", f'attachment; filename="fitnet-{kind}-plan.pdf"')
            self.send_header("Content-Length", str(len(pdf)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(pdf)
        except ValueError as error:
            self._json(400, {"error": str(error)})
        except Exception:
            self._json(500, {"error": "pdf_render_failed", "message": "We could not prepare this PDF right now."})

    def do_GET(self):
        self._json(405, {"error": "method_not_allowed"}, {"Allow": "POST"})

    def _origin_allowed(self):
        origin = self.headers.get("origin", "").rstrip("/")
        if not origin:
            return True
        allowed = [value.strip().rstrip("/") for value in os.environ.get("ALLOWED_ORIGINS", "").split(",") if value.strip()]
        if allowed:
            return origin in allowed
        host = self.headers.get("x-forwarded-host") or self.headers.get("host")
        return origin == f"https://{host}" or (os.environ.get("VERCEL_ENV") != "production" and origin == f"http://{host}")

    def _json(self, status, body, extra_headers=None):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)


def verify_envelope(payload, signature):
    secret = os.environ.get("PDF_SIGNING_SECRET", "")
    if not secret:
        raise RuntimeError("PDF_SIGNING_SECRET is not configured")
    expected = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not payload or not signature or not hmac.compare_digest(expected, signature):
        raise ValueError("invalid_pdf_signature")
    try:
        padded = payload + "=" * (-len(payload) % 4)
        envelope = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception as error:
        raise ValueError("invalid_pdf_payload") from error
    if envelope.get("version") != "fitnet.stateless-pdf.v1":
        raise ValueError("invalid_pdf_payload")
    expires_at = envelope.get("expires_at", "")
    try:
        from datetime import datetime
        expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp()
    except Exception as error:
        raise ValueError("invalid_pdf_expiry") from error
    if expires <= time.time():
        raise ValueError("pdf_link_expired")
    if bool(envelope.get("workout_plan")) == bool(envelope.get("nutrition_plan")):
        raise ValueError("invalid_pdf_payload")
    return envelope
