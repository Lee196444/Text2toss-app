import React, { useCallback, useState } from "react";
import axiosBase from "axios";
import Cropper from "react-easy-crop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { toast } from "../../lib/toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Admin endpoints require the httpOnly admin_session cookie — use a
// credentialed instance instead of polluting axios.defaults.
const axios = axiosBase.create({ withCredentials: true });

const SlotCard = ({
  index, photo,
  isDragOver, isDragging,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onClear, onCrop
}) => (
  <div
    draggable={!!photo}
    onDragStart={(e) => onDragStart(e, index)}
    onDragOver={(e) => onDragOver(e, index)}
    onDragLeave={onDragLeave}
    onDrop={(e) => onDrop(e, index)}
    onDragEnd={onDragEnd}
    data-testid={`reel-slot-${index}`}
    className={`border rounded-lg p-2 bg-gray-50 transition-all ${
      isDragOver ? "ring-2 ring-purple-500 bg-purple-50" : ""
    } ${isDragging ? "opacity-40" : ""} ${photo ? "cursor-grab active:cursor-grabbing" : ""}`}
  >
    <div className="flex items-center justify-between mb-2 px-1">
      <span className="text-sm font-medium">Slot {index + 1}</span>
      {photo && <span className="text-[10px] text-gray-400 select-none">⠿ drag</span>}
    </div>
    {photo ? (
      <div className="relative">
        <img src={photo} alt={`Reel ${index + 1}`} className="w-full h-24 object-cover rounded pointer-events-none" />
        <Button
          size="sm"
          onClick={() => onCrop(index, photo)}
          data-testid={`crop-slot-${index}-btn`}
          className="absolute bottom-1 left-1 h-6 px-2 text-xs bg-black/70 hover:bg-black/85 text-white border-0"
        >
          ✂️ Crop
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onClear(index)}
          data-testid={`clear-slot-${index}-btn`}
          className="absolute top-1 right-1 h-6 w-6 p-0 text-xs"
        >
          ×
        </Button>
      </div>
    ) : (
      <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-sm">
        Drop here / Empty
      </div>
    )}
  </div>
);

const CropDialog = ({ open, slotIndex, photoUrl, onCancel, onSaved }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) {
      toast.error("Adjust the crop area first");
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/admin/crop-reel-photo`, {
        slot_index: slotIndex,
        photo_url: photoUrl,
        crop: {
          x: Math.round(croppedAreaPixels.x),
          y: Math.round(croppedAreaPixels.y),
          width: Math.round(croppedAreaPixels.width),
          height: Math.round(croppedAreaPixels.height)
        }
      });
      toast.success(`Slot ${slotIndex + 1} cropped`);
      onSaved(data.url);
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message;
      toast.error(`Crop failed: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[10000] flex items-center justify-center p-4" data-testid="crop-dialog">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-lg">✂️ Crop Slot {slotIndex + 1}</h4>
            <p className="text-purple-100 text-xs">Drag to reposition · pinch / scroll to zoom</p>
          </div>
          <Button onClick={onCancel} className="bg-white/20 hover:bg-white/30 text-white border-0" size="sm">
            ✕ Close
          </Button>
        </div>
        <div className="relative w-full bg-black" style={{ height: 460 }}>
          <Cropper
            image={photoUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
          />
        </div>
        <div className="p-4 flex items-center gap-3 bg-gray-50">
          <label className="text-sm font-medium text-gray-700">Zoom</label>
          <input
            type="range" min={1} max={4} step={0.05} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            data-testid="crop-zoom-slider"
            className="flex-1 accent-purple-600"
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="crop-save-btn"
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5"
          >
            {saving ? "Saving…" : "💾 Save crop"}
          </Button>
          <Button onClick={onCancel} className="bg-white border border-gray-300 text-gray-700">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

const PhotoGalleryModal = ({
  open,
  galleryPhotos,
  reelPhotos,
  uploadGalleryPhoto,
  removeGalleryPhoto,
  updateReelPhoto,
  setShowPhotoGallery
}) => {
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);  // { slot, url }

  if (!open) return null;

  const persistReelOrder = async (photos) => {
    setSavingOrder(true);
    try {
      await axios.post(`${API}/admin/reorder-reel`, { photos });
      // Best-effort UI refresh — sibling fetcher will pick up new order
      toast.success("Reel order saved");
      // Trigger a fetch by calling updateReelPhoto with same data on first occupied slot
      // (the parent useEffect refreshes it on showPhotoGallery change). We just dispatch a custom event:
      window.dispatchEvent(new CustomEvent("reel:reordered"));
    } catch {
      toast.error("Could not save new order");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDragStart = (e, index) => {
    if (!reelPhotos[index]) { e.preventDefault(); return; }
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggingIndex !== null && draggingIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => setDragOverIndex(null);

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const sourceIndex = Number(e.dataTransfer.getData("text/plain"));
    setDragOverIndex(null);
    setDraggingIndex(null);
    if (Number.isNaN(sourceIndex) || sourceIndex === targetIndex) return;
    const next = [...reelPhotos];
    const tmp = next[sourceIndex];
    next[sourceIndex] = next[targetIndex];
    next[targetIndex] = tmp;
    // Optimistic — parent's reel state will re-sync after persistReelOrder completes
    persistReelOrder(next);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl max-h-[95vh] overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  📸 Photo Upload & Management
                </CardTitle>
                <CardDescription className="text-purple-100">
                  Upload, drag-to-reorder, and crop the 6 customer-page reel slots
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                onClick={() => setShowPhotoGallery(false)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0 rounded-full"
              >
                ×
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
            {/* Upload */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                📤 Upload New Photos
              </h3>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    Array.from(e.target.files).forEach((file) => uploadGalleryPhoto(file));
                    e.target.value = "";
                  }}
                  className="hidden"
                  id="photo-upload"
                />
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-lg font-medium">Click to upload photos</p>
                  <p className="text-sm text-gray-500">Supports JPEG, PNG, HEIC (iPhone)</p>
                </label>
              </div>
            </div>

            {/* Reel Slots */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  🎭 Customer Page Photo Reel (6 Slots)
                </h3>
                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded">
                  {savingOrder ? "Saving order…" : "Drag any slot to reorder · ✂️ to crop"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {reelPhotos.map((photo, index) => (
                  <SlotCard
                    key={`reel-slot-${index}`}
                    index={index}
                    photo={photo}
                    isDragOver={dragOverIndex === index}
                    isDragging={draggingIndex === index}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onClear={(i) => updateReelPhoto(i, null)}
                    onCrop={(i, url) => setCropTarget({ slot: i, url })}
                  />
                ))}
              </div>
            </div>

            {/* Gallery */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🖼️ Gallery Photos (Click to add to first empty reel slot)
              </h3>
              {galleryPhotos.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">📷</div>
                  <p>No gallery photos uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {galleryPhotos.map((photo, index) => (
                    <div
                      key={`gallery-${photo.substring(photo.lastIndexOf("/") + 1, photo.lastIndexOf("/") + 12)}-${index}`}
                      className="relative group"
                    >
                      <img
                        src={photo}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-75 transition-opacity"
                        onClick={() => {
                          const emptyIndex = reelPhotos.findIndex((slot) => slot === null);
                          if (emptyIndex !== -1) {
                            updateReelPhoto(emptyIndex, photo);
                          } else {
                            toast.error("All photo reel slots are full");
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeGalleryPhoto(photo)}
                        className="absolute top-1 right-1 h-6 w-6 p-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        🗑️
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <CropDialog
        open={!!cropTarget}
        slotIndex={cropTarget?.slot}
        photoUrl={cropTarget?.url}
        onCancel={() => setCropTarget(null)}
        onSaved={(newUrl) => {
          // Reflect the new URL immediately by writing through updateReelPhoto
          updateReelPhoto(cropTarget.slot, newUrl);
          setCropTarget(null);
        }}
      />
    </>
  );
};

export default PhotoGalleryModal;
