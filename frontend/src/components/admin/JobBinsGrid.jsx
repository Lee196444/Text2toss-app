import React from "react";
import { Card, CardContent } from "../ui/card";
import { CreditCard, CalendarDays, FastForward, Truck, CheckCircle2, BookOpen, FileText, Fuel, Mail } from "lucide-react";

// Compact status-tile row. `bins` = categorizBookings() output from AdminDashboard.
const JobBinsGrid = ({ bins, fetchPendingPayments, openAllJobsModal, openBin, openCalendar, pendingPayments, setShowEmailPreview, setShowInvoicesModal, setShowPendingPayments, setShowPricingSettings }) => (
  <>
        <Card className="bg-white/95 backdrop-blur-sm border-gray-200 shadow-sm overflow-visible">
          <CardContent className="p-3 sm:p-4 overflow-visible">
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-3">
              {(() => {
                const binConfigs = [
                  { type: 'pendingPayment', title: 'Pending Payment', Icon: CreditCard,   color: 'border-cyan-500 bg-cyan-50 hover:bg-cyan-100 ring-2 ring-cyan-200',     textColor: 'text-slate-800',    countColor: 'text-cyan-700',    iconColor: 'text-cyan-500' },
                  { type: 'new',            title: 'New',             Icon: CalendarDays, color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400',   textColor: 'text-slate-800',   countColor: 'text-cyan-600',   iconColor: 'text-cyan-500' },
                  { type: 'upcoming',       title: 'Upcoming',        Icon: FastForward,  color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400', textColor: 'text-slate-800', countColor: 'text-cyan-600', iconColor: 'text-cyan-500' },
                  { type: 'inProgress',     title: 'In Progress',     Icon: Truck,        color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400', textColor: 'text-slate-800', countColor: 'text-cyan-600', iconColor: 'text-cyan-500' },
                  { type: 'completed',      title: 'Completed',       Icon: CheckCircle2, color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400', textColor: 'text-slate-800',  countColor: 'text-cyan-600',  iconColor: 'text-cyan-500' },
                  { type: 'invoices',       title: 'Invoices',        Icon: FileText,     color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400',   textColor: 'text-slate-800',   countColor: 'text-cyan-600',   iconColor: 'text-cyan-500',  showTotal: true },
                  { type: 'all',            title: 'All Jobs',        Icon: BookOpen,     color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400', textColor: 'text-slate-800', countColor: 'text-cyan-600', iconColor: 'text-cyan-500', showTotal: true },
                  { type: 'pricing',        title: 'Pricing',         Icon: Fuel,         color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400',   textColor: 'text-slate-800',  countColor: 'text-cyan-600',  iconColor: 'text-cyan-500', showGear: true },
                  { type: 'emails',         title: 'Emails',          Icon: Mail,         color: 'border-cyan-200 bg-white hover:bg-cyan-50 hover:border-cyan-400',         textColor: 'text-slate-800',    countColor: 'text-cyan-600',    iconColor: 'text-cyan-500', showGear: true },
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
                      } else if (bin.type === 'invoices') {
                        setShowInvoicesModal(true);
                      } else if (bin.type === 'pricing') {
                        setShowPricingSettings(true);
                      } else if (bin.type === 'emails') {
                        setShowEmailPreview(true);
                      } else {
                        openBin(bin.type);
                      }
                    }}
                    className={`cursor-pointer transition-all duration-200 ${bin.color} border-2 hover:shadow-md rounded-xl p-2 text-center`}
                    data-testid={`bin-tile-${bin.type}`}
                  >
                    <bin.Icon className={`w-5 h-5 mx-auto mb-1 ${bin.iconColor}`} strokeWidth={2.2} />
                    <div className={`font-display italic text-xl leading-none ${bin.countColor}`}>
                      {(() => {
                        if (bin.type === 'pendingPayment') return pendingPayments.length;
                        if (bin.showGear) return '⚙';
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
  </>
);

export default JobBinsGrid;
