import React, { useState, useEffect } from "react";
import axios from "axios";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ""; // Set this in .env file

const AdminDashboard = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyBookings, setDailyBookings] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState({});
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
  const [directions, setDirections] = useState(null);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [completionPhoto, setCompletionPhoto] = useState(null);
  const [completionNote, setCompletionNote] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedBin, setSelectedBin] = useState(null);
  const [binBookings, setBinBookings] = useState([]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: ['geometry'],
    onLoad: () => console.log('Google Maps loaded successfully'),
    onError: (error) => console.error('Google Maps load error:', error)
  });

  useEffect(() => {
    fetchDailySchedule();
    fetchWeeklySchedule();
  }, [selectedDate]);

  const fetchDailySchedule = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/admin/daily-schedule?date=${selectedDate}`);
      setDailyBookings(response.data);
      
      // Set map center to first booking location if available
      if (response.data.length > 0 && response.data[0].address) {
        geocodeAddress(response.data[0].address);
      }
    } catch (error) {
      toast.error("Failed to fetch daily schedule");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchWeeklySchedule = async () => {
    try {
      const startOfWeek = getStartOfWeek(new Date(selectedDate));
      const response = await axios.get(`${API}/admin/weekly-schedule?start_date=${startOfWeek}`);
      setWeeklySchedule(response.data);
    } catch (error) {
      toast.error("Failed to fetch weekly schedule");
      console.error(error);
    }
  };

  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  };

  const geocodeAddress = async (address) => {
    if (!isLoaded || !window.google) return;
    
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const location = results[0].geometry.location;
        setMapCenter({ lat: location.lat(), lng: location.lng() });
      }
    });
  };

  const cleanupTempImages = async () => {
    try {
      const response = await axios.post(`${API}/admin/cleanup-temp-images`);
      toast.success(response.data.message);
    } catch (error) {
      toast.error("Failed to cleanup temporary images");
    }
  };

  const calculateOptimalRoute = async () => {
    if (dailyBookings.length < 2) {
      toast.error("Need at least 2 bookings to calculate route");
      return;
    }

    if (!GOOGLE_MAPS_API_KEY || !isLoaded || !window.google) {
      // Simple fallback: sort by time
      const timeOrdered = [...dailyBookings].sort((a, b) => {
        const timeA = a.pickup_time.split('-')[0].replace(':', '');
        const timeB = b.pickup_time.split('-')[0].replace(':', '');
        return timeA.localeCompare(timeB);
      });
      
      setOptimizedRoute(timeOrdered);
      toast.success("Route optimized by pickup time (Google Maps not available)");
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    const addresses = dailyBookings.map(booking => booking.address);

    // Use first address as start, last as end, others as waypoints
    const origin = addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(1, -1).map(address => ({
      location: address,
      stopover: true
    }));

    try {
      const result = await new Promise((resolve, reject) => {
        directionsService.route({
          origin,
          destination,
          waypoints,
          optimizeWaypoints: true,
          travelMode: window.google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK') {
            resolve(result);
          } else {
            reject(status);
          }
        });
      });

      setDirections(result);
      
      // Get optimized order
      const optimizedOrder = result.routes[0].waypoint_order;
      const optimizedBookings = [
        dailyBookings[0], // Start
        ...optimizedOrder.map(index => dailyBookings[index + 1]),
        dailyBookings[dailyBookings.length - 1] // End (if different from start)
      ];

      setOptimizedRoute(optimizedBookings);
      toast.success("Optimal route calculated with Google Maps!");

    } catch (error) {
      toast.error("Failed to calculate route");
      console.error(error);
      
      // Fallback to time-based sorting
      const timeOrdered = [...dailyBookings].sort((a, b) => {
        const timeA = a.pickup_time.split('-')[0].replace(':', '');
        const timeB = b.pickup_time.split('-')[0].replace(':', '');
        return timeA.localeCompare(timeB);
      });
      
      setOptimizedRoute(timeOrdered);
      toast.success("Route optimized by pickup time (fallback)");
    }
  };

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      await axios.patch(`${API}/admin/bookings/${bookingId}`, { status: newStatus });
      fetchDailySchedule(); // Refresh data
      toast.success("Booking status updated");
    } catch (error) {
      toast.error("Failed to update booking status");
    }
  };

  const handleCompleteWithPhoto = (booking) => {
    setSelectedBooking(booking);
    setShowCompletionModal(true);
    setCompletionNote("");
    setCompletionPhoto(null);
  };

  const handleCompletionPhotoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCompletionPhoto(file);
    }
  };

  const submitCompletion = async () => {
    if (!completionPhoto) {
      toast.error("Please select a completion photo");
      return;
    }

    setUploadingPhoto(true);
    try {
      // First mark as completed
      await updateBookingStatus(selectedBooking.id, 'completed');

      // Upload completion photo
      const formData = new FormData();
      formData.append('file', completionPhoto);
      formData.append('completion_note', completionNote);

      await axios.post(`${API}/admin/bookings/${selectedBooking.id}/completion`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success("Job completed with photo!");
      setShowCompletionModal(false);
      fetchDailySchedule();
    } catch (error) {
      toast.error("Failed to upload completion photo");
    }
    setUploadingPhoto(false);
  };

  const notifyCustomer = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/admin/bookings/${bookingId}/notify-customer`);
      toast.success("SMS sent to customer with completion photo!");
      console.log("SMS Result:", response.data);
    } catch (error) {
      toast.error("Failed to send SMS to customer");
      console.error("SMS Error:", error);
    }
  };

  const testSmsPhoto = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/admin/test-sms-photo/${bookingId}`);
      toast.success(`SMS photo test completed! Check console for details.`);
      console.log("SMS Photo Test Result:", response.data);
    } catch (error) {
      toast.error("SMS photo test failed");
      console.error("SMS Photo Test Error:", error);
    }
  };

  const testSmsSetup = async () => {
    try {
      const response = await axios.post(`${API}/admin/test-sms`);
      if (response.data.configured) {
        toast.success("SMS is configured and ready!");
      } else {
        toast.error("SMS not configured - check Twilio credentials");
      }
    } catch (error) {
      toast.error("Failed to test SMS setup");
    }
  };

  const formatTime = (timeRange) => {
    return timeRange;
  };

  const formatPrice = (price) => {
    return `$${price?.toFixed(2) || '0.00'}`;
  };

  // Categorize bookings into bins
  const categorizBookings = () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const bins = {
      new: [],      // scheduled for today
      upcoming: [], // scheduled for future dates
      inProgress: [], // currently in progress
      completed: []   // completed jobs
    };

    dailyBookings.forEach(booking => {
      const bookingDate = booking.pickup_date ? booking.pickup_date.split('T')[0] : '';
      
      if (booking.status === 'completed') {
        bins.completed.push(booking);
      } else if (booking.status === 'in_progress') {
        bins.inProgress.push(booking);
      } else if (booking.status === 'scheduled') {
        if (bookingDate === today) {
          bins.new.push(booking);
        } else if (bookingDate > today) {
          bins.upcoming.push(booking);
        } else {
          bins.new.push(booking); // Past due, show in new
        }
      }
    });

    return bins;
  };

  const openBin = (binType) => {
    const bins = categorizBookings();
    setBinBookings(bins[binType] || []);
    setSelectedBin(binType);
  };

  const closeBin = () => {
    setSelectedBin(null);
    setBinBookings([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-gray-200">Manage daily pickups and optimize routes</p>
          </div>
          <div className="flex items-center space-x-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto"
            />
            <Button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
              Today
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-emerald-600">{dailyBookings.length}</div>
              <p className="text-sm text-gray-700">Today's Pickups</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-teal-600">
                {formatPrice(dailyBookings.reduce((sum, booking) => sum + (booking.quote_details?.total_price || 0), 0))}
              </div>
              <p className="text-sm text-gray-700">Daily Revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-blue-600">
                {Object.keys(weeklySchedule).length}
              </div>
              <p className="text-sm text-gray-700">Active Days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-purple-600">
                {dailyBookings.filter(b => b.status === 'completed').length}
              </div>
              <p className="text-sm text-gray-700">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Daily Schedule
                <div className="flex space-x-2">
                  <Button onClick={testSmsSetup} size="sm" variant="outline" className="text-xs">
                    📱 Test SMS
                  </Button>
                  <Button onClick={cleanupTempImages} size="sm" variant="outline" className="text-xs">
                    🗑️ Cleanup
                  </Button>
                  <Button onClick={calculateOptimalRoute} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    Optimize Route
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                Pickups for {new Date(selectedDate).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="text-center py-4">Loading...</div>
              ) : dailyBookings.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No pickups scheduled for this date</div>
              ) : (
                (optimizedRoute || dailyBookings).map((booking, index) => (
                  <div key={booking.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant={optimizedRoute ? "default" : "secondary"}>
                          {optimizedRoute ? `Stop ${index + 1}` : formatTime(booking.pickup_time)}
                        </Badge>
                        <Badge 
                          variant={
                            booking.status === 'completed' ? 'success' : 
                            booking.status === 'in_progress' ? 'warning' : 
                            'default'
                          }
                        >
                          {booking.status}
                        </Badge>
                        {booking.image_path && (
                          <Badge variant="outline" className="text-blue-600">
                            📸 Has Photo
                          </Badge>
                        )}
                        {booking.status !== 'scheduled' && (
                          <Badge variant="outline" className="text-green-600">
                            📱 SMS Sent
                          </Badge>
                        )}
                      </div>
                      <span className="font-semibold text-emerald-600">
                        {formatPrice(booking.quote_details?.total_price)}
                      </span>
                    </div>
                    
                    {/* Customer Image Section */}
                    {booking.image_path && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-800 mb-2">📸 Customer Photo:</p>
                        <img 
                          src={`${API}/admin/booking-image/${booking.id}`}
                          alt="Items to pickup"
                          className="w-full max-w-xs h-32 object-cover rounded border"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    <div className="text-sm">
                      <p className="font-medium">{booking.address}</p>
                      <p className="text-gray-600">Phone: {booking.phone}</p>
                      {booking.quote_details && (
                        <p className="text-gray-600">
                          Items: {booking.quote_details.items.map(item => 
                            `${item.quantity}x ${item.name}`
                          ).join(', ')}
                        </p>
                      )}
                      {booking.special_instructions && (
                        <p className="text-gray-600">Note: {booking.special_instructions}</p>
                      )}
                    </div>
                    {/* Completion Photo Section */}
                    {booking.completion_photo_path && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-green-800 mb-2">📸 Completion Photo:</p>
                        <div className="flex items-start gap-3">
                          <img 
                            src={`${API}/admin/completion-photo/${booking.id}`}
                            alt="Completed job"
                            className="w-24 h-24 object-cover rounded border"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div className="flex-1">
                            {booking.completion_note && (
                              <p className="text-sm text-green-700">Note: {booking.completion_note}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => notifyCustomer(booking.id)}
                                className="text-xs"
                              >
                                📱 Send SMS + Photo
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => testSmsPhoto(booking.id)}
                                className="text-xs bg-blue-50 border-blue-200 text-blue-700"
                              >
                                🧪 Test SMS
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex space-x-2 flex-wrap gap-1">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                        disabled={booking.status !== 'scheduled'}
                      >
                        Start
                      </Button>
                      
                      {booking.status === 'in_progress' && (
                        <>
                          <Button 
                            size="sm" 
                            onClick={() => updateBookingStatus(booking.id, 'completed')}
                            className="bg-gray-600 hover:bg-gray-700"
                          >
                            Complete (No Photo)
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={() => handleCompleteWithPhoto(booking)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            📸 Complete + Photo
                          </Button>
                        </>
                      )}
                      
                      {booking.status === 'completed' && !booking.completion_photo_path && (
                        <Button 
                          size="sm" 
                          onClick={() => handleCompleteWithPhoto(booking)}
                          variant="outline"
                          className="border-green-500 text-green-700 hover:bg-green-50"
                        >
                          📸 Add Completion Photo
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Map */}
          <Card>
            <CardHeader>
              <CardTitle>Route Map</CardTitle>
              <CardDescription>
                {dailyBookings.length > 0 ? 
                  `${dailyBookings.length} pickup locations` : 
                  'No pickups to display'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!GOOGLE_MAPS_API_KEY ? (
                <div className="flex flex-col items-center justify-center h-96 bg-gray-100 rounded-lg p-6">
                  <div className="text-gray-600 text-center">
                    <h3 className="text-lg font-semibold mb-2">📍 Map View</h3>
                    <p className="mb-4">Google Maps API key not configured</p>
                    <div className="space-y-2">
                      {dailyBookings.map((booking, index) => (
                        <div key={booking.id} className="bg-white p-3 rounded border text-left">
                          <div className="font-medium">Stop {index + 1}: {formatTime(booking.pickup_time)}</div>
                          <div className="text-sm text-gray-600">{booking.address}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : loadError ? (
                <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg">
                  <div className="text-red-600 text-center">
                    <h3 className="text-lg font-semibold mb-2">❌ Map Load Error</h3>
                    <p>Failed to load Google Maps</p>
                  </div>
                </div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '400px' }}
                  center={mapCenter}
                  zoom={12}
                >
                  {dailyBookings.map((booking, index) => (
                    <Marker
                      key={booking.id}
                      position={{ lat: 40.7128 + (index * 0.01), lng: -74.0060 + (index * 0.01) }}
                      title={`${booking.address} - ${formatTime(booking.pickup_time)}`}
                      label={String(index + 1)}
                    />
                  ))}
                  {directions && <DirectionsRenderer directions={directions} />}
                </GoogleMap>
              ) : (
                <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
                  Loading Map...
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Overview</CardTitle>
            <CardDescription>Bookings for the current week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-4">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => {
                const date = new Date(getStartOfWeek(new Date(selectedDate)));
                date.setDate(date.getDate() + index);
                const dateKey = date.toISOString().split('T')[0];
                const dayBookings = weeklySchedule[dateKey] || [];

                return (
                  <div key={day} className="border rounded-lg p-3">
                    <h4 className="font-semibold text-sm mb-2">{day}</h4>
                    <p className="text-xs text-gray-500 mb-2">{date.toLocaleDateString()}</p>
                    <div className="space-y-1">
                      {dayBookings.length === 0 ? (
                        <p className="text-xs text-gray-400">No pickups</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium">{dayBookings.length} pickups</p>
                          <p className="text-xs text-emerald-600">
                            {formatPrice(dayBookings.reduce((sum, b) => sum + (b.quote_details?.total_price || 0), 0))}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion Photo Modal */}
      {showCompletionModal && selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Complete Job with Photo</CardTitle>
              <CardDescription>
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
            <div className="flex justify-between p-6 pt-0">
              <Button 
                variant="outline" 
                onClick={() => setShowCompletionModal(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={submitCompletion}
                disabled={!completionPhoto || uploadingPhoto}
                className="bg-green-600 hover:bg-green-700"
              >
                {uploadingPhoto ? "Uploading..." : "Complete Job"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;