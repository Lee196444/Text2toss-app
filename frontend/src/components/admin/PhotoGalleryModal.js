import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const toast = {
  success: (m) => (window.showToast ? window.showToast("success", m) : console.log("SUCCESS:", m)),
  error: (m) => (window.showToast ? window.showToast("error", m) : console.log("ERROR:", m))
};

const PhotoGalleryModal = ({ open, galleryPhotos, reelPhotos, uploadGalleryPhoto, removeGalleryPhoto, updateReelPhoto, setShowPhotoGallery }) => {
  if (!open) return null;
  return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <Card className="w-full max-w-6xl max-h-[95vh] overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  📸 Photo Upload & Management
                </CardTitle>
                <CardDescription className="text-purple-100">
                  Upload photos and manage customer page photo reel (6 slots)
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
            {/* Photo Upload Section */}
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
                    Array.from(e.target.files).forEach(file => uploadGalleryPhoto(file));
                  }}
                  className="hidden"
                  id="photo-upload"
                />
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-lg font-medium">Click to upload photos</p>
                  <p className="text-sm text-gray-500">Supports multiple image files</p>
                </label>
              </div>
            </div>

            {/* Photo Reel Slots */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🎭 Customer Page Photo Reel (6 Slots)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {reelPhotos.map((photo, index) => (
                  <div key={`reel-slot-${index}`} className="border rounded-lg p-2 bg-gray-50">
                    <div className="text-center text-sm font-medium mb-2">Slot {index + 1}</div>
                    {photo ? (
                      <div className="relative">
                        <img src={photo} alt={`Reel ${index + 1}`} className="w-full h-24 object-cover rounded" />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateReelPhoto(index, null)}
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-xs"
                        >
                          ×
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                        Empty
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Gallery Photos */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                🖼️ Gallery Photos (Click to add to reel)
              </h3>
              {galleryPhotos.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">📷</div>
                  <p>No gallery photos uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {galleryPhotos.map((photo, index) => (
                    <div key={`gallery-${photo.substring(photo.lastIndexOf('/') + 1, photo.lastIndexOf('/') + 12)}-${index}`} className="relative group">
                      <img 
                        src={photo} 
                        alt={`Gallery ${index + 1}`} 
                        className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-75 transition-opacity"
                        onClick={() => {
                          // Find first empty slot
                          const emptyIndex = reelPhotos.findIndex(slot => slot === null);
                          if (emptyIndex !== -1) {
                            updateReelPhoto(emptyIndex, photo);
                          } else {
                            toast.error('All photo reel slots are full');
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
  );
};

export default PhotoGalleryModal;
