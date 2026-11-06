#!/usr/bin/env python3
"""Backfill activity countries from the start of each route.

Prefer the Garmin sync, which calls the same helper. This command is for a
one-off fill of run_page/data.db.
"""

import argparse
import sys

from config import SQL_FILE
from generator.db import init_db
from geocode import backfill_missing_locations


def main():
    parser = argparse.ArgumentParser(
        description="Fill missing location_country values from route start points"
    )
    parser.add_argument(
        "--db", default=SQL_FILE, help="Path to the activities sqlite database"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Look up countries without writing them",
    )
    args = parser.parse_args()
    session = init_db(args.db)
    try:
        filled, checked = backfill_missing_locations(session, dry_run=args.dry_run)
        print(f"checked {checked}, filled {filled}")
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
