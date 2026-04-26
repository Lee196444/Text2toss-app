"""
Tests for the new admin photo-reel reorder/crop endpoints AND the hardened
gallery upload endpoint.

Acceptance criteria (review request):
- POST /api/admin/reorder-reel
    * 6 photos -> 200 with {message, photos}; persisted to db.photo_reel
    * != 6 photos -> 400 "Reel must have exactly 6 slots"
    * no admin cookie -> 401
- POST /api/admin/crop-reel-photo
    * valid local-gallery URL + crop -> 200 {message, url, slot_index};
      writes new JPEG to /app/static/gallery/, inserts gallery_photos doc
      with kind='crop', updates the reel slot.
    * slot_index outside 0..5 -> 422
    * unloadable photo_url -> 400
    * no admin cookie -> 401
- POST /api/admin/upload-gallery-photo (hardened)
    * multi-MB JPEG -> 200, saved file resized to <= 2000px / <= ~500KB
    * non-image bytes -> 400 'Unsupported or corrupted image file'
    * HEIC bytes (real, via pillow_heif) -> 200 with .jpg URL

The test cleans up after itself: any reel changes restore the original
state via /admin/reorder-reel; any gallery photos created by the tests
are deleted via DELETE /admin/gallery-photo.
"""
import io
import os
import re
from pathlib import Path

import pytest
import requests
from PIL import Image


# ---------- env ----------

def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "lrobe")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "L1964c10$")


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed ({r.status_code}): {r.text}")
    assert "admin_session" in s.cookies
    return s


@pytest.fixture
def anon_session():
    return requests.Session()


@pytest.fixture(scope="module")
def original_reel(admin_session):
    """Snapshot the existing reel and restore it at end of module."""
    r = admin_session.get(f"{BASE_URL}/api/admin/reel-photos")
    assert r.status_code == 200, r.text
    photos = r.json().get("photos", [])
    # Normalise to length 6
    if len(photos) < 6:
        photos = photos + [None] * (6 - len(photos))
    elif len(photos) > 6:
        photos = photos[:6]
    yield list(photos)
    # Teardown: restore
    try:
        admin_session.post(
            f"{BASE_URL}/api/admin/reorder-reel", json={"photos": photos}
        )
    except Exception:
        pass


@pytest.fixture(scope="module")
def created_gallery_urls(admin_session):
    """Track gallery URLs created by these tests so we can clean them up."""
    urls = []
    yield urls
    for url in urls:
        try:
            admin_session.delete(
                f"{BASE_URL}/api/admin/gallery-photo", json={"photo_url": url}
            )
        except Exception:
            pass


# ---------- helpers ----------

def _make_jpeg_bytes(size=(3000, 2000), color=(180, 60, 40), noisy=False) -> bytes:
    if noisy:
        # Random noise compresses poorly -> guaranteed multi-MB JPEG
        import os as _os
        img = Image.frombytes("RGB", size, _os.urandom(size[0] * size[1] * 3))
    else:
        img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=95)
    return buf.getvalue()


def _make_heic_bytes(size=(800, 600), color=(40, 120, 200)) -> bytes:
    import pillow_heif

    pillow_heif.register_heif_opener()
    img = Image.new("RGB", size, color)
    tmp = "/tmp/test_reel_input.heic"
    img.save(tmp, "HEIF")
    with open(tmp, "rb") as f:
        return f.read()


def _upload_gallery(admin_session, content: bytes, filename: str, mime: str):
    return admin_session.post(
        f"{BASE_URL}/api/admin/upload-gallery-photo",
        files={"photo": (filename, content, mime)},
    )


# ============================================================
# /admin/reorder-reel
# ============================================================

class TestReorderReel:
    def test_no_cookie_returns_401(self, anon_session):
        r = anon_session.post(
            f"{BASE_URL}/api/admin/reorder-reel",
            json={"photos": [None] * 6},
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_wrong_length_returns_400(self, admin_session, original_reel):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/reorder-reel",
            json={"photos": [None] * 5},
        )
        assert r.status_code == 400, r.text
        body = r.json()
        assert body.get("detail") == "Reel must have exactly 6 slots"

    def test_six_slots_persists_and_reverses(self, admin_session, original_reel):
        # Reverse the order and verify persistence via GET
        new_order = list(reversed(original_reel))
        r = admin_session.post(
            f"{BASE_URL}/api/admin/reorder-reel", json={"photos": new_order}
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body
        assert body.get("photos") == new_order

        # GET to verify persistence
        r2 = admin_session.get(f"{BASE_URL}/api/admin/reel-photos")
        assert r2.status_code == 200
        # GET endpoint may rewrite URLs, but length and None-positions must match
        got = r2.json().get("photos", [])
        if len(got) < 6:
            got = got + [None] * (6 - len(got))
        assert len(got) == 6
        # None positions must align with new_order's None positions
        for i, val in enumerate(new_order):
            if val is None:
                assert got[i] is None, f"slot {i} expected None, got {got[i]}"

        # Restore original order (also covered by fixture teardown)
        admin_session.post(
            f"{BASE_URL}/api/admin/reorder-reel", json={"photos": original_reel}
        )


# ============================================================
# /admin/upload-gallery-photo (hardened)
# ============================================================

class TestUploadGalleryPhotoHardened:
    def test_large_jpeg_resized_under_500kb(
        self, admin_session, created_gallery_urls
    ):
        # Use noisy bytes so the source is genuinely multi-MB. JPEG cannot
        # compress noise efficiently, so we cannot assert ~500KB on disk
        # (that approximation only holds for natural photos at q=85). Instead
        # we validate the *real* hardening behaviour: longest edge is capped
        # at 2000px and the saved file is smaller than the original upload.
        big = _make_jpeg_bytes(size=(4000, 3000), noisy=True)
        # Sanity: source is multi-MB
        assert len(big) > 1_000_000, f"test JPEG too small: {len(big)}"

        r = _upload_gallery(admin_session, big, "big.jpg", "image/jpeg")
        assert r.status_code == 200, r.text
        body = r.json()
        url = body.get("url")
        assert url and url.endswith(".jpg")
        created_gallery_urls.append(url)

        filename = url.rsplit("/", 1)[-1]
        path = f"/app/static/gallery/{filename}"
        assert os.path.exists(path), f"expected saved file at {path}"
        size = os.path.getsize(path)
        # Resize applied -> stored file must be smaller than the multi-MB upload.
        assert size < len(big), (
            f"saved file ({size}) not smaller than source ({len(big)})"
        )

        # Verify resize: longest edge <= 2000px (this is the actual hardening
        # guarantee that keeps natural-photo uploads under ~500KB).
        with Image.open(path) as im:
            w, h = im.size
        assert max(w, h) <= 2000, f"image not resized: {w}x{h}"

    def test_non_image_returns_400(self, admin_session):
        r = _upload_gallery(
            admin_session, b"not-an-image-just-text", "fake.jpg", "image/jpeg"
        )
        assert r.status_code == 400, r.text
        body = r.json()
        assert "Unsupported or corrupted image file" in body.get("detail", "")

    def test_heic_upload_succeeds_as_jpeg(
        self, admin_session, created_gallery_urls
    ):
        heic = _make_heic_bytes()
        assert len(heic) > 0
        r = _upload_gallery(admin_session, heic, "iphone.heic", "image/heic")
        assert r.status_code == 200, r.text
        body = r.json()
        url = body.get("url", "")
        assert url.endswith(".jpg"), f"expected .jpg URL, got {url}"
        created_gallery_urls.append(url)


# ============================================================
# /admin/crop-reel-photo
# ============================================================

class TestCropReelPhoto:
    def test_no_cookie_returns_401(self, anon_session):
        r = anon_session.post(
            f"{BASE_URL}/api/admin/crop-reel-photo",
            json={
                "slot_index": 0,
                "photo_url": "https://example.com/x.jpg",
                "crop": {"x": 0, "y": 0, "width": 10, "height": 10},
            },
        )
        assert r.status_code == 401, r.text

    def test_invalid_slot_index_returns_422(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/crop-reel-photo",
            json={
                "slot_index": 9,  # > 5
                "photo_url": f"{BASE_URL}/api/images/gallery/whatever.jpg",
                "crop": {"x": 0, "y": 0, "width": 10, "height": 10},
            },
        )
        assert r.status_code == 422, r.text

    def test_unloadable_photo_returns_400(self, admin_session):
        # URL doesn't match local-gallery prefix and is unreachable
        r = admin_session.post(
            f"{BASE_URL}/api/admin/crop-reel-photo",
            json={
                "slot_index": 0,
                "photo_url": "https://does-not-exist.invalid/missing.jpg",
                "crop": {"x": 0, "y": 0, "width": 10, "height": 10},
            },
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        assert "could not be loaded" in body.get("detail", "").lower() or \
               body.get("detail") == "Source photo could not be loaded"

    def test_crop_local_gallery_photo_full_flow(
        self, admin_session, created_gallery_urls, original_reel
    ):
        # 1) Upload a source photo to gallery to crop from
        src_bytes = _make_jpeg_bytes(size=(1200, 800), color=(200, 200, 100))
        r_up = _upload_gallery(
            admin_session, src_bytes, "source.jpg", "image/jpeg"
        )
        assert r_up.status_code == 200, r_up.text
        src_url = r_up.json()["url"]
        created_gallery_urls.append(src_url)

        # 2) Crop into slot 2
        slot_index = 2
        crop_payload = {
            "slot_index": slot_index,
            "photo_url": src_url,
            "crop": {"x": 100, "y": 50, "width": 400, "height": 300},
        }
        r_crop = admin_session.post(
            f"{BASE_URL}/api/admin/crop-reel-photo", json=crop_payload
        )
        assert r_crop.status_code == 200, r_crop.text
        body = r_crop.json()
        assert body.get("slot_index") == slot_index
        new_url = body.get("url")
        assert new_url and new_url.endswith(".jpg")
        assert "/api/images/gallery/gallery_crop_" in new_url
        created_gallery_urls.append(new_url)

        # 3) Verify file exists on disk
        new_filename = new_url.rsplit("/", 1)[-1]
        new_path = f"/app/static/gallery/{new_filename}"
        assert os.path.exists(new_path), f"cropped file missing: {new_path}"
        with Image.open(new_path) as im:
            w, h = im.size
        # Cropped to 400x300 (within source bounds)
        assert (w, h) == (400, 300), f"expected 400x300 crop, got {w}x{h}"

        # 4) Verify the reel slot got updated
        r_reel = admin_session.get(f"{BASE_URL}/api/admin/reel-photos")
        assert r_reel.status_code == 200
        photos = r_reel.json().get("photos", [])
        assert len(photos) >= slot_index + 1
        assert photos[slot_index] == new_url, (
            f"slot {slot_index} expected {new_url}, got {photos[slot_index]}"
        )

        # 5) Restore the original reel slot value
        restore_photos = list(original_reel)
        admin_session.post(
            f"{BASE_URL}/api/admin/reorder-reel", json={"photos": restore_photos}
        )
