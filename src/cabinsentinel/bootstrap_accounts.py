"""Accounts provisioned from configuration at startup.

On hosts without persistent storage (a free Hugging Face Space) the account database is empty after every restart,
so nobody could log in. An account is created only when both its email and password are configured; an existing
account is left untouched, so a changed secret does not overwrite a password someone has set since. Passwords come
from secrets and are never logged.
"""

import logging

from src.cabinsentinel.platform_store import ConflictError

logger = logging.getLogger(__name__)
MIN_OWNER_PASSWORD = 10  # same floor as self-service signup


def ensure_bootstrap_accounts(store, settings) -> list[str]:
    """Create the configured admin and demo owner if missing. Returns the roles created; never raises."""
    specs = (
        ("admin", getattr(settings, "bootstrap_admin_email", ""), getattr(settings, "bootstrap_admin_password", ""),
         "Bootstrap admin", None, 1),
        ("owner", getattr(settings, "bootstrap_owner_email", ""), getattr(settings, "bootstrap_owner_password", ""),
         "Demo owner", getattr(settings, "bootstrap_owner_user_id", "") or None, MIN_OWNER_PASSWORD),
    )
    created = []
    for role, email, password, name, user_id, minimum in specs:
        if not email or not password:
            continue
        if len(password) < minimum:
            logger.warning("Bootstrap %s skipped: password shorter than %d characters", role, minimum)
            continue
        try:
            store.create_user(email, password, role=role, full_name=name, user_id=user_id)
            created.append(role)
            logger.info("Bootstrap %s created", role)
        except ConflictError:
            pass  # already exists
        except Exception:
            logger.exception("Bootstrap %s could not be created", role)  # never block startup; no secrets in the log
    return created
