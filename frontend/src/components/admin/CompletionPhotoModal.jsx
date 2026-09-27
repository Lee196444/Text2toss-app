import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// "Complete job with photo" dialog. State + submit logic stay in AdminDashboard.
const CompletionPhotoModal = ({ completionNote, completionPhoto, handleCompletionPhotoUpload, selectedBooking, setCompletionNote, setShowCompletionModal, showCompletionModal, submitCompletion, uploadingPhoto }) => (
  <>
      {showCompletionModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-md mx-2 sm:mx-0">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Complete Job with Photo</CardTitle>
              <CardDescription className="text-sm break-words">
                Upload a photo of completed work for: {selectedBooking.address}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Completion Photo *</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleCompletionPhotoUpload}
                  required
                />
              </div>
              
              {completionPhoto && (
                <div className="space-y-2">
                  <Label>Photo Preview</Label>
                  <img 
                    src={URL.createObjectURL(completionPhoto)} 
                    alt="Completion preview" 
                    className="w-full h-32 object-cover rounded border"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label>Completion Note (Optional)</Label>
                <textarea
                  className="w-full p-2 border rounded-md"
                  rows="3"
                  placeholder="Add any notes about the completed work..."
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                />
              </div>
            </CardContent>
            <div className="flex flex-col sm:flex-row gap-3 p-6 pt-0">
              <Button 
                variant="outline" 
                onClick={() => setShowCompletionModal(false)}
                className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium flex-1"
              >
                <span className="mr-2">✕</span>
                Cancel
              </Button>
              <Button 
                onClick={submitCompletion}
                disabled={!completionPhoto || uploadingPhoto}
                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 text-white px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium flex-1 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? (
                  <>
                    <span className="mr-2 animate-spin">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <span className="mr-2">📸</span>
                    Complete Job
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

  </>
);

export default CompletionPhotoModal;
