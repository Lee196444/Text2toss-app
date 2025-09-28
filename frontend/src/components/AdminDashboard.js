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
  const [pendingQuotes, setPendingQuotes] = useState([]);
  const [showQuoteApproval, setShowQuoteApproval] = useState(false);
  const [approvalStats, setApprovalStats] = useState({});
  const [showSmsCenter, setShowSmsCenter] = useState(false);
  const [smsMessages, setSmsMessages] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [newSmsMessage, setNewSmsMessage] = useState('');
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');

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
    fetchPendingQuotes();
    fetchApprovalStats();
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

  const fetchSmsMessages = async () => {
    setSmsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/sms-messages`);
      setSmsMessages(response.data.messages || []);
    } catch (error) {
      toast.error("Failed to load SMS messages");
      console.error('SMS fetch error:', error);
    }
    setSmsLoading(false);
  };

  const sendSmsMessage = async () => {
    if (!selectedCustomerPhone || !newSmsMessage.trim()) {
      toast.error("Please select a customer and enter a message");
      return;
    }

    try {
      const response = await axios.post(`${API}/admin/send-sms`, {
        phone: selectedCustomerPhone,
        message: newSmsMessage.trim()
      });
      
      if (response.data.success) {
        toast.success("SMS sent successfully!");
        setNewSmsMessage('');
        fetchSmsMessages(); // Refresh messages
      } else {
        toast.error("Failed to send SMS");
      }
    } catch (error) {
      toast.error("SMS sending failed");
      console.error('SMS send error:', error);
    }
  };

  const testSmsSetup = async () => {
    try {
      const response = await axios.post(`${API}/admin/test-sms`);
      if (response.data.configured) {
        toast.success("SMS is configured and ready!");
      } else {
        toast.error("SMS setup incomplete. Check Twilio credentials.");
      }
    } catch (error) {
      toast.error("SMS test failed. Check configuration.");
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

  const fetchPendingQuotes = async () => {
    try {
      const response = await axios.get(`${API}/admin/pending-quotes`);
      setPendingQuotes(response.data);
    } catch (error) {
      console.error('Error fetching pending quotes:', error);
    }
  };

  const fetchApprovalStats = async () => {
    try {
      const response = await axios.get(`${API}/admin/quote-approval-stats`);
      setApprovalStats(response.data);
    } catch (error) {
      console.error('Error fetching approval stats:', error);
    }
  };

  const handleQuoteApproval = async (quoteId, action, adminNotes = '', approvedPrice = null) => {
    try {
      const response = await axios.post(`${API}/admin/quotes/${quoteId}/approve`, {
        action,
        admin_notes: adminNotes,
        approved_price: approvedPrice
      });
      
      toast.success(`Quote ${action}d successfully`);
      
      // Refresh data
      fetchPendingQuotes();
      fetchApprovalStats();
      
    } catch (error) {
      toast.error(`Failed to ${action} quote`);
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-white/20">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-lg sm:text-xl font-bold">🏠</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Text2toss Admin</h1>
              </div>
              <p className="text-emerald-100 text-sm sm:text-base">
                Welcome back, {(() => {
                  try {
                    const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
                    return adminUser.display_name || 'Admin';
                  } catch {
                    return 'Admin';
                  }
                })()}! Manage daily pickups and optimize routes
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto text-sm bg-white/90"
              />
              <Button 
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                size="sm"
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                Today
              </Button>
              <Button 
                onClick={() => {
                  localStorage.removeItem('admin_token');
                  localStorage.removeItem('admin_user');
                  window.location.reload();
                }}
                size="sm"
                variant="outline"
                className="w-full sm:w-auto bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                🚪 Logout
              </Button>
            </div>
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

        {/* Modern Quick Actions Grid - Improved Layout */}
        <Card className="bg-white/95 backdrop-blur-sm border-gray-200 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              ⚡ Quick Actions
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Admin tools and management functions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              <Button 
                onClick={openCalendar} 
                className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📅</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Calendar</span>
              </Button>
              
              <Button 
                onClick={() => setShowQuoteApproval(true)} 
                className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 relative group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📋</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Quotes</span>
                {pendingQuotes.length > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-bold shadow-md animate-bounce">
                    {pendingQuotes.length}
                  </div>
                )}
              </Button>
              
              <Button 
                onClick={() => setShowSmsCenter(true)} 
                className="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 text-blue-700 border-2 border-blue-200 hover:border-blue-300 shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">💬</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">SMS Center</span>
              </Button>
              
              <Button 
                onClick={cleanupTempImages} 
                className="bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">🗑️</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Cleanup</span>
              </Button>
              
              <Button 
                onClick={calculateOptimalRoute} 
                className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 col-span-2 sm:col-span-1 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">🗺️</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Route</span>
              </Button>
            </div>
          </CardContent>
        </Card>

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
              <Button 
                variant="outline" 
                onClick={closeBin} 
                className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 w-full sm:w-auto px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
              >
                <span className="mr-2">✕</span>
                Close
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

                      {/* Modern Action Buttons */}
                      <div className="pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-2">
                          {/* Universal Route Button */}
                          <Button 
                            size="sm" 
                            onClick={() => startRoute(booking)}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex-shrink-0"
                          >
                            <span className="mr-1">🗺️</span>
                            Route
                          </Button>
                          
                          {/* Status-specific Action Buttons */}
                          <div className="flex flex-wrap gap-2 flex-1">
                            {booking.status === 'scheduled' && (
                              <Button 
                                size="sm" 
                                onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                              >
                                <span className="mr-1">▶️</span>
                                Start Job
                              </Button>
                            )}
                            
                            {booking.status === 'in_progress' && (
                              <>
                                <Button 
                                  size="sm" 
                                  onClick={() => updateBookingStatus(booking.id, 'completed')}
                                  className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                  <span className="mr-1">✅</span>
                                  Complete
                                </Button>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleCompleteWithPhoto(booking)}
                                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                  <span className="mr-1">📸</span>
                                  + Photo
                                </Button>
                              </>
                            )}
                            
                            {booking.status === 'completed' && (
                              <div className="flex flex-wrap gap-2">
                                {!booking.completion_photo_path && (
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleCompleteWithPhoto(booking)}
                                    className="bg-white border-2 border-green-400 text-green-700 hover:bg-green-50 hover:border-green-500 text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                                  >
                                    <span className="mr-1">📸</span>
                                    Add Photo
                                  </Button>
                                )}
                                {booking.completion_photo_path && (
                                  <>
                                    <Button 
                                      size="sm" 
                                      onClick={() => notifyCustomer(booking.id)}
                                      className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                      <span className="mr-1">📱</span>
                                      SMS
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      onClick={() => testSmsPhoto(booking.id)}
                                      className="bg-white border-2 border-blue-400 text-blue-700 hover:bg-blue-50 hover:border-blue-500 text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                      <span className="mr-1">🧪</span>
                                      Test
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
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
              <Button 
                onClick={closeRouteModal} 
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white w-full sm:w-auto px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
              >
                <span className="mr-2">✕</span>
                Close
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
                      <div className="space-y-3 w-full max-w-xs">
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
                          }}
                          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                        >
                          <span className="mr-2">🗺️</span>
                          Google Maps
                        </Button>
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`https://maps.apple.com/?daddr=${address}`, '_blank');
                          }}
                          className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-900 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                        >
                          <span className="mr-2">🍎</span>
                          Apple Maps
                        </Button>
                        <Button 
                          onClick={() => {
                            const address = encodeURIComponent(selectedRouteBooking.address);
                            window.open(`waze://ul?q=${address}&navigate=yes`, '_blank');
                          }}
                          className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                        >
                          <span className="mr-2">🚗</span>
                          Waze
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
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => changeMonth(-1)}
                  className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 text-xs sm:text-sm px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                >
                  <span className="mr-1">←</span>
                  Prev
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => changeMonth(1)}
                  className="bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 text-xs sm:text-sm px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                >
                  Next
                  <span className="ml-1">→</span>
                </Button>
                <Button 
                  onClick={closeCalendar} 
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs sm:text-sm px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                >
                  <span className="mr-1">✕</span>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[70vh]">
              <div className="calendar-grid">
                {/* Calendar Header */}
                <div className="grid grid-cols-7 gap-px sm:gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-1 sm:p-2 text-center font-semibold text-gray-700 bg-gray-100 rounded text-xs sm:text-sm">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-px sm:gap-1">
                  {(() => {
                    const daysInMonth = getDaysInMonth(currentMonth);
                    const firstDayOfWeek = getFirstDayOfWeek(currentMonth);
                    const today = new Date().toISOString().split('T')[0];
                    const selectedDay = selectedDate;
                    
                    const cells = [];
                    
                    // Empty cells for days before the first day of the month
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      cells.push(
                        <div key={`empty-${i}`} className="h-16 sm:h-24 bg-gray-50 rounded border"></div>
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
                          className={`h-16 sm:h-24 p-1 border rounded cursor-pointer transition-all hover:bg-blue-50 ${
                            isToday ? 'bg-yellow-50 border-yellow-300' : 
                            isSelected ? 'bg-blue-50 border-blue-300' : 
                            'bg-white border-gray-200'
                          }`}
                          onClick={() => {
                            setSelectedDate(dateStr);
                            closeCalendar();
                          }}
                        >
                          <div className={`text-xs sm:text-sm font-semibold mb-1 ${
                            isToday ? 'text-yellow-800' : 
                            isSelected ? 'text-blue-800' : 
                            'text-gray-700'
                          }`}>
                            {day}
                          </div>
                          
                          {/* Jobs for this day */}
                          <div className="space-y-px">
                            {dayJobs.slice(0, window.innerWidth < 640 ? 2 : 3).map((job, index) => (
                              <div 
                                key={job.id}
                                className={`text-xs p-0.5 sm:p-1 rounded truncate ${
                                  job.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  job.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}
                                title={`${job.pickup_time} - ${job.address} - $${job.quote_details?.total_price || 0}`}
                              >
                                <span className="hidden sm:inline">{job.pickup_time.split('-')[0]} </span>${job.quote_details?.total_price || 0}
                              </div>
                            ))}
                            {dayJobs.length > (window.innerWidth < 640 ? 2 : 3) && (
                              <div className="text-xs text-gray-600 text-center">
                                +{dayJobs.length - (window.innerWidth < 640 ? 2 : 3)} more
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
                <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  <div className="bg-blue-50 p-3 sm:p-4 rounded-lg text-center">
                    <div className="text-xl sm:text-2xl font-bold text-blue-600">
                      {Object.values(calendarData).flat().length}
                    </div>
                    <div className="text-xs sm:text-sm text-blue-800">Total Jobs</div>
                  </div>
                  <div className="bg-green-50 p-3 sm:p-4 rounded-lg text-center">
                    <div className="text-xl sm:text-2xl font-bold text-green-600">
                      {Object.values(calendarData).flat().filter(j => j.status === 'completed').length}
                    </div>
                    <div className="text-xs sm:text-sm text-green-800">Completed</div>
                  </div>
                  <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg text-center">
                    <div className="text-xl sm:text-2xl font-bold text-emerald-600">
                      {formatPrice(Object.values(calendarData).flat().filter(j => j.status === 'completed').reduce((sum, job) => sum + (job.quote_details?.total_price || 0), 0))}
                    </div>
                    <div className="text-xs sm:text-sm text-emerald-800">Revenue</div>
                  </div>
                  <div className="bg-orange-50 p-3 sm:p-4 rounded-lg text-center">
                    <div className="text-xl sm:text-2xl font-bold text-orange-600">
                      {Object.values(calendarData).flat().filter(j => j.status === 'scheduled').length}
                    </div>
                    <div className="text-xs sm:text-sm text-orange-800">Upcoming</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quote Approval Modal */}
      {showQuoteApproval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden mx-2 sm:mx-0 my-4 sm:my-0">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg sm:text-2xl flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="flex items-center gap-2">
                    📋 Quote Approval
                    {pendingQuotes.length > 0 && (
                      <Badge variant="destructive" className="text-xs">{pendingQuotes.length}</Badge>
                    )}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">
                  Review high-value quotes (Scale 4-10) before payment
                </CardDescription>
              </div>
              <Button 
                onClick={() => setShowQuoteApproval(false)}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium text-sm self-end sm:self-auto"
              >
                <span className="mr-1 sm:mr-2">✕</span>
                Close
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto max-h-[70vh]">
              {pendingQuotes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 text-lg">✅ No quotes pending approval</div>
                  <p className="text-gray-400 mt-2">All high-value quotes have been reviewed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingQuotes.map((quote) => (
                    <Card key={quote.id} className="border-l-4 border-l-orange-400">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              Quote ${quote.total_price}
                              <Badge variant="outline">Scale {quote.scale_level}</Badge>
                              <Badge className="bg-orange-100 text-orange-800">Pending Review</Badge>
                            </CardTitle>
                            <CardDescription className="text-sm">
                              Created: {new Date(quote.created_at).toLocaleDateString()} • ID: {quote.id}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Quote Details */}
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="font-semibold mb-2">Job Description:</h4>
                            <p className="text-sm text-gray-700 mb-3">{quote.description}</p>
                            
                            <h4 className="font-semibold mb-2">Items:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                              {quote.items.map((item, index) => (
                                <div key={index} className="text-sm bg-white p-2 rounded border">
                                  {item.quantity}x {item.name} ({item.size})
                                </div>
                              ))}
                            </div>
                            
                            {quote.ai_explanation && (
                              <div>
                                <h4 className="font-semibold mb-2">AI Analysis:</h4>
                                <p className="text-sm text-gray-600">{quote.ai_explanation}</p>
                              </div>
                            )}
                            
                            {quote.temp_image_path && (
                              <div className="mt-3">
                                <Badge className="bg-blue-100 text-blue-800">📸 Has Image</Badge>
                              </div>
                            )}
                          </div>

                          {/* Approval Actions */}
                          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                            <div className="flex-1">
                              <Label className="text-sm font-medium">Adjust Price (Optional)</Label>
                              <Input
                                type="number"
                                placeholder={quote.total_price}
                                id={`price-${quote.id}`}
                                className="mt-1"
                                step="0.01"
                              />
                            </div>
                            <div className="flex-1">
                              <Label className="text-sm font-medium">Admin Notes</Label>
                              <Input
                                placeholder="Optional notes for customer"
                                id={`notes-${quote.id}`}
                                className="mt-1"
                              />
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Button 
                              onClick={() => {
                                const adjustedPrice = document.getElementById(`price-${quote.id}`).value;
                                const notes = document.getElementById(`notes-${quote.id}`).value;
                                handleQuoteApproval(
                                  quote.id, 
                                  'approve', 
                                  notes,
                                  adjustedPrice ? parseFloat(adjustedPrice) : null
                                );
                              }}
                              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white flex-1 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                            >
                              <span className="mr-2">✅</span>
                              Approve Quote
                            </Button>
                            <Button 
                              onClick={() => {
                                const notes = document.getElementById(`notes-${quote.id}`).value;
                                handleQuoteApproval(quote.id, 'reject', notes || 'Quote rejected by admin');
                              }}
                              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white flex-1 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                            >
                              <span className="mr-2">❌</span>
                              Reject Quote
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              {/* Approval Statistics */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 pt-4 sm:pt-6 border-t">
                <div className="bg-orange-50 p-2 sm:p-3 rounded-lg text-center">
                  <div className="text-lg sm:text-xl font-bold text-orange-600">{approvalStats.pending_approval || 0}</div>
                  <div className="text-xs text-orange-800">Pending</div>
                </div>
                <div className="bg-green-50 p-2 sm:p-3 rounded-lg text-center">
                  <div className="text-lg sm:text-xl font-bold text-green-600">{approvalStats.approved || 0}</div>
                  <div className="text-xs text-green-800">Approved</div>
                </div>
                <div className="bg-red-50 p-2 sm:p-3 rounded-lg text-center">
                  <div className="text-lg sm:text-xl font-bold text-red-600">{approvalStats.rejected || 0}</div>
                  <div className="text-xs text-red-800">Rejected</div>
                </div>
                <div className="bg-blue-50 p-2 sm:p-3 rounded-lg text-center">
                  <div className="text-lg sm:text-xl font-bold text-blue-600">{approvalStats.auto_approved || 0}</div>
                  <div className="text-xs text-blue-800">Auto-Approved</div>
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