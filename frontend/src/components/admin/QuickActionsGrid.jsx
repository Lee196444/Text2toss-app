import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { CalendarDays, FileText, Camera, Download, Map as MapIcon, QrCode, Star, MessageSquare, Mail } from "lucide-react";

// Primary entry-point grid on the admin dashboard. Pure presentation — all
// handlers/state come from AdminDashboard so behaviour is unchanged.
const QuickActionsGrid = ({ approvalStats, calculateOptimalRoute, exportJobContacts, openAutoApprovedQuotes, openCalendar, pendingQuotes, setShowPhotoGallery, setShowQRModal, setShowQuoteApproval, setShowReviewsModal, setShowSmsCenter, setShowSmsTestModal }) => (
  <>
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
                <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Calendar</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="quotes-menu-btn"
                    className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 relative overflow-visible group transform hover:scale-105 min-h-[64px]"
                  >
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
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
                <Camera className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Upload Photos</span>
              </Button>

              <Button
                onClick={() => setShowSmsCenter(true)}
                className="bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <Mail className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Email Center</span>
              </Button>

              <Button
                onClick={exportJobContacts}
                className="bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <Download className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Export Contacts</span>
              </Button>

              <Button
                onClick={calculateOptimalRoute}
                className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <MapIcon className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Route</span>
              </Button>

              <Button
                onClick={() => setShowQRModal(true)}
                data-testid="open-marketing-qr-btn"
                className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <QrCode className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">QR Code</span>
              </Button>

              <Button
                onClick={() => setShowReviewsModal(true)}
                data-testid="open-reviews-btn"
                className="bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <Star className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Reviews</span>
              </Button>

              <Button
                onClick={() => setShowSmsTestModal(true)}
                data-testid="open-sms-test-btn"
                className="bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white shadow-md hover:shadow-lg transition-all duration-300 h-16 sm:h-20 flex flex-col items-center justify-center rounded-xl border-0 group transform hover:scale-105 min-h-[64px]"
              >
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm font-medium leading-tight">Test SMS</span>
              </Button>
            </div>
          </CardContent>
        </Card>

  </>
);

export default QuickActionsGrid;
