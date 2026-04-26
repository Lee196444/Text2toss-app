import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CalendarModal = ({ open, currentMonth, calendarData, jobs, formatPrice, formatCalendarDate, getDaysInMonth, getFirstDayOfWeek, changeMonth, closeCalendar, openJobDetails, setSelectedCalendarDate, setShowDateJobsModal, selectedDate }) => {
  if (!open) return null;
  return (
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
                          setSelectedCalendarDate(dateStr);
                          setShowDateJobsModal(true);
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
                              className={`text-xs p-0.5 sm:p-1 rounded truncate cursor-pointer hover:opacity-80 transition-all duration-200 ${
                                job.status === 'completed' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                                job.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' :
                                'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              }`}
                              title={`Click to view details: ${job.pickup_time} - ${job.address} - $${job.quote_details?.total_price || 0}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openJobDetails(job);
                              }}
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
  );
};

export default CalendarModal;
