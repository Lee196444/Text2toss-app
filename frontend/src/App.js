import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedAdmin from "./components/ProtectedAdmin";
import CustomerApproval from "./components/CustomerApproval";
import BookingLookup from "./components/BookingLookup";
import LandingPage from "./pages/LandingPage";
import PayBookingPage from "./pages/PayBookingPage";
import TermsPage from "./pages/legal/TermsPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import RefundPolicyPage from "./pages/legal/RefundPolicyPage";
import PreviewPage from "./PreviewPage";

// Toast notifications - lightweight inline implementation
const showToastNotification = (type, message) => {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 9999;
    max-width: 350px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    ${type === "success" ? "background-color: #10b981;" : "background-color: #ef4444;"}
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4000);
};

// Make available globally so any module can call window.showToast(...)
window.showToast = showToastNotification;

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/admin" element={<ProtectedAdmin />} />
          <Route path="/customer-approval/:token" element={<CustomerApproval />} />
          <Route path="/pay/:bookingId" element={<PayBookingPage />} />
          <Route path="/track" element={<BookingLookup />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
