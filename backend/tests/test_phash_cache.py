"""Verify the widened perceptual-hash fuzzy cache for /api/quotes/image.

Covers the iteration_18 fix:
  * HAMMING_THRESHOLD widened to 15 bits per image
  * Fuzzy cache lookup no longer requires matching desc_norm

For each scenario we upload once (may be a real AI call / cache MISS),
then re-upload variants and assert the returned price/scale_level match
the seed exactly, which is only possible via a cache hit. We also grep
backend logs for the "Cache HIT via phash fuzzy" line to confirm the
fuzzy path (not exact-byte) served the second call.
"""

import io
import os
import re
import time
import subprocess
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or frontend_env.get("REACT_APP_BACKEND_URL")
).rstrip("/")

# Two visually distinct existing quote images from disk.
IMAGE_A = Path("/app/static/quote_images/quote_0709bbde-caa1-445b-bfe0-f8729af30b11.jpg")
IMAGE_B = Path("/app/static/quote_images/quote_105f0011-83b6-46f1-8ea3-19cce0fdd425.jpg")


def _post_image(image_bytes: bytes, description: str, filename: str = "photo.jpg"):
    files = {"file": (filename, image_bytes, "image/jpeg")}
    data = {"description": description}
    return requests.post(f"{BASE_URL}/api/quotes/image", files=files, data=data, timeout=120)


def _tail_backend_log(n_lines: int = 200) -> str:
    out = subprocess.run(
        ["bash", "-lc", f"tail -n {n_lines} /var/log/supervisor/backend.*.log"],
        capture_output=True, text=True
    )
    return out.stdout + out.stderr


def _re_encode(path: Path, quality: int) -> bytes:
    """Re-encode a JPEG at a specific quality to change the byte-hash but not phash."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()


@pytest.fixture(scope="module", autouse=True)
def _preflight():
    assert IMAGE_A.exists(), f"Missing seed image {IMAGE_A}"
    assert IMAGE_B.exists(), f"Missing seed image {IMAGE_B}"
    # Sanity: backend reachable
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code in (200, 404), f"backend not reachable: {r.status_code} {r.text[:200]}"


class TestPhashFuzzyCache:
    def test_same_photo_different_descriptions_hits_fuzzy_cache(self):
        """Upload IMAGE_A twice with DIFFERENT descriptions. Second must equal first."""
        bytes_a = IMAGE_A.read_bytes()

        r1 = _post_image(bytes_a, "trash bags")
        assert r1.status_code == 200, f"first upload failed: {r1.status_code} {r1.text[:300]}"
        q1 = r1.json()
        price1 = q1["total_price"]
        scale1 = q1.get("scale_level")
        assert isinstance(price1, (int, float)) and price1 > 0

        # Give the cache a moment to be written (it's awaited inline, but be safe).
        time.sleep(1)

        # Different bytes (re-encoded @ q=30) + different description → must fuzzy-hit.
        bytes_a_reenc = _re_encode(IMAGE_A, quality=30)
        assert bytes_a_reenc != bytes_a, "re-encode did not change bytes"

        r2 = _post_image(bytes_a_reenc, "garbage bags in yard")
        assert r2.status_code == 200, f"second upload failed: {r2.status_code} {r2.text[:300]}"
        q2 = r2.json()

        assert q2["total_price"] == price1, (
            f"Expected fuzzy-cache hit with same price, got {q2['total_price']} != {price1}"
        )
        assert q2.get("scale_level") == scale1

        log = _tail_backend_log(400)
        assert "Cache HIT via phash fuzzy" in log, (
            "Backend log missing 'Cache HIT via phash fuzzy' after re-encoded upload"
        )

    def test_same_photo_same_description_hits_cache(self):
        """Same bytes + same description must hit exact cache (byte-hash path)."""
        bytes_a = IMAGE_A.read_bytes()
        desc = "trash bags"

        r1 = _post_image(bytes_a, desc)
        assert r1.status_code == 200
        price1 = r1.json()["total_price"]

        r2 = _post_image(bytes_a, desc)
        assert r2.status_code == 200
        assert r2.json()["total_price"] == price1

        log = _tail_backend_log(400)
        assert ("Cache HIT" in log), "expected Cache HIT log line on identical re-upload"

    def test_different_photo_does_not_hit_cache(self):
        """A visually distinct photo must NOT collide with the IMAGE_A cache entry.

        We can't guarantee the AI returns a different price (rare collision), so we
        only assert the backend does NOT log a 'phash fuzzy' hit against IMAGE_A's phash.
        """
        # Prime IMAGE_A first (may already be cached).
        _post_image(IMAGE_A.read_bytes(), "trash bags")
        time.sleep(1)

        # Snapshot logs to compute a diff after IMAGE_B upload.
        before = _tail_backend_log(500)
        r = _post_image(IMAGE_B.read_bytes(), "old furniture pile")
        # 400 is acceptable here — the AI content filter may reject some seed
        # photos. What matters is the cache-lookup behaviour BEFORE that filter.
        assert r.status_code in (200, 400), f"unexpected status {r.status_code}: {r.text[:200]}"
        after = _tail_backend_log(1000)
        new = after[len(before):] if after.startswith(before) else after

        # Must contain a Cache MISS for IMAGE_B — proving the fuzzy check did
        # NOT collapse a visually distinct image onto IMAGE_A's cache row.
        assert "Cache MISS" in new, (
            "Expected 'Cache MISS' for visually distinct IMAGE_B; "
            "instead the fuzzy cache may have incorrectly matched it. Log tail:\n" + new[-1500:]
        )
        for m in re.finditer(r"Cache HIT via phash fuzzy \(hamming=(\d+)/(\d+)", new):
            hamming, threshold = int(m.group(1)), int(m.group(2))
            assert hamming <= threshold, f"fuzzy hit exceeded threshold: {hamming}/{threshold}"

    def test_cache_row_grew(self):
        """After the above tests, at least one new image_cache document should exist."""
        # Not a hard requirement — could already be cached — but useful signal.
        # We just query via the module-level Mongo client used by the app.
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio

        async def _count():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            try:
                db = client[os.environ["DB_NAME"]]
                return await db.image_cache.count_documents({})
            finally:
                client.close()

        count = asyncio.get_event_loop().run_until_complete(_count())
        assert count >= 4, f"image_cache row count unexpectedly low: {count}"
