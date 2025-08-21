# auth.py (full updated)
import os, uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db import get_db
from models import User, Role, UserRole, VerificationCode

from email_sender import send_email
from security_codes import generate_code, hash_code, verify_code, RESET_CODE_TTL_MIN, RESET_MAX_ATTEMPTS

# ==================== CONFIG ====================
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))

# ==================== SECURITY ====================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_roles(db: Session, user_id: uuid.UUID) -> List[str]:
    rows = (
        db.query(Role.name)
        .join(UserRole, Role.role_id == UserRole.role_id)
        .filter(UserRole.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]

# ==================== SCHEMAS ====================
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: EmailStr
    is_active: bool
    roles: List[str]
    is_admin: bool


class Token(BaseModel):
    access_token: str
    token_type: str


# New: reset flows
class RequestReset(BaseModel):
    email: EmailStr


class VerifyCodeBody(BaseModel):
    email: EmailStr
    code: str


class ResetPasswordBody(BaseModel):
    email: EmailStr
    code: str
    new_password: str

# ==================== HELPERS ====================

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


# VerificationCode helpers

def _now():
    return datetime.now(timezone.utc)


def _active_code(db: Session, user_id: uuid.UUID, purpose: str) -> Optional[VerificationCode]:
    return (
        db.query(VerificationCode)
        .filter(
            VerificationCode.user_id == user_id,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
            VerificationCode.expires_at > _now(),
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )


def _consume_all(db: Session, user_id: uuid.UUID, purpose: str):
    db.query(VerificationCode).filter(
        VerificationCode.user_id == user_id,
        VerificationCode.purpose == purpose,
        VerificationCode.consumed_at.is_(None),
    ).update({VerificationCode.consumed_at: _now()})
    db.commit()


# ==================== ROUTER ====================
router = APIRouter(tags=["auth"])


@router.post("/users/register", response_model=UserOut, status_code=201)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    exists = db.query(User).filter(or_(User.username == payload.username, User.email == payload.email)).first()
    if exists:
        raise HTTPException(status_code=400, detail="Username or email already registered")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # ensure default "user" role exists, then assign it
    role_user = db.query(Role).filter_by(name="user").first()
    if not role_user:
        role_user = Role(name="user", description="Regular authenticated user")
        db.add(role_user)
        db.commit()
        db.refresh(role_user)
    db.add(UserRole(user_id=user.id, role_id=role_user.role_id))
    db.commit()

    roles = get_user_roles(db, user.id)
    return UserOut(
        id=user.id, username=user.username, email=user.email,
        is_active=user.is_active, roles=roles, is_admin=("admin" in roles)
    )


@router.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_user_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user.last_login = _now()
    db.commit()

    roles = get_user_roles(db, user.id)
    access_token = create_access_token({"sub": str(user.id), "roles": roles})
    return {"access_token": access_token, "token_type": "bearer"}


def _fetch_user_from_token(db: Session, token: str) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise cred_exc
        user_id = uuid.UUID(sub)
    except JWTError:
        raise cred_exc
    user = db.get(User, user_id)
    if not user:
        raise cred_exc
    return user


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> UserOut:
    user = _fetch_user_from_token(db, token)
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Inactive user")
    roles = get_user_roles(db, user.id)
    return UserOut(
        id=user.id, username=user.username, email=user.email,
        is_active=user.is_active, roles=roles, is_admin=("admin" in roles)
    )


def require_admin(current: UserOut = Depends(get_current_user)) -> UserOut:
    if "admin" not in current.roles:
        raise HTTPException(status_code=403, detail="Admin role required")
    return current


@router.get("/users/me", response_model=UserOut)
def read_users_me(current: UserOut = Depends(get_current_user)):
    return current


# ==================== Password reset endpoints ====================
@router.post("/auth/request-password-reset")
def request_password_reset(body: RequestReset, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)
    # Always act as if it worked (avoid enumeration)
    if user:
        # Invalidate previous active codes for this purpose
        _consume_all(db, user.id, "password_reset")

        code = generate_code()
        rec = VerificationCode(
            user_id=user.id,
            purpose="password_reset",
            code_hash=hash_code(code),
            expires_at=_now() + timedelta(minutes=RESET_CODE_TTL_MIN),
        )
        db.add(rec)
        db.commit()

        html = f"""
        <div style=\"font-family:Inter,Arial,sans-serif\">
          <h2>Your password reset code</h2>
          <p>Hello {user.username},</p>
          <p>Use this code to reset your password: <b style=\"font-size:20px\">{code}</b></p>
          <p>This code expires in {RESET_CODE_TTL_MIN} minutes. If you didn’t request it, ignore this email.</p>
        </div>
        """
        try:
            send_email(to_email=user.email, subject="Your password reset code", html=html)
        except Exception:
            # Swallow errors to avoid leaking existence; log in real app
            pass

    return {"ok": True}


@router.post("/auth/verify-reset-code")
def verify_reset_code(body: VerifyCodeBody, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)
    if not user:
        return {"valid": False}

    rec = _active_code(db, user.id, "password_reset")
    if not rec:
        return {"valid": False}

    if rec.attempts >= RESET_MAX_ATTEMPTS:
        return {"valid": False}

    if not verify_code(body.code, rec.code_hash):
        rec.attempts += 1
        db.commit()
        return {"valid": False}

    return {"valid": True}


@router.post("/auth/reset-password")
def reset_password(body: ResetPasswordBody, db: Session = Depends(get_db)):
    user = get_user_by_email(db, body.email)
    if not user:
        return {"ok": True}

    rec = _active_code(db, user.id, "password_reset")
    if not rec:
        return {"ok": True}

    if rec.attempts >= RESET_MAX_ATTEMPTS:
        return {"ok": True}

    if not verify_code(body.code, rec.code_hash):
        rec.attempts += 1
        db.commit()
        return {"ok": True}

    # consume and update password
    rec.consumed_at = _now()
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"ok": True}