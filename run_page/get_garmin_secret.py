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
import sys

import garminconnect

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
    print(
        "Copy everything below into the GitHub Actions secret GARMIN_SECRET_STRING.",
        file=sys.stderr,
    )
    print(
        "Replace any older secret. Tokens created with garth no longer work.",
        file=sys.stderr,
    )
    print(secret_string)
