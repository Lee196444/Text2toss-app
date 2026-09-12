import React from "react";
import { Badge } from "../ui/badge";
import { Repeat } from "lucide-react";

// Amber "returning customer" tag; backend supplies booking.returning_customer = {previous_jobs, first_name} | null
const ReturningCustomerBadge = ({ booking, className = "" }) => {
  const rc = booking?.returning_customer;
  if (!rc || !rc.previous_jobs) return null;
  const n = rc.previous_jobs;
  return (
    <Badge
      data-testid={`returning-badge-${booking.id}`}
      title={`${rc.first_name || "This customer"} has booked ${n} time${n === 1 ? "" : "s"} before — greet them by name!`}
      className={`bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100 gap-1 ${className}`}
    >
      <Repeat className="w-3 h-3" />
      Returning{rc.first_name ? ` · ${rc.first_name}` : ""} · {n} prior job{n === 1 ? "" : "s"}
    </Badge>
  );
};

export default ReturningCustomerBadge;
