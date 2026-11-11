"""Login to Garmin Connect and print a secret string for GitHub Actions.

International accounts use garmin.com (the default). Omit the password so it
is prompted with getpass and is not stored in shell history. If the account
has MFA, garminconnect asks for the code on the terminal.

This uses garminconnect (>=0.3.20, curl_cffi TLS impersonation). Secrets
produced by the old garth script are invalid and must be regenerated.

Do not commit the printed secret. Store it as the GitHub Actions secret
GARMIN_SECRET_STRING. Do not pass --is-cn; that selects garmin.cn.
"""

import argparse
import getpass
import json
import sys

import garminconnect

from garmin_token_store import token_has_refresh_material

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Login to Garmin Connect International (garmin.com) and print a "
            "secret string for GARMIN_SECRET_STRING. Omit the password to be "
            "prompted (recommended). Old garth secrets are invalid."
        )
    )
    parser.add_argument("email", nargs="?", help="email of garmin")
    parser.add_argument(
        "password",
        nargs="?",
        help="optional; omit it to be prompted so the password is not saved in shell history",
    )
    parser.add_argument(
        "--is-cn",
        dest="is_cn",
        action="store_true",
        help="if garmin account is cn (garmin.cn). This site syncs garmin.com and does not use this flag.",
    )
    options = parser.parse_args()
    if options.is_cn:
        print(
            "Warning: --is-cn uses garmin.cn. This site expects a garmin.com secret.",
            file=sys.stderr,
        )

    email = (options.email or input("Garmin email (garmin.com): ")).strip()
    if not email:
        print("Email is required.", file=sys.stderr)
        sys.exit(1)

    if options.password:
        print(
            "Warning: password was passed on the command line and may be saved in shell history. "
            "Next time run: python run_page/get_garmin_secret.py <email>",
            file=sys.stderr,
        )
        password = options.password
    else:
        password = getpass.getpass("Garmin password (hidden, not saved): ")
    if not password:
        print("Password is required.", file=sys.stderr)
        sys.exit(1)

    # garminconnect prompts via prompt_mfa only when the account requires a code.
    garmin = garminconnect.Garmin(
        email,
        password,
        is_cn=options.is_cn,
        prompt_mfa=lambda: input("MFA code: ").strip(),
    )
    garmin.login()
    secret_string = garmin.client.dumps()
    if not token_has_refresh_material(secret_string):
        print(
            "登录结果里没有长期刷新材料（di_token、di_refresh_token、di_client_id 必须都有）。"
            "不能把这段输出当作 GARMIN_SECRET_STRING。",
            file=sys.stderr,
        )
        sys.exit(1)
    # Confirm the three fields without printing the token values.
    fields = sorted(json.loads(secret_string))
    print(
        "Copy everything below into the GitHub Actions secret GARMIN_SECRET_STRING.",
        file=sys.stderr,
    )
    print(
        "这一行是完整登录态，字段包括 "
        + ", ".join(fields)
        + "。其中 di_refresh_token 用来在访问令牌过期后续期，必须整段保存。",
        file=sys.stderr,
    )
    print(
        "旧的 garth 密钥、以及只含访问令牌的片段都不能用。",
        file=sys.stderr,
    )
    print(secret_string)
