"""
PulseNet Backend — Auth Pydantic Schemas
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    """Payload for creating a new account."""
    name: str = Field(..., min_length=2, max_length=128, examples=["Ada Lovelace"])
    email: EmailStr = Field(..., examples=["ada@example.com"])
    password: str = Field(..., min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Payload for logging in."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Public user representation (no password hash)."""
    id: str
    name: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
