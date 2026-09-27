import { useState, useCallback } from "react";
import axiosBase from "axios";
import { toast } from "../../lib/toast";
import { logger } from "../../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const axios = axiosBase.create({ withCredentials: true });

// Customer-page photo gallery + 10-slot reel management (moved verbatim out of AdminDashboard).
export default function useGalleryReel() {
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [reelPhotos, setReelPhotos] = useState(Array(10).fill(null));
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);

  const fetchGalleryPhotos = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/gallery-photos`);
      
      // Backend now returns full URLs
      setGalleryPhotos(response.data);
    } catch (error) {
      logger.error('Failed to fetch gallery photos:', error);
      toast.error('Failed to load gallery photos');
    }
  }, []);

  const fetchReelPhotos = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/reel-photos`);
      
      // Backend now returns full URLs
      // Pad legacy 6-slot reels up to 10 so the UI always renders 10 boxes
      const photos = response.data.photos || [];
      const padded = photos.length < 10 ? [...photos, ...Array(10 - photos.length).fill(null)] : photos.slice(0, 10);
      setReelPhotos(padded.length ? padded : Array(10).fill(null));
    } catch (error) {
      logger.error('Failed to fetch reel photos:', error);
      toast.error('Failed to load photo reel');
    }
  }, []);

  const uploadGalleryPhoto = async (file) => {
    // Validate basic constraints up front so the user gets immediate feedback
    if (!file) return;
    const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || "");
    if (!isImage) {
      toast.error(`"${file.name || "file"}" is not an image — skipped`);
      return;
    }
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap (the backend also resizes)
    if (file.size > MAX_BYTES) {
      toast.error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — must be under 25 MB`);
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    setUploadingGalleryPhoto(true);
    try {
      await axios.post(`${API}/admin/upload-gallery-photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000
      });
      toast.success(`Uploaded: ${file.name}`);
      fetchGalleryPhotos();
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.message || "Unknown error";
      toast.error(`Upload failed: ${detail}`);
    } finally {
      setUploadingGalleryPhoto(false);
    }
  };

  const updateReelPhoto = async (slotIndex, photoUrl) => {
    try {
      await axios.post(`${API}/admin/update-reel-photo`, {
        slot_index: slotIndex,
        photo_url: photoUrl
      });
      toast.success(`Photo updated in slot ${slotIndex + 1}`);
      fetchReelPhotos();
    } catch (error) {
      toast.error('Failed to update photo reel');
    }
  };

  const removeGalleryPhoto = async (photoUrl) => {
    try {
      await axios.delete(`${API}/admin/gallery-photo`, {
        data: { photo_url: photoUrl }
      });
      toast.success('Photo removed from gallery');
      fetchGalleryPhotos();
    } catch (error) {
      toast.error('Failed to remove photo');
    }
  };

  return { galleryPhotos, reelPhotos, uploadingGalleryPhoto, fetchGalleryPhotos, fetchReelPhotos, uploadGalleryPhoto, updateReelPhoto, removeGalleryPhoto };
}
