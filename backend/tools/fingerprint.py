"""Perceptual fingerprint (dHash) of an ad screenshot: near-identical ads match even after re-cropping or re-sizing."""
from __future__ import annotations

import io

from PIL import Image


def dhash(image_bytes: bytes, size: int = 8) -> str | None:
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((size + 1, size), Image.LANCZOS)
    except Exception:
        return None
    px = list(img.tobytes())
    bits = 0
    for row in range(size):
        for col in range(size):
            left, right = px[row * (size + 1) + col], px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f"{bits:016x}"


def distance(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def similar(a: str | None, b: str | None, max_bits: int = 6) -> bool:
    return bool(a and b) and distance(a, b) <= max_bits
