import { useState, useCallback } from "react";
import axiosBase from "axios";
import { toast } from "../../lib/toast";
import { logger } from "../../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const axios = axiosBase.create({ withCredentials: true });

// Admin month calendar: data fetch + open/close/navigate state (moved verbatim out of AdminDashboard).
export default function useAdminCalendar() {
  const [showCalendar, setShowCalendar] = useState(false);

  const [calendarData, setCalendarData] = useState({});

  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  const [showDateJobsModal, setShowDateJobsModal] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  return { showCalendar, setShowCalendar, calendarData, setCalendarData, selectedCalendarDate, setSelectedCalendarDate, showDateJobsModal, setShowDateJobsModal, currentMonth, setCurrentMonth, fetchCalendarData, openCalendar, closeCalendar, changeMonth };
}
