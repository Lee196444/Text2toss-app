import { useState, useCallback } from "react";
import axiosBase from "axios";
import { toast } from "../../lib/toast";
import { logger } from "../../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const axios = axiosBase.create({ withCredentials: true });

// Admin email center: compose state, reminders, confirmations, CSV export (moved verbatim out of AdminDashboard).
export default function useEmailCenter() {
  const [emailCompose, setEmailCompose] = useState({
    to: '',
    subject: '',
    message: ''
  });

  const [sendingEmail, setSendingEmail] = useState(false);

  const exportJobContacts = async () => {
    try {
      const response = await axios.get(`${API}/admin/export-job-contacts`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job-contacts-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Contact list exported successfully!");
    } catch (error) {
      toast.error("Failed to export contacts");
      logger.error('Export error:', error);
    }
  };

  const sendBulkEmailReminder = async () => {
    try {
      const response = await axios.post(`${API}/admin/send-bulk-email-reminder`);
      
      if (response.data.success) {
        toast.success(`Sent ${response.data.sent_count} email(s). ${response.data.failed_count} failed.`);
      } else {
        toast.error("Failed to send bulk emails");
      }
    } catch (error) {
      toast.error("Bulk email sending failed");
      logger.error('Bulk email error:', error);
    }
  };

  const sendBookingConfirmationEmail = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/admin/send-booking-confirmation-email/${bookingId}`);
      
      if (response.data.success) {
        toast.success("Booking confirmation email sent!");
      } else {
        toast.error("Failed to send email");
      }
    } catch (error) {
      toast.error("Email sending failed");
      logger.error('Email send error:', error);
    }
  };

  const sendPaymentReminder = async (bookingId) => {
    try {
      const response = await axios.post(`${API}/bookings/${bookingId}/payment-reminder`);
      
      if (response.data.success) {
        toast.success("Payment reminder email sent!");
      } else {
        toast.error("Failed to send payment reminder");
      }
    } catch (error) {
      toast.error("Payment reminder failed");
      logger.error('Payment reminder error:', error);
    }
  };

  const sendCustomEmail = async () => {
    if (!emailCompose.to || !emailCompose.subject || !emailCompose.message) {
      toast.error("Please fill in all fields");
      return;
    }

    setSendingEmail(true);
    try {
      const response = await axios.post(`${API}/admin/send-custom-email`, {
        to_email: emailCompose.to,
        subject: emailCompose.subject,
        message: emailCompose.message
      });
      
      if (response.data.success) {
        toast.success("Email sent successfully!");
        setEmailCompose({ to: '', subject: '', message: '' });
      } else {
        toast.error("Failed to send email");
      }
    } catch (error) {
      toast.error("Email sending failed");
      logger.error('Email send error:', error);
    } finally {
      setSendingEmail(false);
    }
  };

  return { emailCompose, setEmailCompose, sendingEmail, setSendingEmail, exportJobContacts, sendBulkEmailReminder, sendBookingConfirmationEmail, sendPaymentReminder, sendCustomEmail };
}
