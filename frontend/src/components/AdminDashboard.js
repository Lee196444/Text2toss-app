import React, { useState, useEffect } from "react";
import axios from "axios";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
// Use global toast function as fallback
const toast = {
  success: (message) => window.showToast ? window.showToast('success', message) : console.log('SUCCESS:', message),
  error: (message) => window.showToast ? window.showToast('error', message) : console.log('ERROR:', message)
};

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
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedRouteBooking, setSelectedRouteBooking] = useState(null);
  const [routeDirections, setRouteDirections] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarData, setCalendarData] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
      if (!GOOGLE_MAPS_API_KEY) {
        toast.success("Route sorted by pickup time (Add Google Maps API key for optimal routing)");
      } else {
        toast.success("Route optimized by pickup time (Google Maps not available)");
      }
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

  const startRoute = async (booking) => {
    setSelectedRouteBooking(booking);
    setShowRouteModal(true);
    
    if (!GOOGLE_MAPS_API_KEY || !isLoaded || !window.google) {
      // Fallback: Open in default maps app
      const address = encodeURIComponent(booking.address);
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}&travelmode=driving`;
      window.open(mapsUrl, '_blank');
      toast.success("Opening route in Google Maps");
      return;
    }

    try {
      // Get user's current location
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const origin = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          const directionsService = new window.google.maps.DirectionsService();
          
          const result = await new Promise((resolve, reject) => {
            directionsService.route({
              origin: origin,
              destination: booking.address,
              travelMode: window.google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
              avoidTolls: false,
              avoidHighways: false
            }, (result, status) => {
              if (status === 'OK') {
                resolve(result);
              } else {
                reject(status);
              }
            });
          });

          setRouteDirections(result);
          
          // Also provide option to open in phone's maps app
          const address = encodeURIComponent(booking.address);
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}&travelmode=driving`;
          
          toast.success(
            <div>
              Route calculated! 
              <button 
                onClick={() => window.open(mapsUrl, '_blank')} 
                className="ml-2 underline text-blue-600"
              >
                Open in Phone Maps
              </button>
            </div>
          );

        },
        (error) => {
          // Fallback if location access denied
          const address = encodeURIComponent(booking.address);
          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}&travelmode=driving`;
          window.open(mapsUrl, '_blank');
          toast.success("Opening route in Google Maps");
        }
      );

    } catch (error) {
      console.error('Route calculation error:', error);
      toast.error("Failed to calculate route");
      
      // Fallback
      const address = encodeURIComponent(booking.address);
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}&travelmode=driving`;
      window.open(mapsUrl, '_blank');
    }
  };

  const closeRouteModal = () => {
    setShowRouteModal(false);
    setSelectedRouteBooking(null);
    setRouteDirections(null);
  };

  const fetchCalendarData = async (month = currentMonth) => {
    try {
      // Get first and last day of the month
      const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
      const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];
      
      const response = await axios.get(`${API}/admin/calendar-data?start_date=${startDate}&end_date=${endDate}`);
      setCalendarData(response.data);
    } catch (error) {
      toast.error("Failed to fetch calendar data");
      console.error(error);
    }
  };

  const openCalendar = () => {
    setShowCalendar(true);
    fetchCalendarData();
  };

  const closeCalendar = () => {
    setShowCalendar(false);
  };

  const changeMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
    fetchCalendarData(newMonth);
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfWeek = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatCalendarDate = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-gray-200 text-sm sm:text-base">Manage daily pickups and optimize routes</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto text-sm"
            />
            <Button 
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              size="sm"
              className="w-full sm:w-auto"
            >
              Today
            </Button>
          </div>
        </div>

        {/* Job Bins */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {(() => {
            const bins = categorizBookings();
            const binConfigs = [
              { 
                type: 'new', 
                title: 'New Jobs', 
                icon: '📅', 
                color: 'border-blue-300 bg-blue-50 hover:bg-blue-100',
                textColor: 'text-blue-800',
                countColor: 'text-blue-600'
              },
              { 
                type: 'upcoming', 
                title: 'Upcoming', 
                icon: '📅', 
                color: 'border-orange-300 bg-orange-50 hover:bg-orange-100',
                textColor: 'text-orange-800',
                countColor: 'text-orange-600'
              },
              { 
                type: 'inProgress', 
                title: 'In Progress', 
                icon: '🚛', 
                color: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100',
                textColor: 'text-yellow-800',
                countColor: 'text-yellow-600'
              },
              { 
                type: 'completed', 
                title: 'Completed', 
                icon: '✅', 
                color: 'border-green-300 bg-green-50 hover:bg-green-100',
                textColor: 'text-green-800',
                countColor: 'text-green-600'
              }
            ];

            return binConfigs.map(bin => (
              <Card 
                key={bin.type}
                className={`cursor-pointer transition-all duration-200 ${bin.color} border-2 hover:shadow-lg transform hover:scale-105`}
                onClick={() => {
                  // Open calendar for NEW jobs, regular bin view for others
                  if (bin.type === 'new') {
                    openCalendar();
                  } else {
                    openBin(bin.type);
                  }
                }}
              >
                <CardContent className="p-6 text-center">
                  <div className="text-4xl mb-3">{bin.icon}</div>
                  <div className={`text-3xl font-bold mb-2 ${bin.countColor}`}>
                    {bins[bin.type].length}
                  </div>
                  <p className={`text-sm font-medium ${bin.textColor}`}>{bin.title}</p>
                  {bins[bin.type].length > 0 && (
                    <div className={`text-xs mt-2 ${bin.textColor}`}>
                      Revenue: {formatPrice(bins[bin.type].reduce((sum, booking) => sum + (booking.quote_details?.total_price || 0), 0))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ));
          })()}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Button onClick={openCalendar} size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm">
            📅 Calendar
          </Button>
          <Button onClick={testSmsSetup} size="sm" variant="outline" className="text-xs">
            📱 SMS
          </Button>
          <Button onClick={cleanupTempImages} size="sm" variant="outline" className="text-xs">
            🗑️ Cleanup
          </Button>
          <Button onClick={calculateOptimalRoute} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm">
            🗺️ Route
          </Button>
        </div>

        {/* Instructions */}
        <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold text-emerald-800 mb-2">📋 How to Use Job Bins</h3>
            <p className="text-emerald-700">
              Click on any colored bin above to view and manage jobs in that category. 
              Each bin shows the count and total revenue for easy tracking.
            </p>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Summary</CardTitle>
            <CardDescription>Overview for {new Date(selectedDate).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-center">
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div className="text-xl sm:text-2xl font-bold text-gray-700">{dailyBookings.length}</div>
                <div className="text-xs sm:text-sm text-gray-600">Total Jobs</div>
              </div>
              <div className="p-3 sm:p-4 bg-emerald-50 rounded-lg">
                <div className="text-xl sm:text-2xl font-bold text-emerald-600">
                  {formatPrice(dailyBookings.reduce((sum, booking) => sum + (booking.quote_details?.total_price || 0), 0))}
                </div>
                <div className="text-xs sm:text-sm text-emerald-700">Daily Revenue</div>
              </div>
              <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                <div className="text-xl sm:text-2xl font-bold text-blue-600">
                  {dailyBookings.filter(b => b.image_path).length}
                </div>
                <div className="text-xs sm:text-sm text-blue-700">With Photos</div>
              </div>
              <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                <div className="text-xl sm:text-2xl font-bold text-green-600">
                  {dailyBookings.filter(b => b.completion_photo_path).length}
                </div>
                <div className="text-xs sm:text-sm text-green-700">Completed w/Photo</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bin View Modal */}
      {selectedBin && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
              <div>
                <CardTitle className="text-lg sm:text-2xl flex items-center gap-2">
                  {selectedBin === 'new' && '🆕 New Jobs'}
                  {selectedBin === 'upcoming' && '📅 Upcoming Jobs'}
                  {selectedBin === 'inProgress' && '🚛 Jobs In Progress'}
                  {selectedBin === 'completed' && '✅ Completed Jobs'}
                  <span className="text-sm font-normal">({binBookings.length})</span>
                </CardTitle>
                <CardDescription className="text-sm">
                  Total Revenue: {formatPrice(binBookings.reduce((sum, booking) => sum + (booking.quote_details?.total_price || 0), 0))}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={closeBin} className="text-gray-600 w-full sm:w-auto">
                ✕ Close
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[70vh]">
              {binBookings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No jobs in this category
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {binBookings.map((booking, index) => (
                    <div key={booking.id} className="border rounded-lg p-3 sm:p-4 space-y-3 bg-white shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                          <Badge variant="secondary" className="text-xs">#{index + 1}</Badge>
                          <Badge variant="secondary" className="text-xs">{formatTime(booking.pickup_time)}</Badge>
                          <Badge 
                            variant={
                              booking.status === 'completed' ? 'success' : 
                              booking.status === 'in_progress' ? 'warning' : 
                              'default'
                            }
                            className="text-xs"
                          >
                            {booking.status}
                          </Badge>
                          {booking.image_path && (
                            <Badge variant="outline" className="text-blue-600 text-xs hidden sm:inline-flex">
                              📸 Has Photo
                            </Badge>
                          )}
                          {booking.status !== 'scheduled' && (
                            <Badge variant="outline" className="text-green-600 text-xs hidden sm:inline-flex">
                              📱 SMS Sent
                            </Badge>
                          )}
                        </div>
                        <span className="font-semibold text-emerald-600 text-sm sm:text-base">
                          {formatPrice(booking.quote_details?.total_price)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                        {/* Booking Details */}
                        <div className="md:col-span-2">
                          <div className="text-xs sm:text-sm space-y-1">
                            <p className="font-medium text-gray-900 break-words">{booking.address}</p>
                            <p className="text-gray-600">📞 {booking.phone}</p>
                            <p className="text-gray-600">📅 {new Date(booking.pickup_date).toLocaleDateString()}</p>
                            {booking.quote_details && (
                              <p className="text-gray-600 break-words">
                                📦 Items: {booking.quote_details.items.map(item => 
                                  `${item.quantity}x ${item.name}`
                                ).join(', ')}
                              </p>
                            )}
                            {booking.special_instructions && (
                              <p className="text-gray-600 break-words">📝 {booking.special_instructions}</p>
                            )}
                          </div>
                        </div>

                        {/* Photos */}
                        <div className="space-y-2">
                          {booking.image_path && (
                            <div>
                              <p className="text-xs font-medium text-blue-800 mb-1">Customer Photo:</p>
                              <img 
                                src={`${API}/admin/booking-image/${booking.id}`}
                                alt="Customer items"
                                className="w-full h-20 object-cover rounded border"
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            </div>
                          )}
                          {booking.completion_photo_path && (
                            <div>
                              <p className="text-xs font-medium text-green-800 mb-1">Completion Photo:</p>
                              <img 
                                src={`${API}/admin/completion-photo/${booking.id}`}
                                alt="Completed job"
                                className="w-full h-20 object-cover rounded border"
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-1 sm:gap-2 pt-2 border-t">
                        {/* Start Route Button - Available for all jobs */}
                        <Button 
                          size="sm" 
                          onClick={() => startRoute(booking)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                        >
                          🗺️ Start Route
                        </Button>
                        
                        {booking.status === 'scheduled' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                            className="text-xs"
                          >
                            ▶️ Start Job
                          </Button>
                        )}
                        
                        {booking.status === 'in_progress' && (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => updateBookingStatus(booking.id, 'completed')}
                              className="bg-gray-600 hover:bg-gray-700 text-xs"
                            >
                              ✅ Complete
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleCompleteWithPhoto(booking)}
                              className="bg-green-600 hover:bg-green-700 text-xs"
                            >
                              📸 Complete + Photo
                            </Button>
                          </>
                        )}
                        
                        {booking.status === 'completed' && (
                          <>
                            {!booking.completion_photo_path && (
                              <Button 
                                size="sm" 
                                onClick={() => handleCompleteWithPhoto(booking)}
                                variant="outline"
                                className="border-green-500 text-green-700 hover:bg-green-50 text-xs"
                              >
                                📸 Add Photo
                              </Button>
                            )}
                            {booking.completion_photo_path && (
                              <div className="flex gap-1">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => notifyCustomer(booking.id)}
                                  className="text-xs"
                                >
                                  📱 SMS + Photo
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => testSmsPhoto(booking.id)}
                                  className="text-xs bg-blue-50 border-blue-200 text-blue-700"
                                >
                                  🧪 Test
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Route Modal */}
      {showRouteModal && selectedRouteBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg sm:text-xl">🗺️ Route to Pickup Location</CardTitle>
                <CardDescription className="text-sm break-words">{selectedRouteBooking.address}</CardDescription>
              </div>
              <Button variant="outline" onClick={closeRouteModal} className="text-gray-600 w-full sm:w-auto">
                ✕ Close
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Job Info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <strong>Customer:</strong> {selectedRouteBooking.phone}
                    </div>
                    <div>
                      <strong>Time:</strong> {formatTime(selectedRouteBooking.pickup_time)}
                    </div>
                    <div className="col-span-2">
                      <strong>Items:</strong> {selectedRouteBooking.quote_details?.items.map(item => 
                        `${item.quantity}x ${item.name}`
                      ).join(', ')}
                    </div>
                    {selectedRouteBooking.special_instructions && (
                      <div className="col-span-2">
                        <strong>Notes:</strong> {selectedRouteBooking.special_instructions}
                      </div>
                    )}
                  </div>
                </div>

                {/* Map */}
                <div className="h-96 bg-gray-100 rounded-lg overflow-hidden">
                  {!GOOGLE_MAPS_API_KEY ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">📍 Navigation Options</h3>
                        <p className="text-gray-600 mb-4">Choose your preferred navigation app:</p>
                      </div>
                      <div className="space-y-2">
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          Open in Google Maps
                        </Button>
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`https://maps.apple.com/?daddr=${address}`, '_blank');
                          }}
                          variant="outline"
                          className="w-full"
                        >
                          Open in Apple Maps
                        </Button>
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`waze://ul?q=${address}&navigate=yes`, '_blank');
                          }}
                          variant="outline"
                          className="w-full"
                        >
                          Open in Waze
                        </Button>
                      </div>
                      <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-sm text-yellow-800">
                          <strong>Address:</strong> {selectedRouteBooking.address}
                        </p>
                      </div>
                    </div>
                  ) : isLoaded ? (
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={mapCenter}
                      zoom={13}
                    >
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

                {/* Route Info */}
                {routeDirections && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">📍 Route Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm text-green-700">
                      <div>
                        <strong>Distance:</strong> {routeDirections.routes[0].legs[0].distance.text}
                      </div>
                      <div>
                        <strong>Duration:</strong> {routeDirections.routes[0].legs[0].duration.text}
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button 
                        size="sm"
                        onClick={() => {
                          const address = encodeURIComponent(selectedRouteBooking.address);
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                        }}
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
      )}

      {/* Completion Photo Modal */}
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

      {/* Calendar Modal */}
      {showCalendar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div>
                <CardTitle className="text-lg sm:text-2xl flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  📅 Monthly Schedule
                  <span className="text-base sm:text-lg font-normal">
                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </CardTitle>
                <CardDescription className="text-sm">
                  Click on any date to see scheduled jobs for that day
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => changeMonth(-1)}
                  className="text-gray-600"
                >
                  ← Prev
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => changeMonth(1)}
                  className="text-gray-600"
                >
                  Next →
                </Button>
                <Button variant="outline" onClick={closeCalendar} className="text-gray-600">
                  ✕ Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[70vh]">
              <div className="calendar-grid">
                {/* Calendar Header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center font-semibold text-gray-700 bg-gray-100 rounded">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const daysInMonth = getDaysInMonth(currentMonth);
                    const firstDayOfWeek = getFirstDayOfWeek(currentMonth);
                    const today = new Date().toISOString().split('T')[0];
                    const selectedDay = selectedDate;
                    
                    const cells = [];
                    
                    // Empty cells for days before the first day of the month
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      cells.push(
                        <div key={`empty-${i}`} className="h-24 bg-gray-50 rounded border"></div>
                      );
                    }
                    
                    // Days of the month
                    for (let day = 1; day <= daysInMonth; day++) {
                      const dateStr = formatCalendarDate(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const dayJobs = calendarData[dateStr] || [];
                      const isToday = dateStr === today;
                      const isSelected = dateStr === selectedDay;
                      
                      cells.push(
                        <div 
                          key={day}
                          className={`h-24 p-1 border rounded cursor-pointer transition-all hover:bg-blue-50 ${
                            isToday ? 'bg-yellow-50 border-yellow-300' : 
                            isSelected ? 'bg-blue-50 border-blue-300' : 
                            'bg-white border-gray-200'
                          }`}
                          onClick={() => {
                            setSelectedDate(dateStr);
                            closeCalendar();
                          }}
                        >
                          <div className={`text-sm font-semibold mb-1 ${
                            isToday ? 'text-yellow-800' : 
                            isSelected ? 'text-blue-800' : 
                            'text-gray-700'
                          }`}>
                            {day}
                          </div>
                          
                          {/* Jobs for this day */}
                          <div className="space-y-px">
                            {dayJobs.slice(0, 3).map((job, index) => (
                              <div 
                                key={job.id}
                                className={`text-xs p-1 rounded truncate ${
                                  job.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  job.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}
                                title={`${job.pickup_time} - ${job.address} - $${job.quote_details?.total_price || 0}`}
                              >
                                {job.pickup_time.split('-')[0]} ${formatPrice(job.quote_details?.total_price)}
                              </div>
                            ))}
                            {dayJobs.length > 3 && (
                              <div className="text-xs text-gray-600 text-center">
                                +{dayJobs.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    
                    return cells;
                  })()}
                </div>

                {/* Legend */}
                <div className="mt-4 flex justify-center gap-6 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
                    <span>Scheduled</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
                    <span>In Progress</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                    <span>Completed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-50 border border-yellow-400 rounded"></div>
                    <span>Today</span>
                  </div>
                </div>

                {/* Monthly Summary */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {Object.values(calendarData).flat().length}
                    </div>
                    <div className="text-sm text-blue-800">Total Jobs</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Object.values(calendarData).flat().filter(j => j.status === 'completed').length}
                    </div>
                    <div className="text-sm text-green-800">Completed</div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-emerald-600">
                      {formatPrice(Object.values(calendarData).flat().filter(j => j.status === 'completed').reduce((sum, job) => sum + (job.quote_details?.total_price || 0), 0))}
                    </div>
                    <div className="text-sm text-emerald-800">Revenue</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {Object.values(calendarData).flat().filter(j => j.status === 'scheduled').length}
                    </div>
                    <div className="text-sm text-orange-800">Upcoming</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;