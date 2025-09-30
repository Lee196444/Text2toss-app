import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AvailabilityCalendar = ({ selectedDate, onDateSelect, onClose }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availabilityData, setAvailabilityData] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAvailabilityData();
  }, [currentMonth]);

  const fetchAvailabilityData = async () => {
    setLoading(true);
    try {
      // Get first and last day of the month
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      const startDate = firstDay.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];
      
      const response = await axios.get(`${API}/availability-range?start_date=${startDate}&end_date=${endDate}`);
      setAvailabilityData(response.data);
    } catch (error) {
      console.error('Error fetching availability:', error);
    }
    setLoading(false);
  };

  const changeMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfWeek = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDateKey = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getDateStatus = (dateStr) => {
    const today = new Date();
    const checkDate = new Date(dateStr);
    
    // Don't allow past dates
    if (checkDate < today.setHours(0, 0, 0, 0)) {
      return { status: 'past', available_count: 0, className: 'bg-gray-100 text-gray-400 cursor-not-allowed' };
    }

    const availability = availabilityData[dateStr];
    if (!availability) {
      return { status: 'loading', available_count: 0, className: 'bg-gray-50' };
    }

    if (availability.is_restricted) {
      return { 
        status: 'restricted', 
        available_count: 0, 
        className: 'bg-red-100 text-red-800 cursor-not-allowed border-red-200',
        tooltip: 'Not available on weekends'
      };
    }

    if (availability.status === 'fully_booked') {
      return { 
        status: 'fully_booked', 
        available_count: 0, 
        className: 'bg-red-200 text-red-900 cursor-not-allowed border-red-300',
        tooltip: 'Fully booked'
      };
    }

    if (availability.status === 'limited') {
      return { 
        status: 'limited', 
        available_count: availability.available_count, 
        className: 'bg-yellow-100 text-yellow-800 cursor-pointer border-yellow-300 hover:bg-yellow-200',
        tooltip: `${availability.available_count} slots available`
      };
    }

    return { 
      status: 'available', 
      available_count: availability.available_count, 
      className: 'bg-green-100 text-green-800 cursor-pointer border-green-300 hover:bg-green-200',
      tooltip: `${availability.available_count} slots available`
    };
  };

  const handleDateClick = (dateStr) => {
    const dateStatus = getDateStatus(dateStr);
    if (dateStatus.status === 'past' || dateStatus.status === 'restricted' || dateStatus.status === 'fully_booked') {
      return; // Don't allow selection
    }
    onDateSelect(dateStr);
    onClose();
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDayOfWeek = getFirstDayOfWeek(currentMonth);
    const today = new Date().toISOString().split('T')[0];
    
    const cells = [];
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(
        <div key={`empty-${i}`} className="h-16 sm:h-20 lg:h-24 bg-gray-50 rounded border"></div>
      );
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateKey(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const dateStatus = getDateStatus(dateStr);
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === today;
      
      cells.push(
        <div 
          key={day}
          className={`h-16 sm:h-20 lg:h-24 p-2 border rounded transition-all relative ${dateStatus.className} ${
            isSelected ? 'ring-2 ring-blue-500' : ''
          } ${isToday ? 'ring-1 ring-blue-300' : ''}`}
          onClick={() => handleDateClick(dateStr)}
          title={dateStatus.tooltip}
        >
          <div className={`text-base sm:text-lg lg:text-xl font-semibold ${isToday ? 'underline' : ''}`}>
            {day}
          </div>
          
          {/* Availability indicator */}
          {dateStatus.available_count > 0 && (
            <div className="absolute bottom-1 right-1 bg-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-xs sm:text-sm font-bold shadow-sm">
              {dateStatus.available_count}
            </div>
          )}
          
          {/* Status indicators */}
          {dateStatus.status === 'restricted' && (
            <div className="absolute bottom-0 left-0 text-xs">❌</div>
          )}
          {dateStatus.status === 'fully_booked' && (
            <div className="absolute bottom-0 left-0 text-xs">🚫</div>
          )}
        </div>
      );
    }
    
    return cells;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl sm:max-w-4xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg sm:text-xl">
              Select Pickup Date
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => changeMonth(-1)}
              disabled={loading}
            >
              ←
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => changeMonth(1)}
              disabled={loading}
            >
              →
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Digital Clock */}
          <DigitalClock />
          {/* Calendar Header */}
          <div className="grid grid-cols-7 gap-2 mb-3">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-3 text-center font-semibold text-gray-700 text-sm sm:text-base lg:text-lg">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {loading ? (
              <div className="col-span-7 text-center py-8 text-gray-500">
                Loading availability...
              </div>
            ) : (
              renderCalendar()
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
              <span>Limited</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
              <span>Fully Booked</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
              <span>Unavailable</span>
            </div>
          </div>

          <div className="mt-3 text-center text-xs text-gray-600">
            Numbers show available time slots • Click green/yellow dates to select
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AvailabilityCalendar;