import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const formatPickupDate = (raw) => {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return raw;
  }
};

/** Pickup date / time / address summary card. */
export default function JobDetailsCard({ approvalData }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          Job Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Pickup Date:</span>
            <span className="font-medium">{formatPickupDate(approvalData?.pickup_date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Time Window:</span>
            <span className="font-medium">{approvalData?.pickup_time}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-gray-600">Address:</span>
            <span className="font-medium text-right max-w-xs">{approvalData?.address}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
