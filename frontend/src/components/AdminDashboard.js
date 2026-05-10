import React, { useState, useEffect, useCallback } from "react";
import axiosBase from "axios";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import MarketingQRModal from "./marketing/MarketingQRModal";
import RouteOptimizerModal from "./admin/RouteOptimizerModal";
import PendingApprovalsModal from "./admin/PendingApprovalsModal";
import AutoApprovedQuotesModal from "./admin/AutoApprovedQuotesModal";
import { FilterProvider } from "./admin/FilterContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import PaymentRemindersModal from "./admin/PaymentRemindersModal";
import BinModal from "./admin/BinModal";
import CalendarModal from "./admin/CalendarModal";
import AllJobsModal from "./admin/AllJobsModal";
import EmailCenterModal from "./admin/EmailCenterModal";
import PhotoGalleryModal from "./admin/PhotoGalleryModal";
import { toast } from "../lib/toast";
import { logger } from "../utils/logger";


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Job-status presentation helpers (kept flat to avoid nested ternaries) ---
const STATUS_BORDER_CLASS = {
  completed: "border-green-300 bg-green-50",
  in_progress: "border-yellow-300 bg-yellow-50",
};
const STATUS_BADGE_CLASS = {
  completed: "bg-green-500",
  in_progress: "bg-yellow-500",
};
const STATUS_BADGE_LABEL = {
  completed: "✓ Completed",
  in_progress: "⏳ In Progress",
};
const jobBorderClass = (status) => STATUS_BORDER_CLASS[status] || "border-blue-300 bg-blue-50";
const jobBadgeClass = (status) => STATUS_BADGE_CLASS[status] || "bg-blue-500";
const jobBadgeLabel = (status) => STATUS_BADGE_LABEL[status] || "📅 Scheduled";

// Local axios instance — admin requests need the httpOnly admin_session
// cookie. Using a per-module instance instead of `axios.defaults` so we
// DON'T pollute customer-side requests with credentials (which would force
// a CORS preflight whose `Access-Control-Allow-Origin: *` response is
// rejected by browsers when credentials are present — see CORS spec).
const axios = axiosBase.create({ withCredentials: true });

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ""; // Set this in .env file

const AdminDashboard = ({ adminDisplayName = "Admin", onLogout }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyBookings, setDailyBookings] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState({});
  const [loading, setLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // NYC default
  const [directions, setDirections] = useState(null);
  const [optimizedRoute, setOptimizedRoute] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
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
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [showDateJobsModal, setShowDateJobsModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [pendingQuotes, setPendingQuotes] = useState([]);
  const [showQuoteApproval, setShowQuoteApproval] = useState(false);
  const [approvalStats, setApprovalStats] = useState({});
  // Auto-approved quotes review (separate from pending-approval queue)
  const [autoApprovedQuotes, setAutoApprovedQuotes] = useState([]);
  const [showAutoApprovedQuotes, setShowAutoApprovedQuotes] = useState(false);
  const [autoApprovedLoading, setAutoApprovedLoading] = useState(false);
  const [showSmsCenter, setShowSmsCenter] = useState(false);
  const [smsMessages, setSmsMessages] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [newSmsMessage, setNewSmsMessage] = useState('');
  const [showAllJobsModal, setShowAllJobsModal] = useState(false);
  const [allJobs, setAllJobs] = useState([]);
  const [emailCompose, setEmailCompose] = useState({
    to: '',
    subject: '',
    message: ''
  });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');
  const [pendingPayments, setPendingPayments] = useState([]);  // New state for unpaid bookings
  const [showPendingPayments, setShowPendingPayments] = useState(false);  // Modal state
  
  // Collapse states for all sections
  const [collapsed, setCollapsed] = useState({
    quickActions: false,
    dailySchedule: false,
    weeklyOverview: false,
    quotesApproval: false,
    jobBins: false,
    calendar: false,
    smsCenter: false,
    gallery: false
  });
  
  const toggleSection = (section) => {
    setCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Photo Management States
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [reelPhotos, setReelPhotos] = useState(Array(6).fill(null));
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);
  
  // Customer Photo Viewing States
  const [showCustomerPhoto, setShowCustomerPhoto] = useState(false);
  const [currentCustomerPhoto, setCurrentCustomerPhoto] = useState(null);

  const [failedQuoteImages, setFailedQuoteImages] = useState(new Set());
  
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: ['geometry'],
    onLoad: () => {},
    onError: () => toast.error('Google Maps failed to load')
  });

  // IMPORTANT: All useCallback functions must be defined BEFORE useEffect hooks that reference them
  // Photo Management Functions
  const fetchGalleryPhotos = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/gallery-photos`);
      
      // Backend now returns full URLs
      setGalleryPhotos(response.data);
    } catch (error) {
      logger.error('Failed to fetch gallery photos:', error);
      toast.error('Failed to load gallery photos');
    }
  }, []);

  const fetchReelPhotos = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/reel-photos`);
      
      // Backend now returns full URLs
      setReelPhotos(response.data.photos || Array(6).fill(null));
    } catch (error) {
      logger.error('Failed to fetch reel photos:', error);
      toast.error('Failed to load photo reel');
    }
  }, []);

  const uploadGalleryPhoto = async (file) => {
    // Validate basic constraints up front so the user gets immediate feedback
    if (!file) return;
    const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || "");
    if (!isImage) {
      toast.error(`"${file.name || "file"}" is not an image — skipped`);
      return;
    }
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap (the backend also resizes)
    if (file.size > MAX_BYTES) {
      toast.error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — must be under 25 MB`);
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    setUploadingGalleryPhoto(true);
    try {
      await axios.post(`${API}/admin/upload-gallery-photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000
      });
      toast.success(`Uploaded: ${file.name}`);
      fetchGalleryPhotos();
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.message || "Unknown error";
      toast.error(`Upload failed: ${detail}`);
    } finally {
      setUploadingGalleryPhoto(false);
    }
  };

  const updateReelPhoto = async (slotIndex, photoUrl) => {
    try {
      await axios.post(`${API}/admin/update-reel-photo`, {
        slot_index: slotIndex,
        photo_url: photoUrl
      });
      toast.success(`Photo updated in slot ${slotIndex + 1}`);
      fetchReelPhotos();
    } catch (error) {
      toast.error('Failed to update photo reel');
    }
  };

  const removeGalleryPhoto = async (photoUrl) => {
    try {
      await axios.delete(`${API}/admin/gallery-photo`, {
        data: { photo_url: photoUrl }
      });
      toast.success('Photo removed from gallery');
      fetchGalleryPhotos();
    } catch (error) {
      toast.error('Failed to remove photo');
    }
  };

  // Load data on component mount and when date changes

  const fetchDailySchedule = useCallback(async () => {
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
    }
    setLoading(false);
  }, [selectedDate]);

  const fetchWeeklySchedule = useCallback(async () => {
    try {
      const startOfWeek = getStartOfWeek(new Date(selectedDate));
      const response = await axios.get(`${API}/admin/weekly-schedule?start_date=${startOfWeek}`);
      setWeeklySchedule(response.data);
    } catch (error) {
      toast.error("Failed to fetch weekly schedule");
    }
  }, [selectedDate]);

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

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      await axios.patch(`${API}/admin/bookings/${bookingId}`, { status: newStatus });
      fetchDailySchedule(); // Refresh data
      // Also refresh the rolling-7-day Completed bin so yesterday's completions
      // (and any just-marked-complete) show up immediately.
      fetchRecentCompleted();
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

  const handleViewCustomerPhoto = (booking) => {
    if (!booking.image_path) return;
    // Build the public image URL from the stored disk path. The path looks like
    // "/app/static/quote_images/quote_<uuid>.jpg" — we want the last two segments
    // (folder + filename). Earlier code hard-coded "booking_images" which was wrong
    // — the AI quote photos live in "quote_images".
    const backend_url = process.env.REACT_APP_BACKEND_URL;
    let photoUrl;
    if (booking.image_path.startsWith('http')) {
      photoUrl = booking.image_path;
    } else {
      const parts = booking.image_path.split('/').filter(Boolean);
      const folder = parts[parts.length - 2] || 'quote_images';
      const filename = parts[parts.length - 1];
      photoUrl = `${backend_url}/api/images/${folder}/${filename}`;
    }
    setCurrentCustomerPhoto({
      url: photoUrl,
      booking_id: booking.id,
      customer_phone: booking.phone,
      pickup_date: booking.pickup_date,
      address: booking.address
    });
    setShowCustomerPhoto(true);
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
      await axios.post(`${API}/admin/bookings/${bookingId}/notify-customer`);
      toast.success("SMS sent to customer with completion photo!");
    } catch (error) {
      toast.error("Failed to send SMS to customer");
    }
  };

  const testSmsPhoto = async (bookingId) => {
    try {
      await axios.post(`${API}/admin/test-sms-photo/${bookingId}`);
      toast.success("SMS photo test completed!");
    } catch (error) {
      toast.error("SMS photo test failed");
    }
  };

  const fetchSmsMessages = useCallback(async () => {
    setSmsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/sms-messages`);
      setSmsMessages(response.data.messages || []);
    } catch (error) {
      toast.error("Failed to load SMS messages");
    }
    setSmsLoading(false);
  }, []);

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
      logger.error('SMS send error:', error);
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

  const exportJobContacts = async () => {
    try {
      const response = await axios.get(`${API}/admin/export-job-contacts`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job-contacts-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Contact list exported successfully!");
    } catch (error) {
      toast.error("Failed to export contacts");
      logger.error('Export error:', error);
    }
  };

  const sendBulkEmailReminder = async () => {
    try {
      const response = await axios.post(`${API}/admin/send-bulk-email-reminder`);
      
      if (response.data.success) {
        toast.success(`Sent ${response.data.sent_count} email(s). ${response.data.failed_count} failed.`);
      } else {
        toast.error("Failed to send bulk emails");
      }
    } catch (error) {
      toast.error("Bulk email sending failed");
      logger.error('Bulk email error:', error);
    }
  };

  const sendBookingConfirmationEmail = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/admin/send-booking-confirmation-email/${bookingId}`);
      
      if (response.data.success) {
        toast.success("Booking confirmation email sent!");
      } else {
        toast.error("Failed to send email");
      }
    } catch (error) {
      toast.error("Email sending failed");
      logger.error('Email send error:', error);
    }
  };

  const sendPaymentReminder = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/bookings/${bookingId}/payment-reminder`);
      
      if (response.data.success) {
        toast.success("Payment reminder email sent!");
      } else {
        toast.error("Failed to send payment reminder");
      }
    } catch (error) {
      toast.error("Payment reminder failed");
      logger.error('Payment reminder error:', error);
    }
  };

  // Send custom email to customer
  const sendCustomEmail = async () => {
    if (!emailCompose.to || !emailCompose.subject || !emailCompose.message) {
      toast.error("Please fill in all fields");
      return;
    }

    setSendingEmail(true);
    try {
      const response = await axios.post(`${API}/admin/send-custom-email`, {
        to_email: emailCompose.to,
        subject: emailCompose.subject,
        message: emailCompose.message
      });
      
      if (response.data.success) {
        toast.success("Email sent successfully!");
        setEmailCompose({ to: '', subject: '', message: '' });
      } else {
        toast.error("Failed to send email");
      }
    } catch (error) {
      toast.error("Email sending failed");
      logger.error('Email send error:', error);
    } finally {
      setSendingEmail(false);
    }
  };

  // Open email center with pre-filled recipient
  const openEmailCenter = (email) => {
    setEmailCompose({ ...emailCompose, to: email });
    setShowSmsCenter(true);
  };

  // Fetch pending payment bookings
  const fetchPendingPayments = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/pending-payments`);
      setPendingPayments(response.data);
    } catch (error) {
      logger.error('Error fetching pending payments:', error);
    }
  }, []);

  // Mark booking as paid
  const markAsPaid = async (bookingId) => {
    try {
      await axios.post(`${API}/admin/bookings/${bookingId}/mark-paid`);
      toast.success("Booking marked as paid and added to calendar!");
      
      // Refresh data
      fetchDailySchedule();
      fetchPendingPayments();
    } catch (error) {
      toast.error("Failed to mark as paid");
      logger.error('Mark paid error:', error);
    }
  };

  const rejectPayment = async (bookingId) => {
    if (!window.confirm("Remove this booking from Pending Payment? This will cancel the booking.")) return;
    try {
      await axios.patch(`${API}/admin/bookings/${bookingId}`, { status: "cancelled" });
      toast.success("Booking removed from pending payments.");
      fetchPendingPayments();
    } catch (error) {
      toast.error("Failed to reject payment");
      logger.error('Reject payment error:', error);
    }
  };

  const rejectAllPendingPayments = async () => {
    if (!window.confirm(`Remove ALL ${pendingPayments.length} bookings from Pending Payment? This cannot be undone.`)) return;
    try {
      let rejected = 0;
      for (const booking of pendingPayments) {
        await axios.patch(`${API}/admin/bookings/${booking.id}`, { status: "cancelled" });
        rejected++;
      }
      toast.success(`${rejected} bookings removed from pending payments.`);
      fetchPendingPayments();
    } catch (error) {
      toast.error("Failed to reject some payments");
      fetchPendingPayments();
    }
  };

  const formatTime = (timeRange) => {
    return timeRange;
  };

  const formatPrice = (price) => {
    return `$${price?.toFixed(2) || '0.00'}`;
  };

  // Fetch all jobs (history and present). Wrapped in useCallback so we can
  // include it in the mount + auto-refresh effects below — bins must reflect
  // every active booking regardless of the calendar date the admin is viewing.
  const fetchAllJobs = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/all-bookings`);
      setAllJobs(response.data || []);
    } catch (error) {
      logger.error('Failed to fetch all jobs:', error);
      toast.error('Failed to load jobs');
    }
  }, []);

  // Open All Jobs modal
  const openAllJobsModal = () => {
    setShowAllJobsModal(true);
    fetchAllJobs();
  };

  const [recentCompletedBookings, setRecentCompletedBookings] = useState([]);

  const fetchRecentCompleted = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/recent-completed?days=7`);
      setRecentCompletedBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      logger.error('Failed to fetch recent completed jobs:', err);
      setRecentCompletedBookings([]);
    }
  }, []);

  // Categorize bookings into bins (date-independent — sources from ALL jobs
  // so "Upcoming"/"In Progress" don't silently disappear when the admin
  // navigates the calendar to a different day).
  const categorizBookings = () => {
    const today = new Date().toISOString().split('T')[0];

    const bins = {
      new: [],      // scheduled for today + past-due + pending customer approval
      upcoming: [], // scheduled for future dates
      inProgress: [], // currently in progress
      completed: []   // sourced separately via fetchRecentCompleted (7-day rolling window)
    };

    allJobs.forEach(booking => {
      const bookingDate = booking.pickup_date ? booking.pickup_date.split('T')[0] : '';

      if (booking.status === 'in_progress') {
        bins.inProgress.push(booking);
      } else if (booking.status === 'pending_customer_approval') {
        bins.new.push(booking); // approval-pending: surface as priority
      } else if (booking.status === 'scheduled') {
        if (bookingDate === today) {
          bins.new.push(booking);
        } else if (bookingDate > today) {
          bins.upcoming.push(booking);
        } else {
          bins.new.push(booking); // past-due — bubble back to New so it isn't lost
        }
      }
    });

    bins.completed = recentCompletedBookings;
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

  const openJobDetails = (job) => {
    // Open the job in a bin modal with just this single job
    setBinBookings([job]);
    setSelectedBin('details');
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

  const fetchPendingQuotes = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/pending-quotes`);
      setPendingQuotes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      logger.error('Error fetching pending quotes:', error);
      setPendingQuotes([]);
      toast.error('Failed to load pending quotes');
    }
  }, []);

  const fetchAutoApprovedQuotes = useCallback(async () => {
    setAutoApprovedLoading(true);
    try {
      const response = await axios.get(`${API}/admin/auto-approved-quotes?limit=30`);
      setAutoApprovedQuotes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      logger.error('Error fetching auto-approved quotes:', error);
      setAutoApprovedQuotes([]);
      toast.error('Failed to load auto-approved quotes');
    } finally {
      setAutoApprovedLoading(false);
    }
  }, []);

  const handleDismissAutoApproved = useCallback(async (quoteId) => {
    try {
      await axios.post(`${API}/admin/quotes/${quoteId}/dismiss`);
      // Optimistic update — drop it from view immediately, then reconcile.
      setAutoApprovedQuotes(prev => prev.filter(q => q.id !== quoteId));
      toast.success('Quote dismissed');
      fetchApprovalStats();
    } catch (err) {
      logger.error(err);
      toast.error('Could not dismiss quote');
    }
  }, []);

  const handleDismissAllAutoApproved = useCallback(async () => {
    if (!window.confirm('Clear all auto-approved quotes from this view? They\'ll stay in the database (All Jobs search still finds them).')) return;
    try {
      const res = await axios.post(`${API}/admin/quotes/dismiss-all-auto-approved`);
      setAutoApprovedQuotes([]);
      toast.success(`Cleared ${res.data?.dismissed || 0} auto-approved quotes`);
      fetchApprovalStats();
    } catch (err) {
      logger.error(err);
      toast.error('Could not clear auto-approved quotes');
    }
  }, []);

  const openAutoApprovedQuotes = useCallback(() => {
    setShowAutoApprovedQuotes(true);
    fetchAutoApprovedQuotes();
  }, [fetchAutoApprovedQuotes]);

  const fetchApprovalStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/admin/quote-approval-stats`);
      setApprovalStats(response.data);
    } catch (error) {
      logger.error('Error fetching approval stats:', error);
    }
  }, []);

  // useEffect hooks - MUST be placed AFTER all useCallback functions they reference
  useEffect(() => {
    fetchDailySchedule();
    fetchWeeklySchedule();
    fetchPendingQuotes();
    fetchApprovalStats();
    fetchPendingPayments();
    fetchRecentCompleted();
    fetchAllJobs();
  }, [selectedDate, fetchDailySchedule, fetchWeeklySchedule, fetchPendingQuotes, fetchApprovalStats, fetchPendingPayments, fetchRecentCompleted, fetchAllJobs]);

  // Auto-refresh admin data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPendingPayments();
      fetchPendingQuotes();
      fetchApprovalStats();
      fetchDailySchedule();
      fetchRecentCompleted();
      fetchAllJobs();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedDate, fetchPendingPayments, fetchPendingQuotes, fetchApprovalStats, fetchDailySchedule, fetchRecentCompleted, fetchAllJobs]);

  useEffect(() => {
    if (showSmsCenter) {
      fetchSmsMessages();
    }
  }, [showSmsCenter, fetchSmsMessages]);

  useEffect(() => {
    if (showPhotoGallery) {
      fetchGalleryPhotos();
      fetchReelPhotos();
    }
  }, [showPhotoGallery, fetchGalleryPhotos, fetchReelPhotos]);

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
    }
  };

  return (
    <FilterProvider>
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 overflow-visible">
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
                Welcome back, {adminDisplayName}! Manage daily pickups and optimize routes
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto text-lg font-semibold bg-white border-2 border-emerald-400 text-emerald-900 p-3 rounded-lg shadow-md hover:bg-emerald-50 focus:ring-2 focus:ring-emerald-500"
              />
              <Button 
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                size="sm"
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                Today
              </Button>
              <Button 
                onClick={onLogout}
                size="sm"
                variant="outline"
                className="w-full sm:w-auto bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>

        {/* === Quick Actions (primary entry point) === */}
        <Card className="bg-white/95 backdrop-blur-sm border-gray-200 shadow-lg overflow-visible">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display italic text-black flex items-center gap-2 uppercase tracking-wider">
              ⚡ Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-visible">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4 overflow-visible">
              <Button
                onClick={openCalendar}
                className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📅</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Calendar</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="quotes-menu-btn"
                    className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 relative overflow-visible group transform hover:scale-105 min-h-[64px]"
                  >
                    <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📋</span>
                    <span className="text-xs sm:text-sm font-medium leading-tight">Quotes</span>
                    {(pendingQuotes.length + (approvalStats?.auto_approved || 0)) > 0 && (
                      <div
                        className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 sm:min-w-[24px] sm:h-6 px-1.5 flex items-center justify-center font-bold shadow-lg"
                        data-testid="quotes-total-badge"
                      >
                        {pendingQuotes.length + (approvalStats?.auto_approved || 0)}
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64" data-testid="quotes-menu-content">
                  <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-500">
                    Review Quotes
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setShowQuoteApproval(true)}
                    data-testid="menu-open-pending-approvals"
                    className="cursor-pointer py-3"
                  >
                    <div className="flex items-center w-full gap-3">
                      <span className="text-xl">📋</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Needs Review</p>
                        <p className="text-xs text-gray-500">High-value quotes (Scale 9+)</p>
                      </div>
                      <span
                        className={`min-w-[28px] h-6 px-2 rounded-full text-xs font-bold flex items-center justify-center ${pendingQuotes.length > 0 ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}
                        data-testid="menu-pending-count"
                      >
                        {pendingQuotes.length}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={openAutoApprovedQuotes}
                    data-testid="menu-open-auto-approved"
                    className="cursor-pointer py-3"
                  >
                    <div className="flex items-center w-full gap-3">
                      <span className="text-xl">⚡</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Auto-Approved</p>
                        <p className="text-xs text-gray-500">30 most recent AI-approved</p>
                      </div>
                      <span
                        className={`min-w-[28px] h-6 px-2 rounded-full text-xs font-bold flex items-center justify-center ${(approvalStats?.auto_approved || 0) > 0 ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}
                        data-testid="menu-auto-approved-count"
                      >
                        {approvalStats?.auto_approved || 0}
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={() => setShowPhotoGallery(true)}
                className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📸</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Upload Photos</span>
              </Button>

              <Button
                onClick={() => setShowSmsCenter(true)}
                className="bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📧</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Email Center</span>
              </Button>

              <Button
                onClick={exportJobContacts}
                className="bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📥</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Export Contacts</span>
              </Button>

              <Button
                onClick={calculateOptimalRoute}
                className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">🗺️</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Route</span>
              </Button>

              <Button
                onClick={() => setShowQRModal(true)}
                data-testid="open-marketing-qr-btn"
                className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <span className="text-lg sm:text-2xl mb-1 group-hover:animate-pulse">📱</span>
                <span className="text-xs sm:text-sm font-medium leading-tight">QR Code</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* === Job Bins (compact glance row) === */}
        <Card className="bg-white/95 backdrop-blur-sm border-gray-200 shadow-sm overflow-visible">
          <CardContent className="p-3 sm:p-4 overflow-visible">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
              {(() => {
                const bins = categorizBookings();
                const binConfigs = [
                  { type: 'pendingPayment', title: 'Pending Payment', icon: '💳', color: 'border-red-300 bg-red-50 hover:bg-red-100', textColor: 'text-red-800', countColor: 'text-red-600' },
                  { type: 'new',            title: 'New',             icon: '📅', color: 'border-blue-300 bg-blue-50 hover:bg-blue-100', textColor: 'text-blue-800', countColor: 'text-blue-600' },
                  { type: 'upcoming',       title: 'Upcoming',        icon: '⏭️', color: 'border-orange-300 bg-orange-50 hover:bg-orange-100', textColor: 'text-orange-800', countColor: 'text-orange-600' },
                  { type: 'inProgress',     title: 'In Progress',     icon: '🚛', color: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100', textColor: 'text-yellow-800', countColor: 'text-yellow-600' },
                  { type: 'completed',      title: 'Completed',       icon: '✅', color: 'border-green-300 bg-green-50 hover:bg-green-100', textColor: 'text-green-800', countColor: 'text-green-600' },
                  { type: 'all',            title: 'All Jobs',        icon: '📚', color: 'border-purple-300 bg-purple-50 hover:bg-purple-100', textColor: 'text-purple-800', countColor: 'text-purple-600', showTotal: true },
                ];

                return binConfigs.map(bin => (
                  <button
                    key={bin.type}
                    onClick={() => {
                      if (bin.type === 'pendingPayment') {
                        fetchPendingPayments();
                        setShowPendingPayments(true);
                      } else if (bin.type === 'new') {
                        openCalendar();
                      } else if (bin.type === 'all') {
                        openAllJobsModal();
                      } else {
                        openBin(bin.type);
                      }
                    }}
                    className={`cursor-pointer transition-all duration-200 ${bin.color} border-2 hover:shadow-md rounded-xl p-2 text-center`}
                    data-testid={`bin-tile-${bin.type}`}
                  >
                    <div className="text-lg leading-none mb-1">{bin.icon}</div>
                    <div className={`font-display italic text-xl leading-none ${bin.countColor}`}>
                      {(() => {
                        if (bin.type === 'pendingPayment') return pendingPayments.length;
                        if (bin.showTotal) return '∞';
                        return bins[bin.type]?.length || 0;
                      })()}
                    </div>
                    <p className={`text-[10px] font-bold mt-1 uppercase tracking-wider ${bin.textColor}`}>{bin.title}</p>
                  </button>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bin View Modal */}
      <BinModal
        open={!!selectedBin}
        selectedBin={selectedBin}
        binBookings={binBookings}
        jobs={allJobs}
        formatPrice={formatPrice}
        formatTime={formatTime}
        closeBin={closeBin}
        startRoute={startRoute}
        notifyCustomer={notifyCustomer}
        updateBookingStatus={updateBookingStatus}
        handleCompleteWithPhoto={handleCompleteWithPhoto}
        handleViewCustomerPhoto={handleViewCustomerPhoto}
        testSmsPhoto={testSmsPhoto}
      />

      <RouteOptimizerModal
        open={showRouteModal && !!selectedRouteBooking}
        booking={selectedRouteBooking}
        routeDirections={routeDirections}
        mapCenter={mapCenter}
        isLoaded={isLoaded}
        formatTime={formatTime}
        onClose={closeRouteModal}
      />

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
      <CalendarModal
        open={showCalendar}
        currentMonth={currentMonth}
        calendarData={calendarData}
        jobs={allJobs}
        selectedDate={selectedDate}
        formatPrice={formatPrice}
        formatCalendarDate={formatCalendarDate}
        getDaysInMonth={getDaysInMonth}
        getFirstDayOfWeek={getFirstDayOfWeek}
        changeMonth={changeMonth}
        closeCalendar={closeCalendar}
        openJobDetails={openJobDetails}
        setSelectedCalendarDate={setSelectedCalendarDate}
        setShowDateJobsModal={setShowDateJobsModal}
      />

      {/* Date Jobs Modal - Show all jobs for selected date */}
      {/* All Jobs Modal with Search */}
      <AllJobsModal
        open={showAllJobsModal}
        allJobs={allJobs}
        openJobDetails={openJobDetails}
        openEmailCenter={openEmailCenter}
        setShowAllJobsModal={setShowAllJobsModal}
      />

      {showDateJobsModal && selectedCalendarDate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl">
                    📅 Jobs for {new Date(selectedCalendarDate + 'T00:00:00').toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </CardTitle>
                  <CardDescription className="text-white/80 mt-1">
                    {(calendarData[selectedCalendarDate] || []).length} job(s) scheduled
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => setShowDateJobsModal(false)}
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-6 overflow-y-auto max-h-[70vh]">
              {(calendarData[selectedCalendarDate] || []).length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-gray-500 text-lg">No jobs scheduled for this date</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(calendarData[selectedCalendarDate] || []).map((job, index) => (
                    <Card 
                      key={job.id}
                      className={`cursor-pointer hover:shadow-lg transition-all ${jobBorderClass(job.status)}`}
                      onClick={() => {
                        openJobDetails(job);
                        setShowDateJobsModal(false);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-lg text-gray-800">
                              Job #{index + 1} - {job.pickup_time}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              ID: {job.id.substring(0, 8)}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-emerald-600">
                              ${job.quote_details?.total_price || 0}
                            </div>
                            <Badge className={jobBadgeClass(job.status)}>
                              {jobBadgeLabel(job.status)}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <span className="font-semibold text-gray-700">📍 Address:</span>
                            <span className="text-gray-600">{job.address}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-semibold text-gray-700">📞 Phone:</span>
                            <span className="text-gray-600">{job.phone}</span>
                          </div>
                          {job.special_instructions && (
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-gray-700">📝 Notes:</span>
                              <span className="text-gray-600">{job.special_instructions}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <p className="text-xs text-gray-500 text-center">
                            Click to view full details
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              <div className="mt-6 text-center">
                <Button
                  onClick={() => setShowDateJobsModal(false)}
                  variant="outline"
                  className="px-8"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Notification Center Modal */}
      <EmailCenterModal
        open={showSmsCenter}
        emailCompose={emailCompose}
        setEmailCompose={setEmailCompose}
        sendingEmail={sendingEmail}
        sendCustomEmail={sendCustomEmail}
        sendBulkEmailReminder={sendBulkEmailReminder}
        setShowSmsCenter={setShowSmsCenter}
      />

      <PendingApprovalsModal
        open={showQuoteApproval}
        pendingQuotes={pendingQuotes}
        approvalStats={approvalStats}
        failedQuoteImages={failedQuoteImages}
        onMarkImageFailed={(id) => setFailedQuoteImages(prev => new Set([...prev, id]))}
        onApprove={(id, notes, price) => handleQuoteApproval(id, 'approve', notes, price)}
        onReject={(id, notes) => handleQuoteApproval(id, 'reject', notes)}
        onClose={() => setShowQuoteApproval(false)}
      />

      <AutoApprovedQuotesModal
        open={showAutoApprovedQuotes}
        quotes={autoApprovedQuotes}
        loading={autoApprovedLoading}
        onClose={() => setShowAutoApprovedQuotes(false)}
        onRefresh={fetchAutoApprovedQuotes}
        onDismissQuote={handleDismissAutoApproved}
        onDismissAll={handleDismissAllAutoApproved}
      />

      {/* Photo Gallery Management Modal */}
      <PhotoGalleryModal
        open={showPhotoGallery}
        galleryPhotos={galleryPhotos}
        reelPhotos={reelPhotos}
        uploadGalleryPhoto={uploadGalleryPhoto}
        removeGalleryPhoto={removeGalleryPhoto}
        updateReelPhoto={updateReelPhoto}
        setShowPhotoGallery={setShowPhotoGallery}
      />

      {/* Customer Photo Viewing Modal */}
      {showCustomerPhoto && currentCustomerPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <Card className="w-full max-w-2xl mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <span className="text-xl">📷</span>
                Customer Uploaded Photo
              </CardTitle>
              <CardDescription className="text-sm space-y-1">
                <div className="font-medium text-gray-700">Booking ID: {currentCustomerPhoto.booking_id?.slice(0, 8)}...</div>
                <div className="text-gray-600">📍 {currentCustomerPhoto.address}</div>
                <div className="text-gray-600">📅 {new Date(currentCustomerPhoto.pickup_date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric', 
                  month: 'long',
                  day: 'numeric'
                })}</div>
                <div className="text-gray-600">📱 {currentCustomerPhoto.customer_phone}</div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Photo Display */}
              <div className="relative">
                <img 
                  src={currentCustomerPhoto.url} 
                  alt="Customer uploaded photo" 
                  className="w-full max-h-[400px] object-contain rounded-lg border-2 border-gray-200 bg-gray-50"
                  onError={(e) => {
                    e.target.src = '/placeholder-image.png';
                    e.target.alt = 'Photo could not be loaded';
                  }}
                />
                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Original Size
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = currentCustomerPhoto.url;
                    link.download = `customer-photo-${currentCustomerPhoto.booking_id?.slice(0, 8)}.jpg`;
                    link.target = '_blank';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                >
                  <span className="mr-2">⬇️</span>
                  Download Photo
                </Button>
                <Button
                  onClick={() => {
                    window.open(currentCustomerPhoto.url, '_blank');
                  }}
                  variant="outline"
                  className="flex-1 border-green-400 text-green-700 hover:bg-green-50"
                >
                  <span className="mr-2">🔍</span>
                  Open Full Size
                </Button>
                <Button
                  onClick={() => {
                    setShowCustomerPhoto(false);
                    setCurrentCustomerPhoto(null);
                  }}
                  variant="outline"
                  className="flex-1 border-gray-400 text-gray-700 hover:bg-gray-50"
                >
                  <span className="mr-2">✕</span>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <PaymentRemindersModal
        open={showPendingPayments}
        pendingPayments={pendingPayments}
        onClose={() => setShowPendingPayments(false)}
        onMarkPaid={markAsPaid}
        onReject={rejectPayment}
        onRejectAll={rejectAllPendingPayments}
      />

      <MarketingQRModal open={showQRModal} onClose={() => setShowQRModal(false)} />
    </div>
    </FilterProvider>
  );
};

export default AdminDashboard;