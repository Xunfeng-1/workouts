"""Persist a refreshed Garmin token bundle without committing it in plaintext.

garminconnect's access token (``di_token``) expires after a few days. Refreshing
it can also rotate ``di_refresh_token``. The GitHub secret stays the original
login, so the new bundle is encrypted with that secret and stored in
``run_page/.garmin_token.enc``. The ciphertext is useless without
``GARMIN_SECRET_STRING``. ``GITHUB_TOKEN`` cannot update Actions secrets, and
an Actions cache can be evicted, so the encrypted file is committed by the
sync workflow instead.
"""

import base64
import hashlib
import json
import os
from pathlib import Path

from Crypto.Cipher import AES

TOKEN_FILE = Path(__file__).with_name(".garmin_token.enc")

AUTH_EXPIRED_ZH = (
    "佳明登录已失效（HTTP 401）。访问令牌过期后，刷新令牌也没能换到新的登录态。\n"
    "请在本机重新生成密钥，并整段覆盖 GitHub Actions 密钥 GARMIN_SECRET_STRING：\n"
    "  python run_page/get_garmin_secret.py 你的佳明邮箱\n"
    "然后在 Actions 里再跑一次 Sync Garmin。\n"
    "不要把密码写进命令。不要加 --is-cn。"
)


def token_has_refresh_material(raw: str) -> bool:
    """True when the bundle can mint a new access token later."""
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    return bool(data.get("di_token") and data.get("di_refresh_token") and data.get("di_client_id"))


def _key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_token(payload: str, secret: str) -> str:
    cipher = AES.new(_key(secret), AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(payload.encode("utf-8"))
    blob = {
        "v": 1,
        "alg": "AES-256-GCM",
        "note": "Encrypted Garmin token. Useless without the GARMIN_SECRET_STRING secret.",
        "nonce": base64.b64encode(cipher.nonce).decode("ascii"),
        "tag": base64.b64encode(tag).decode("ascii"),
        "ct": base64.b64encode(ciphertext).decode("ascii"),
    }
    return json.dumps(blob, indent=2) + "\n"


def decrypt_token(encoded: str, secret: str) -> str | None:
    try:
        blob = json.loads(encoded)
        cipher = AES.new(
            _key(secret),
            AES.MODE_GCM,
            nonce=base64.b64decode(blob["nonce"]),
        )
        plain = cipher.decrypt_and_verify(
            base64.b64decode(blob["ct"]),
            base64.b64decode(blob["tag"]),
        )
        text = plain.decode("utf-8")
    except Exception:
        return None
    if not token_has_refresh_material(text):
        return None
    return text


def resolve_token_bundle(secret: str, path: Path = TOKEN_FILE) -> str:
    """Prefer the encrypted cache. Fall back to the GitHub secret itself."""
    if path.is_file():
        cached = decrypt_token(path.read_text(encoding="utf-8"), secret)
        if cached:
            return cached
    return secret


def save_token_bundle(token_json: str, secret: str, path: Path = TOKEN_FILE) -> bool:
    """Encrypt and write the bundle. Return True when the plaintext changed."""
    if not token_has_refresh_material(token_json):
        return False
    if path.is_file():
        current = decrypt_token(path.read_text(encoding="utf-8"), secret)
        if current == token_json:
            return False
    path.write_text(encrypt_token(token_json, secret), encoding="utf-8")
    os.chmod(path, 0o600)
    return True
