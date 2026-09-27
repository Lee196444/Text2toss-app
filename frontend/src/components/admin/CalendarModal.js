import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Pure helpers for the calendar's status → className lookups. Replaces the
// chained ternaries that lived inline in the JSX.
const getCellClass = (isToday, isSelected) => {
  if (isToday) return "bg-cyan-50 border-cyan-400 ring-1 ring-cyan-300";
  if (isSelected) return "bg-cyan-100 border-cyan-500";
  return "bg-white border-gray-200";
};

const getDayNumberClass = (isToday, isSelected) => {
  if (isToday) return "text-cyan-800";
  if (isSelected) return "text-cyan-900";
  return "text-gray-700";
};

const JOB_PILL_CLASS = {
  completed: "bg-green-100 text-green-800 hover:bg-green-200",
  in_progress: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
};
const DEFAULT_JOB_PILL = "bg-blue-100 text-blue-800 hover:bg-blue-200";

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
                className="bg-white hover:bg-cyan-50 border-2 border-cyan-300 hover:border-cyan-500 text-cyan-800 text-xs sm:text-sm px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
              >
                <span className="mr-1">←</span>
                Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => changeMonth(1)}
                className="bg-white hover:bg-cyan-50 border-2 border-cyan-300 hover:border-cyan-500 text-cyan-800 text-xs sm:text-sm px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
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
                  <div key={day} className="p-1 sm:p-2 text-center font-semibold text-cyan-300 bg-slate-900 rounded text-xs sm:text-sm">
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
                        className={`h-16 sm:h-24 p-1 border rounded cursor-pointer transition-all hover:bg-cyan-50 hover:border-cyan-300 ${getCellClass(isToday, isSelected)}`}
                        onClick={() => {
                          setSelectedCalendarDate(dateStr);
                          setShowDateJobsModal(true);
                        }}
                      >
                        <div className={`text-xs sm:text-sm font-semibold mb-1 ${getDayNumberClass(isToday, isSelected)}`}>
                          {day}
                        </div>
                        
                        {/* Jobs for this day */}
                        <div className="space-y-px">
                          {dayJobs.slice(0, window.innerWidth < 640 ? 2 : 3).map((job, index) => (
                            <div 
                              key={job.id}
                              className={`text-xs p-0.5 sm:p-1 rounded truncate cursor-pointer hover:opacity-80 transition-all duration-200 ${JOB_PILL_CLASS[job.status] || DEFAULT_JOB_PILL}`}
                              title={`Click to view details: ${job.pickup_time} - ${job.address} - $${job.quote_details?.approved_price ?? job.quote_details?.total_price ?? 0}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openJobDetails(job);
                              }}
                            >
                              <span className="hidden sm:inline">{job.pickup_time.split('-')[0]} </span>${job.quote_details?.approved_price ?? job.quote_details?.total_price ?? 0}
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
                  <div className="w-3 h-3 bg-cyan-50 border border-cyan-400 rounded"></div>
                  <span>Today</span>
                </div>
              </div>

              {/* Monthly Summary */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-cyan-200 p-3 sm:p-4 rounded-lg text-center shadow-sm">
                  <div className="text-xl sm:text-2xl font-bold text-cyan-600">
                    {Object.values(calendarData).flat().length}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 uppercase tracking-wide font-semibold">Total Jobs</div>
                </div>
                <div className="bg-white border border-cyan-200 p-3 sm:p-4 rounded-lg text-center shadow-sm">
                  <div className="text-xl sm:text-2xl font-bold text-cyan-600">
                    {Object.values(calendarData).flat().filter(j => j.status === 'completed').length}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 uppercase tracking-wide font-semibold">Completed</div>
                </div>
                <div className="bg-white border border-cyan-200 p-3 sm:p-4 rounded-lg text-center shadow-sm">
                  <div className="text-xl sm:text-2xl font-bold text-cyan-600">
                    {formatPrice(Object.values(calendarData).flat().filter(j => j.status === 'completed').reduce((sum, job) => sum + (job.quote_details?.approved_price ?? job.quote_details?.total_price ?? 0), 0))}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 uppercase tracking-wide font-semibold">Revenue</div>
                </div>
                <div className="bg-white border border-cyan-200 p-3 sm:p-4 rounded-lg text-center shadow-sm">
                  <div className="text-xl sm:text-2xl font-bold text-cyan-600">
                    {Object.values(calendarData).flat().filter(j => j.status === 'scheduled').length}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-600 uppercase tracking-wide font-semibold">Upcoming</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default CalendarModal;
