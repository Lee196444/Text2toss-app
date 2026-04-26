import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EmailCenterModal = ({ open, emailCompose, setEmailCompose, sendingEmail, sendCustomEmail, sendBulkEmailReminder, setShowSmsCenter }) => {
  if (!open) return null;
  return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-start sm:items-center justify-center p-2 sm:p-4 pt-16 sm:pt-4 pb-safe-area-inset-bottom">
        <Card className="w-full max-w-4xl mx-2 sm:mx-0 my-4 sm:my-0 max-h-[90vh] overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2">
                📧 Email Notification Center
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Manage email notifications and customer communications
              </CardDescription>
            </div>
            <Button 
              onClick={() => setShowSmsCenter(false)}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium text-sm self-end sm:self-auto"
            >
              <span className="mr-1 sm:mr-2">✕</span>
              Close
            </Button>
          </CardHeader>
          
          <CardContent className="max-h-[70vh] overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Compose Email Section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  ✉️ Compose Email
                </h3>
                
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Email:
                    </label>
                    <input
                      type="email"
                      value={emailCompose.to}
                      onChange={(e) => setEmailCompose({...emailCompose, to: e.target.value})}
                      placeholder="customer@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject:
                    </label>
                    <input
                      type="text"
                      value={emailCompose.subject}
                      onChange={(e) => setEmailCompose({...emailCompose, subject: e.target.value})}
                      placeholder="Email subject"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message:
                    </label>
                    <textarea
                      value={emailCompose.message}
                      onChange={(e) => setEmailCompose({...emailCompose, message: e.target.value})}
                      placeholder="Type your message here..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>
                  
                  <Button
                    onClick={sendCustomEmail}
                    disabled={sendingEmail}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                  >
                    {sendingEmail ? '⏳ Sending...' : '📤 Send Email'}
                  </Button>
                </div>
                
                {/* Quick Actions */}
                <div className="mt-6 space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    ⚡ Quick Actions
                  </h3>
                  <Button
                    onClick={sendBulkEmailReminder}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                  >
                    <span className="mr-2">📧</span>
                    Send Bulk Payment Reminders
                  </Button>
                </div>
              </div>
              
              {/* Email Templates */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  📝 Email Templates
                </h3>
                
                <div className="space-y-3">
                  <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <h4 className="font-medium text-gray-900">Job Completion Notification</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Automatically sent when a job is marked as completed with photo
                    </p>
                    <div className="flex items-center mt-2">
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        ✅ Active
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <h4 className="font-medium text-gray-900">Booking Confirmation</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Sent when a customer's booking is confirmed
                    </p>
                    <div className="flex items-center mt-2">
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        ✅ Active
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <h4 className="font-medium text-gray-900">Quote Approval</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Sent when a quote requires customer approval
                    </p>
                    <div className="flex items-center mt-2">
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        ✅ Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default EmailCenterModal;
