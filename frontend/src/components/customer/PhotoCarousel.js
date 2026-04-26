import React from "react";
import { toast } from "../../lib/toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Photo Carousel Component
const PhotoCarousel = ({ photos, currentIndex, onIndexChange }) => {
  const validPhotos = photos.filter(photo => photo !== null);
  
  if (validPhotos.length === 0) {
    return (
      <div className="bg-gray-100 rounded-2xl w-full aspect-[4/3] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <p className="text-sm font-medium">Recent work photos</p>
        </div>
      </div>
    );
  }

  const handleDotClick = (index) => {
    const validIndices = photos.map((photo, idx) => photo !== null ? idx : -1).filter(idx => idx !== -1);
    onIndexChange(validIndices[index]);
  };

  return (
    <div className="relative">
      <div className="photo-carousel rounded-2xl shadow-xl overflow-hidden bg-gray-100">
        <img 
          src={photos[currentIndex]}
          alt={`Text2toss job ${currentIndex + 1}`}
          className="w-full aspect-[4/3] object-cover"
        />
        
        {/* Counter */}
        <div className="absolute top-4 right-4 bg-black/50 text-white px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
          {photos.findIndex((_, idx) => idx === currentIndex && photos[idx] !== null) + 1} / {validPhotos.length}
        </div>
        
        {/* Dots */}
        {validPhotos.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {validPhotos.map((_, index) => {
              const validIndices = photos.map((photo, idx) => photo !== null ? idx : -1).filter(idx => idx !== -1);
              const isActive = validIndices[index] === currentIndex;
              return (
                <button
                  key={`dot-${index}`}
                  onClick={() => handleDotClick(index)}
                  className={`w-2 h-2 rounded-full transition-all ${isActive ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/70'}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoCarousel;
