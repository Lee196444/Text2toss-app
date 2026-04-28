import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

/** Original vs adjusted price card with optional reason note. */
export default function PriceAdjustmentCard({ approvalData }) {
  return (
    <Card className="border-orange-200 bg-orange-50 mb-6">
      <CardHeader>
        <CardTitle className="text-orange-800 flex items-center gap-2">
          <span className="text-2xl">💰</span>
          Price Adjustment Notice
        </CardTitle>
        <CardDescription className="text-orange-700">
          Your quote has been reviewed and requires your approval
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Original Price:</p>
            <p className="text-2xl font-bold text-gray-800">
              ${approvalData?.original_price?.toFixed(2)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Updated Price:</p>
            <p className="text-2xl font-bold text-orange-600">
              ${approvalData?.adjusted_price?.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 border border-orange-200 mb-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Price Increase:</p>
          <p className="text-lg font-semibold text-orange-700">
            +${approvalData?.price_increase?.toFixed(2)}
          </p>
        </div>

        {approvalData?.adjustment_reason && (
          <div className="bg-white rounded-lg p-3 border border-orange-200">
            <p className="text-sm font-medium text-gray-600 mb-2">Reason for Adjustment:</p>
            <p className="text-gray-800">{approvalData.adjustment_reason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
