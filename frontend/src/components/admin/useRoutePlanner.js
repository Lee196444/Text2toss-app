import { useState, useCallback } from "react";
import axiosBase from "axios";
import { toast } from "../../lib/toast";
import { logger } from "../../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const axios = axiosBase.create({ withCredentials: true });

// Google-Maps route optimisation + per-job "start route" modal (moved verbatim out of AdminDashboard).
export default function useRoutePlanner({ dailyBookings, isLoaded }) {
  const [directions, setDirections] = useState(null);

  const [optimizedRoute, setOptimizedRoute] = useState(null);

  const [showRouteModal, setShowRouteModal] = useState(false);

  const [selectedRouteBooking, setSelectedRouteBooking] = useState(null);

  const [routeDirections, setRouteDirections] = useState(null);

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
      logger.error('Route calculation error:', error);
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

  return { directions, setDirections, optimizedRoute, setOptimizedRoute, showRouteModal, setShowRouteModal, selectedRouteBooking, setSelectedRouteBooking, routeDirections, setRouteDirections, calculateOptimalRoute, startRoute, closeRouteModal };
}
