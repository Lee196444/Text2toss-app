import React from "react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";

/** Address / Email / Phone inputs with inline field-error styling. */
export default function ContactFields({ bookingData, setBookingData, fieldErrors, setFieldErrors }) {
  const clearError = (key) => setFieldErrors({ ...fieldErrors, [key]: false });

  const errClass = "border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
        <span className="text-2xl">📍</span>
        <h3 className="text-xl font-bold text-gray-800">Contact Details</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Address */}
        <div className="space-y-2 md:col-span-2">
          <Label className="text-base font-semibold text-gray-700">
            Pickup Address {fieldErrors.address && <span className="text-red-600">*Required</span>}
          </Label>
          <Textarea
            placeholder="Enter your full address..."
            value={bookingData.address}
            onChange={(e) => {
              setBookingData({ ...bookingData, address: e.target.value });
              clearError("address");
            }}
            className={`min-h-[80px] border-2 resize-none text-base ${fieldErrors.address ? errClass : ""}`}
            data-testid="address-textarea"
          />
          {fieldErrors.address && (
            <p className="text-red-600 text-sm font-medium flex items-center gap-1">
              <span>⚠️</span> Please enter your pickup address
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label className="text-base font-semibold text-gray-700">
            Email Address {fieldErrors.email && <span className="text-red-600">*Required</span>}
          </Label>
          <Input
            type="email"
            placeholder="your.email@example.com"
            value={bookingData.email}
            onChange={(e) => {
              setBookingData({ ...bookingData, email: e.target.value });
              clearError("email");
            }}
            className={`h-12 border-2 text-base ${fieldErrors.email ? errClass : ""}`}
            data-testid="email-input"
          />
          {fieldErrors.email && (
            <p className="text-red-600 text-sm font-medium flex items-center gap-1">
              <span>⚠️</span> Please enter your email address
            </p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label className="text-base font-semibold text-gray-700">
            Phone Number {fieldErrors.phone && <span className="text-red-600">*Required</span>}
          </Label>
          <Input
            type="tel"
            placeholder="(555) 123-4567"
            value={bookingData.phone}
            onChange={(e) => {
              setBookingData({ ...bookingData, phone: e.target.value });
              clearError("phone");
            }}
            className={`h-12 border-2 text-base ${fieldErrors.phone ? errClass : ""}`}
            data-testid="phone-input"
          />
          {fieldErrors.phone && (
            <p className="text-red-600 text-sm font-medium flex items-center gap-1">
              <span>⚠️</span> Please enter your phone number
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
