# security_codes.py
import os, secrets
from passlib.hash import bcrypt

RESET_CODE_TTL_MIN = int(os.getenv("RESET_CODE_TTL_MIN", "10"))
RESET_MAX_ATTEMPTS = int(os.getenv("RESET_MAX_ATTEMPTS", "5"))


def generate_code() -> str:
    # 6-digit numeric, left padded
    return str(secrets.randbelow(1_000_000)).zfill(6)


def hash_code(code: str) -> str:
    return bcrypt.hash(code)


def verify_code(code: str, code_hash: str) -> bool:
    return bcrypt.verify(code, code_hash)