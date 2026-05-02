import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  buildImageUrl,
  STATUS_BADGE,
  STATUS_BORDER,
  formatDate,
  formatStatus,
} from "./bucketShared";
import { useSharedFilter } from "./FilterContext";
import StickyFilterInput from "./StickyFilterInput";

/**
 * "All Jobs History" modal. Filters its own list off the sticky shared
 * filter so typing here (or in any other bucket modal) stays in sync.
 */
const AllJobsModal = ({
  open,
  allJobs,
  openJobDetails,
  openEmailCenter,
  setShowAllJobsModal,
}) => {
  const [filter] = useSharedFilter();

  const visibleJobs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allJobs || [];
    return (allJobs || []).filter((job) => {
      const haystack = [
        job.id,
        job.email,
        job.phone,
        job.address,
        ...(job.quote_details?.items || []).map((i) => `${i.name} ${i.size}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allJobs, filter]);

  const totalRevenue = useMemo(
    () => visibleJobs.reduce((s, j) => s + (j.quote_details?.total_price || 0), 0),
    [visibleJobs],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4">
      <Card className="w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
                📚 All Jobs History
                <Badge className="bg-white/20 text-white border-0">{visibleJobs.length}</Badge>
              </CardTitle>
              <CardDescription className="text-white/85 text-xs sm:text-sm mt-1">
                Search by job ID, address, phone, or email · Total revenue in view: <strong>${totalRevenue.toFixed(2)}</strong>
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAllJobsModal(false)}
              data-testid="all-jobs-close-btn"
              className="bg-white/20 hover:bg-white/30 text-white border-0 self-end sm:self-auto"
            >
              <span className="mr-1">✕</span>Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[78vh] p-3 sm:p-4">
          <div className="mb-3 sm:mb-4">
            <StickyFilterInput
              placeholder="Search by Job #, Email, Phone, or Address..."
              testId="all-jobs-search-input"
            />
          </div>

          {visibleJobs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-gray-500">
                {filter ? "No jobs match your search." : "Loading jobs..."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visibleJobs.map((job) => {
                const imgUrl = buildImageUrl(job.image_path);
                const items = job.quote_details?.items || [];
                return (
                  <Card
                    key={job.id}
                    className={`border-l-4 ${STATUS_BORDER[job.status] || "border-l-gray-300"} cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => {
                      openJobDetails(job);
                      setShowAllJobsModal(false);
                    }}
                    data-testid={`all-jobs-card-${job.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-600">
                          ${job.quote_details?.total_price || 0}
                        </span>
                        <Badge className={STATUS_BADGE[job.status] || "bg-gray-100 text-gray-700"}>
                          {formatStatus(job.status)}
                        </Badge>
                        {job.payment_status && (
                          <Badge variant="outline" className="text-xs text-gray-500">
                            {job.payment_status}
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                          #{(job.id || "").substring(0, 8)} · {formatDate(job.pickup_date)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt="Customer items"
                              className="w-full h-32 object-cover rounded-lg border"
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-32 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                              No photo
                            </div>
                          )}
                        </div>
                        <div className="sm:col-span-2 space-y-1 text-xs sm:text-sm">
                          {items.length > 0 ? (
                            <ul className="space-y-0.5">
                              {items.slice(0, 5).map((item, idx) => (
                                <li key={`${item.name}-${idx}`} className="text-gray-700">
                                  • {item.quantity || 1}× <span className="font-medium">{item.name}</span>
                                  {item.size ? <span className="text-gray-500"> ({item.size})</span> : null}
                                </li>
                              ))}
                              {items.length > 5 && (
                                <li className="text-gray-400 italic">+{items.length - 5} more…</li>
                              )}
                            </ul>
                          ) : (
                            <p className="text-gray-500 italic">No item list available.</p>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-2 text-xs sm:text-sm text-gray-700 space-y-0.5">
                        <p>📍 {job.address || "—"}</p>
                        <p>📞 {job.phone || "—"}{job.email ? `   ✉️ ${job.email}` : ""}</p>
                        <p className="text-gray-500">⏰ {job.pickup_time || "—"}</p>
                      </div>

                      {job.email && (
                        <div className="pt-2 border-t border-gray-100">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEmailCenter(job.email);
                            }}
                            className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
                          >
                            <span className="mr-1">📧</span>Email Customer
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AllJobsModal;
