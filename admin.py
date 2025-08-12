# admin.py
from typing import List, Dict, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from db import get_db
from models import User, Role, UserRole, Chat, Message, File, Activity
from auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------- DASHBOARD ----------
class UsagePoint(BaseModel):
    day: str
    tokens: int

@router.get("/metrics", dependencies=[Depends(require_admin)])
def metrics(db: Session = Depends(get_db)) -> Dict[str, int]:
    users_cnt = db.query(func.count(User.id)).scalar() or 0
    chats_cnt = db.query(func.count(Chat.id)).scalar() or 0
    docs_cnt  = db.query(func.count(File.id)).scalar() or 0
    db_tokens = (db.query(func.coalesce(func.sum(func.length(Message.content)), 0)).scalar() or 0) // 4
    return {"Users": users_cnt, "Chats": chats_cnt, "Tokens": int(db_tokens), "Docs": docs_cnt}

@router.get("/token-usage", response_model=List[UsagePoint], dependencies=[Depends(require_admin)])
def token_usage(db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (
        db.query(
            func.date_trunc('day', Message.created_at).label("d"),
            (func.sum(func.length(Message.content)) / 4.0).label("tok"),
        )
        .filter(Message.created_at >= since)
        .group_by(func.date_trunc('day', Message.created_at))
        .order_by(func.date_trunc('day', Message.created_at))
        .all()
    )
    today = datetime.now(timezone.utc).date()
    series = {(today - timedelta(days=i)).strftime("%a"): 0 for i in range(6, -1, -1)}
    for d, tok in rows:
        series[d.date().strftime("%a")] = int(tok or 0)
    return [{"day": k, "tokens": v} for k, v in series.items()]

# ---------- USERS ----------
class UserRow(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool
    roles: List[str]
    created_at: Optional[datetime]
    last_login: Optional[datetime]

@router.get("/users", response_model=List[UserRow], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db), q: Optional[str] = None):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.username.ilike(like)) | (User.email.ilike(like)))
    users = query.order_by(User.created_at.desc()).all()

    # roles per user
    roles_map: Dict[str, List[str]] = {}
    if users:
        ids = [u.id for u in users]
        rows = (
            db.query(UserRole.user_id, Role.name)
            .join(Role, Role.role_id == UserRole.role_id)
            .filter(UserRole.user_id.in_(ids))
            .all()
        )
        for uid, rname in rows:
            roles_map.setdefault(str(uid), []).append(rname)

    out: List[UserRow] = []
    for u in users:
        out.append(UserRow(
            id=str(u.id),
            username=u.username,
            email=u.email,
            is_active=u.is_active,
            roles=roles_map.get(str(u.id), []),
            created_at=u.created_at,
            last_login=u.last_login
        ))
    return out

class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    roles: Optional[List[str]] = None  # e.g. ["user"], ["admin","user"]

@router.patch("/users/{user_id}", dependencies=[Depends(require_admin)])
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.roles is not None:
        # clear roles
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        # ensure roles exist then assign
        for rname in payload.roles:
            role = db.query(Role).filter_by(name=rname).first()
            if not role:
                role = Role(name=rname, description=f"{rname} role")
                db.add(role); db.commit(); db.refresh(role)
            db.add(UserRole(user_id=user.id, role_id=role.role_id))
    db.commit()
    return {"ok": True}

# ---------- CHAT CONSOLE ----------
class ChatRow(BaseModel):
    id: str
    title: str
    created_at: Optional[datetime]

@router.get("/users/{user_id}/chats", response_model=List[ChatRow], dependencies=[Depends(require_admin)])
def user_chats(user_id: str, db: Session = Depends(get_db)):
    rows = db.query(Chat).filter(Chat.user_id == user_id).order_by(Chat.created_at.desc()).all()
    return [{"id": str(c.id), "title": c.title, "created_at": c.created_at} for c in rows]

class AdminMessage(BaseModel):
    text: str

class AdminMsgRow(BaseModel):
    role: str
    text: str
    created_at: datetime

@router.get("/chats/{chat_id}/messages", response_model=List[AdminMsgRow], dependencies=[Depends(require_admin)])
def chat_messages(chat_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [{"role": m.sender, "text": m.content, "created_at": m.created_at} for m in rows]

@router.post("/chats/{chat_id}/reply", dependencies=[Depends(require_admin)])
def admin_reply(chat_id: str, payload: AdminMessage, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found")
    # append as assistant message
    db.add(Message(chat_id=chat_id, sender="assistant", content=payload.text))
    db.commit()
    return {"ok": True}

# ---------- LOGS ----------
class ActivityRow(BaseModel):
    user_id: Optional[str]
    activity: str
    metadata: Optional[dict]
    occurred_at: datetime

@router.get("/logs", response_model=List[ActivityRow], dependencies=[Depends(require_admin)])
def logs(db: Session = Depends(get_db), limit: int = 100):
    rows = db.query(Activity).order_by(Activity.occurred_at.desc()).limit(limit).all()
    return [
        {
            "user_id": (str(r.user_id) if r.user_id else None),
            "activity": r.activity,
            "metadata": r.meta or {},
            "occurred_at": r.occurred_at,
        } for r in rows
    ]
