import React from "react";
import { Button } from "../ui/button";

/** Approve/decline buttons + the static "Important Notice" footer card. */
export default function ApprovalActions({ submitting, onSubmit }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Button
          onClick={() => onSubmit(true)}
          disabled={submitting}
          data-testid="approval-approve-btn"
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
        >
          {submitting ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Processing...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              Approve New Price
            </div>
          )}
        </Button>

        <Button
          onClick={() => onSubmit(false)}
          disabled={submitting}
          variant="outline"
          data-testid="approval-decline-btn"
          className="border-2 border-red-400 text-red-600 hover:bg-red-50 hover:text-red-700 py-4 text-lg font-semibold rounded-xl transition-all duration-300"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">❌</span>
            Decline & Cancel Job
          </div>
        </Button>
      </div>

      <div className="bg-blue-50 border-blue-200 rounded-lg p-6 border">
        <div className="text-center">
          <p className="text-blue-800 text-sm font-medium mb-2">
            <span className="text-lg">ℹ️</span> Important Notice
          </p>
          <p className="text-blue-700 text-sm leading-relaxed">
            If you approve the new price, your job will proceed as scheduled and you'll receive payment instructions.
            If you decline, your booking will be cancelled with no charges.
            You can always contact us at (928) 853-9619 for questions.
          </p>
        </div>
      </div>
    </>
  );
}
