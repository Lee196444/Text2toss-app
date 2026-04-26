import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BinModal = ({ open, selectedBin, binBookings, jobs, formatPrice, formatTime, closeBin, startRoute, notifyCustomer, updateBookingStatus, handleCompleteWithPhoto, handleViewCustomerPhoto, testSmsPhoto }) => {
  if (!open) return null;
  return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-2 sm:p-4">
        <Card className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div>
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2">
                {selectedBin === 'new' && '🆕 New Jobs'}
                {selectedBin === 'upcoming' && '📅 Upcoming Jobs'}
                {selectedBin === 'inProgress' && '🚛 Jobs In Progress'}
                {selectedBin === 'completed' && '✅ Completed Jobs'}
                {selectedBin === 'details' && '📋 Job Details'}
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
                {/* Sort jobs by pickup date descending */}
                {binBookings
                  .sort((a, b) => new Date(b.pickup_date) - new Date(a.pickup_date))
                  .map((booking, index) => (
                  <div key={booking.id} className="border rounded-lg p-3 sm:p-4 space-y-3 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <Badge variant="secondary" className="text-xs">#{index + 1}</Badge>
                        <Badge 
                          variant={
                            booking.status === 'completed' ? 'success' : 
                            booking.status === 'in_progress' ? 'warning' : 
                            booking.status === 'pending_customer_approval' ? 'destructive' :
                            'default'
                          }
                          className={`text-xs ${
                            booking.status === 'pending_customer_approval' ? 'bg-orange-500 text-white' : ''
                          }`}
                        >
                          {booking.status === 'pending_customer_approval' ? 'AWAITING CUSTOMER APPROVAL' : 
                           booking.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                        {/* Date Badge */}
                        <Badge variant="outline" className="bg-gray-100 text-gray-700 text-xs">
                          📅 {new Date(booking.pickup_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Badge>
                        {booking.pickup_time && (
                          <Badge variant="outline" className="bg-indigo-100 text-indigo-700 text-xs">
                            🕐 {formatTime(booking.pickup_time)}
                          </Badge>
                        )}
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
                        {booking.quote_details?.total_price && (
                          <div className="text-lg font-bold text-emerald-600">
                            ${booking.quote_details.total_price}
                          </div>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500 text-right">
                        ID: {booking.id.substring(0, 8)}...
                      </div>
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
                        
                        {/* Customer Photo View Button */}
                        {booking.image_path && (
                          <Button 
                            size="sm" 
                            onClick={() => handleViewCustomerPhoto(booking)}
                            className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 flex-shrink-0"
                          >
                            <span className="mr-1">📷</span>
                            View Photo
                          </Button>
                        )}
                        
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
  );
};

export default BinModal;
