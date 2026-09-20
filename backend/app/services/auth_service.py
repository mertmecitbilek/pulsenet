"""
PulseNet Backend — Authentication Service

Responsibilities:
  - Password hashing / verification (bcrypt via passlib)
  - JWT token creation and decoding (python-jose)
  - FastAPI dependency: get_current_user — protects all secured routes
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

# bcrypt password hashing context
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bearer token extractor (reads Authorization: Bearer <token>)
_bearer = HTTPBearer(auto_error=False)

# JWT settings
_ALGORITHM  = "HS256"
_TOKEN_TTL  = timedelta(hours=24)


# ---------------------------------------------------------------------------
# Login throttling
# In-memory, so it resets on restart and is per-process — enough for a
# single-instance deployment. Use Redis if you run several backend replicas.
# ---------------------------------------------------------------------------

_LOGIN_WINDOW      = timedelta(minutes=15)
_MAX_FAILED_LOGINS = 10
_MAX_TRACKED_KEYS  = 1024

_failed_logins: dict[str, list[datetime]] = {}


def _recent(attempts: list[datetime], now: datetime) -> list[datetime]:
    return [at for at in attempts if now - at < _LOGIN_WINDOW]


def login_blocked(key: str) -> bool:
    """True if this client has burned through its failed-login budget."""
    now = datetime.now(timezone.utc)
    attempts = _recent(_failed_logins.get(key, []), now)
    if attempts:
        _failed_logins[key] = attempts
    else:
        _failed_logins.pop(key, None)
    return len(attempts) >= _MAX_FAILED_LOGINS


def record_failed_login(key: str) -> None:
    now = datetime.now(timezone.utc)
    _failed_logins.setdefault(key, []).append(now)
    if len(_failed_logins) > _MAX_TRACKED_KEYS:
        for stale in [k for k, v in _failed_logins.items() if not _recent(v, now)]:
            _failed_logins.pop(stale, None)


def clear_failed_logins(key: str) -> None:
    _failed_logins.pop(key, None)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the given plain-text password."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain-text matches the stored bcrypt hash."""
    return _pwd_context.verify(plain, hashed)


# Hash of a value nobody can supply — used to keep the login response time the
# same whether or not the email exists, so accounts cannot be enumerated.
_DUMMY_HASH = hash_password("pulsenet-timing-equaliser")


def waste_password_time() -> None:
    """Burn the same CPU as a real verification for an unknown email."""
    _pwd_context.verify("x", _DUMMY_HASH)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, email: str) -> str:
    """Create a signed JWT that expires in 24 hours."""
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + _TOKEN_TTL,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependency — inject this into any route to require authentication
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve and return the authenticated user from the Bearer token.

    Usage::
        @router.get("/protected")
        async def protected(user: User = Depends(get_current_user)):
            ...
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials)
    user_id: str = payload.get("sub", "")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    """Resolve a user from a raw JWT (used by the WebSocket, which cannot send headers)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except JWTError:
        return None
    return await db.get(User, payload.get("sub", ""))


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: only users with the 'admin' role may proceed."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


async def verify_agent_key(x_agent_key: str | None = Header(default=None)) -> None:
    """Dependency: validate the agent's API key from the X-Agent-Key header."""
    if x_agent_key != settings.agent_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing agent API key",
        )

async def verify_user_or_agent(
    x_agent_key: str | None = Header(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Dependency: Allow access if EITHER a valid agent key OR a valid JWT is provided."""
    if x_agent_key == settings.agent_api_key:
        return
    
    if credentials:
        # Will raise if token is invalid
        user = await get_current_user(credentials, db)
        if user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required",
            )
        return
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required (User JWT or Agent Key)",
    )
