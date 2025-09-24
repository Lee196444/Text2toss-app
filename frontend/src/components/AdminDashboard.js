import React, { useState, useEffect } from "react";
import axios from "axios";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOOGLE_MAPS_API_KEY = "AIzaSyD8AgR-H4NBk5twXq5sMJWI6YpW3Yw4o_E"; // You'll need to replace this with your actual key

const AdminDashboard = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyBookings, setDailyBookings] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState({});
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
  const [directions, setDirections] = useState(null);
  const [optimizedRoute, setOptimizedRoute] = useState(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: ['geometry']
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

  const calculateOptimalRoute = async () => {
    if (!isLoaded || !window.google || dailyBookings.length < 2) {
      toast.error("Need at least 2 bookings to calculate route");
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
      toast.success("Optimal route calculated!");

    } catch (error) {
      toast.error("Failed to calculate route");
      console.error(error);
    }
  };

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      // You'll need to implement this endpoint in the backend
      await axios.patch(`${API}/admin/bookings/${bookingId}`, { status: newStatus });
      fetchDailySchedule(); // Refresh data
      toast.success("Booking status updated");
    } catch (error) {
      toast.error("Failed to update booking status");
    }
  };

  const formatTime = (timeRange) => {
    return timeRange;
  };

  const formatPrice = (price) => {
    return `$${price?.toFixed(2) || '0.00'}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/20 to-teal-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Manage daily pickups and optimize routes</p>
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
              <p className="text-sm text-gray-600">Today's Pickups</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-teal-600">
                {formatPrice(dailyBookings.reduce((sum, booking) => sum + (booking.quote_details?.total_price || 0), 0))}
              </div>
              <p className="text-sm text-gray-600">Daily Revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-blue-600">
                {Object.keys(weeklySchedule).length}
              </div>
              <p className="text-sm text-gray-600">Active Days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-2xl font-bold text-purple-600">
                {dailyBookings.filter(b => b.status === 'completed').length}
              </div>
              <p className="text-sm text-gray-600">Completed</p>
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
                <Button onClick={calculateOptimalRoute} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  Optimize Route
                </Button>
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
                  <div key={booking.id} className="border rounded-lg p-4 space-y-2">
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
                      </div>
                      <span className="font-semibold text-emerald-600">
                        {formatPrice(booking.quote_details?.total_price)}
                      </span>
                    </div>
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
                    <div className="flex space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => updateBookingStatus(booking.id, 'in_progress')}
                        disabled={booking.status !== 'scheduled'}
                      >
                        Start
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => updateBookingStatus(booking.id, 'completed')}
                        disabled={booking.status !== 'in_progress'}
                      >
                        Complete
                      </Button>
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
              {isLoaded ? (
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
    </div>
  );
};

export default AdminDashboard;