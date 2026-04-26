import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AllJobsModal = ({ open, jobs, filteredJobs, jobSearchQuery, handleJobSearch, openJobDetails, openEmailCenter, setShowAllJobsModal }) => {
  if (!open) return null;
  return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl">
                  📚 All Jobs History
                </CardTitle>
                <CardDescription className="text-white/80 mt-1">
                  Search and view all jobs
                </CardDescription>
              </div>
              <Button 
                onClick={() => setShowAllJobsModal(false)}
                variant="ghost"
                className="text-white hover:bg-white/20"
              >
                ✕
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="p-6">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by Job #, Email, Phone, or Address..."
                  value={jobSearchQuery}
                  onChange={(e) => handleJobSearch(e.target.value)}
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-base"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl">
                  🔍
                </span>
              </div>
              {jobSearchQuery && (
                <p className="text-sm text-gray-600 mt-2">
                  Found {filteredJobs.length} job(s)
                </p>
              )}
            </div>

            {/* Jobs List */}
            <div className="overflow-y-auto max-h-[50vh] space-y-3">
              {filteredJobs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-gray-500 text-lg">
                    {jobSearchQuery ? 'No jobs found matching your search' : 'Loading jobs...'}
                  </p>
                </div>
              ) : (
                filteredJobs.map((job, index) => (
                  <Card 
                    key={job.id}
                    className={`cursor-pointer hover:shadow-lg transition-all border-2 ${
                      job.status === 'completed' ? 'border-green-300 bg-green-50/50' :
                      job.status === 'in_progress' ? 'border-yellow-300 bg-yellow-50/50' :
                      job.status === 'cancelled' ? 'border-red-300 bg-red-50/50' :
                      'border-blue-300 bg-blue-50/50'
                    }`}
                    onClick={() => {
                      openJobDetails(job);
                      setShowAllJobsModal(false);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-bold text-base text-gray-800">
                              Job #{job.id.substring(0, 8)}...
                            </h3>
                            <Badge className={
                              job.status === 'completed' ? 'bg-green-500' :
                              job.status === 'in_progress' ? 'bg-yellow-500' :
                              job.status === 'cancelled' ? 'bg-red-500' :
                              'bg-blue-500'
                            }>
                              {job.status === 'completed' ? '✓' :
                               job.status === 'in_progress' ? '⏳' :
                               job.status === 'cancelled' ? '✕' :
                               '📅'} {job.status}
                            </Badge>
                            {job.email && (
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEmailCenter(job.email);
                                }}
                                className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-2 py-1 rounded"
                              >
                                📧 Email
                              </Button>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>📅 {new Date(job.pickup_date).toLocaleDateString()}</div>
                            <div>⏰ {job.pickup_time}</div>
                            <div>📧 {job.email || 'N/A'}</div>
                            <div>📱 {job.phone || 'N/A'}</div>
                            <div className="col-span-2">📍 {job.address}</div>
                          </div>
                        </div>
                        
                        <div className="text-right ml-4">
                          <div className="text-xl font-bold text-emerald-600">
                            ${job.quote_details?.total_price || 0}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {job.payment_status}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default AllJobsModal;
