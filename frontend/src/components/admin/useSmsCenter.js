import { useState, useCallback } from "react";
import axiosBase from "axios";
import { toast } from "../../lib/toast";
import { logger } from "../../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const axios = axiosBase.create({ withCredentials: true });

// Admin SMS center: inbox fetch + send (moved verbatim out of AdminDashboard).
export default function useSmsCenter() {
  const [smsMessages, setSmsMessages] = useState([]);

  const [smsLoading, setSmsLoading] = useState(false);

  const [newSmsMessage, setNewSmsMessage] = useState('');

  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');

  const fetchSmsMessages = useCallback(async () => {
    setSmsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/sms-messages`);
      setSmsMessages(response.data.messages || []);
    } catch (error) {
      toast.error("Failed to load SMS messages");
    }
    setSmsLoading(false);
  }, []);

  const sendSmsMessage = async () => {
    if (!selectedCustomerPhone || !newSmsMessage.trim()) {
      toast.error("Please select a customer and enter a message");
      return;
    }

    try {
      const response = await axios.post(`${API}/admin/send-sms`, {
        phone: selectedCustomerPhone,
        message: newSmsMessage.trim()
      });
      
      if (response.data.success) {
        toast.success("SMS sent successfully!");
        setNewSmsMessage('');
        fetchSmsMessages(); // Refresh messages
      } else {
        toast.error("Failed to send SMS");
      }
    } catch (error) {
      toast.error("SMS sending failed");
      logger.error('SMS send error:', error);
    }
  };

  return { smsMessages, setSmsMessages, smsLoading, setSmsLoading, newSmsMessage, setNewSmsMessage, selectedCustomerPhone, setSelectedCustomerPhone, fetchSmsMessages, sendSmsMessage };
}
