import React from "react";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";

/** Custom checkbox with internal styling — used for curbside + email opt-in. */
function CustomCheckbox({ checked, color = "emerald" }) {
  const colorMap = {
    emerald: "bg-emerald-500 border-emerald-500",
    blue: "bg-blue-500 border-blue-500",
  };
  return (
    <div className="mt-1 flex-shrink-0">
      <div
        className={`w-7 h-7 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all duration-200 ${
          checked ? colorMap[color] : "bg-white border-gray-400"
        }`}
      >
        {checked && (
          <svg
            className="w-5 h-5 sm:w-4 sm:h-4 text-white"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        )}
      </div>
    </div>
  );
}

/** Curbside confirmation, email-notifications opt-in, and free-form instructions. */
export default function RequirementsSection({ bookingData, setBookingData, fieldErrors, setFieldErrors }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
        <span className="text-2xl">✓</span>
        <h3 className="text-xl font-bold text-gray-800">Requirements</h3>
      </div>

      {/* Curbside confirmation */}
      <div
        className={`bg-amber-50 border-2 rounded-xl p-4 ${
          fieldErrors.curbside_confirmed ? "border-red-500 bg-red-50" : "border-amber-200"
        }`}
      >
        <div
          onClick={() => {
            setBookingData({ ...bookingData, curbside_confirmed: !bookingData.curbside_confirmed });
            setFieldErrors({ ...fieldErrors, curbside_confirmed: false });
          }}
          className="flex items-start gap-3 sm:gap-4 cursor-pointer"
          data-testid="curbside-confirm-toggle"
        >
          <CustomCheckbox checked={bookingData.curbside_confirmed} color="emerald" />
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-base">
              Items are curbside & ground level{" "}
              {fieldErrors.curbside_confirmed && <span className="text-red-600">*Required</span>}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              All items must be accessible from street level without stairs
            </p>
            {fieldErrors.curbside_confirmed && (
              <p className="text-red-600 text-sm font-medium flex items-center gap-1 mt-2">
                <span>⚠️</span> You must confirm curbside placement to proceed
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Email notifications */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div
          onClick={() => setBookingData({ ...bookingData, email_notifications: !bookingData.email_notifications })}
          className="flex items-start gap-3 sm:gap-4 cursor-pointer"
          data-testid="email-notifications-toggle"
        >
          <CustomCheckbox checked={bookingData.email_notifications} color="blue" />
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-base">📧 Get Email Updates (Recommended)</p>
            <p className="text-sm text-gray-600 mt-1">
              Receive booking confirmation, payment reminders, and job updates via email
            </p>
          </div>
        </div>
      </div>

      {/* Special instructions */}
      <div className="space-y-2">
        <Label className="text-base font-semibold text-gray-700">Special Instructions (Optional)</Label>
        <Textarea
          placeholder="Any additional details we should know..."
          value={bookingData.special_instructions}
          onChange={(e) => setBookingData({ ...bookingData, special_instructions: e.target.value })}
          className="min-h-[80px] border-2 resize-none text-base"
          data-testid="special-instructions-textarea"
        />
      </div>
    </div>
  );
}
