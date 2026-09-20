"""
PulseNet Backend — Auth Router

Routes:
  POST /api/auth/register  → create account
  POST /api/auth/login     → get JWT token
  GET  /api/auth/me        → current user info
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    hash_password, verify_password, create_access_token, get_current_user,
    login_blocked, record_failed_login, clear_failed_logins, waste_password_time,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _user_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(User))).scalar_one()


@router.get("/registration-status")
async def registration_status(db: AsyncSession = Depends(get_db)) -> dict:
    """Whether /register still accepts new accounts (used by the UI)."""
    is_open = await _user_count(db) == 0 or settings.allow_multiple_users
    return {"registration_open": is_open}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Create a new user account and return a JWT token."""
    # Check if email is already registered
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # The very first account bootstraps the system as admin. After that the
    # instance is single-user unless ALLOW_MULTIPLE_USERS is turned on.
    user_count = await _user_count(db)
    if user_count > 0 and not settings.allow_multiple_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is closed — this instance already has an owner.",
        )

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="admin" if user_count == 0 else "viewer",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.email)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    """Authenticate and return a JWT token."""
    # Behind a reverse proxy this is the proxy's address; configure
    # proxy headers on the server if you deploy that way.
    client_key = request.client.host if request.client else "unknown"

    if login_blocked(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again later.",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is None:
        waste_password_time()

    if not user or not verify_password(payload.password, user.password_hash):
        record_failed_login(client_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    clear_failed_logins(client_key)

    token = create_access_token(user.id, user.email)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Return the currently authenticated user's profile."""
    return UserResponse.model_validate(current_user)
