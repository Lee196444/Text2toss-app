import React from "react";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";

const RouteOptimizerModal = ({
  open,
  booking,
  routeDirections,
  mapCenter,
  isLoaded,
  formatTime,
  onClose
}) => {
  if (!open || !booking) return null;

  const openExternalMap = (url) => () => {
    const address = encodeURIComponent(booking.address);
    window.open(url(address), "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" data-testid="route-modal">
      <Card className="w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg sm:text-xl">🗺️ Route to Pickup Location</CardTitle>
            <CardDescription className="text-sm break-words">{booking.address}</CardDescription>
          </div>
          <Button
            onClick={onClose}
            data-testid="close-route-modal-btn"
            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white w-full sm:w-auto px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
          >
            <span className="mr-2">✕</span>Close
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Customer:</strong> {booking.phone}</div>
                <div><strong>Time:</strong> {formatTime(booking.pickup_time)}</div>
                <div className="col-span-2">
                  <strong>Items:</strong>{" "}
                  {booking.quote_details?.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                </div>
                {booking.special_instructions && (
                  <div className="col-span-2"><strong>Notes:</strong> {booking.special_instructions}</div>
                )}
              </div>
            </div>

            <div className="h-96 bg-gray-100 rounded-lg overflow-hidden">
              {!GOOGLE_MAPS_API_KEY ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-2">📍 Navigation Options</h3>
                    <p className="text-gray-600 mb-4">Choose your preferred navigation app:</p>
                  </div>
                  <div className="space-y-3 w-full max-w-xs">
                    <Button onClick={openExternalMap((a) => `https://www.google.com/maps/dir/?api=1&destination=${a}`)}
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium">
                      <span className="mr-2">🗺️</span>Google Maps
                    </Button>
                    <Button onClick={openExternalMap((a) => `https://maps.apple.com/?daddr=${a}`)}
                      className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-900 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium">
                      <span className="mr-2">🍎</span>Apple Maps
                    </Button>
                    <Button onClick={openExternalMap((a) => `waze://ul?q=${a}&navigate=yes`)}
                      className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium">
                      <span className="mr-2">🚗</span>Waze
                    </Button>
                  </div>
                  <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                    <p className="text-sm text-yellow-800"><strong>Address:</strong> {booking.address}</p>
                  </div>
                </div>
              ) : isLoaded ? (
                <GoogleMap mapContainerStyle={{ width: "100%", height: "100%" }} center={mapCenter} zoom={13}>
                  {routeDirections && <DirectionsRenderer directions={routeDirections} />}
                </GoogleMap>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p>Loading map...</p>
                  </div>
                </div>
              )}
            </div>

            {routeDirections && (
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">📍 Route Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm text-green-700">
                  <div><strong>Distance:</strong> {routeDirections.routes[0].legs[0].distance.text}</div>
                  <div><strong>Duration:</strong> {routeDirections.routes[0].legs[0].duration.text}</div>
                </div>
                <div className="mt-2">
                  <Button size="sm"
                    onClick={openExternalMap((a) => `https://www.google.com/maps/dir/?api=1&destination=${a}`)}
                    className="bg-green-600 hover:bg-green-700 text-xs"
                  >
                    🚗 Start Navigation
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RouteOptimizerModal;
