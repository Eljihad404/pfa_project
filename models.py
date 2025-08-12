# models.py
import uuid
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Integer, Text, JSON, BigInteger
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    # DB column name is 'hashed_pw'
    hashed_password = Column("hashed_pw", String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login = Column(DateTime(timezone=True))
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

class Role(Base):
    __tablename__ = "roles"
    role_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text)

class UserRole(Base):
    __tablename__ = "user_roles"
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.role_id", ondelete="CASCADE"), primary_key=True)

    user = relationship("User", back_populates="roles")
    role = relationship("Role")

class Chat(Base):
    __tablename__ = "chats"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class Message(Base):
    __tablename__ = "messages"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    chat_id = Column(PGUUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    sender = Column(String, nullable=False)  # 'user' | 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class File(Base):
    __tablename__ = "files"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column(PGUUID(as_uuid=True), ForeignKey("chats.id", ondelete="SET NULL"))
    filename = Column(Text, nullable=False)
    mime_type = Column(Text)
    storage_path = Column(Text, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class Activity(Base):
    __tablename__ = "activities"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    activity = Column(Text, nullable=False)
    meta = Column("metadata", JSON)  # python attr 'meta', DB column 'metadata'
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class RequestLog(Base):
    __tablename__ = "request_logs"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    method = Column(Text, nullable=False)
    path = Column(Text, nullable=False)
    status_code = Column(Integer, nullable=False)
    ip_address = Column(Text)
    user_agent = Column(Text)
    query_params = Column(Text)
    body = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
