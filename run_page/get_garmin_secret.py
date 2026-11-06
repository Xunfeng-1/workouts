"""Login to Garmin Connect and print a secret string for GitHub Actions.

International accounts use garmin.com (the default). Omit the password so it
is prompted with getpass and is not stored in shell history. If the account
has MFA, garth asks for the code on the terminal.

Do not commit the printed secret. Store it as the GitHub Actions secret
GARMIN_SECRET_STRING.
"""

import argparse
import getpass
import sys

import garth

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Login to Garmin Connect International (garmin.com) and print a "
            "secret string. Omit the password to be prompted (recommended)."
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
        garth.configure(domain="garmin.cn", ssl_verify=False)

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

    # Prompts for an MFA code when the account requires it.
    garth.login(email, password)
    secret_string = garth.client.dumps()
    print(
        "Copy everything below into the GitHub Actions secret GARMIN_SECRET_STRING:",
        file=sys.stderr,
    )
    print(secret_string)
