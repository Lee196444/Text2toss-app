import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";

import {
  LoadingState,
  ErrorState,
  SubmittedState,
} from "./approval/ApprovalStatusViews";
import PriceAdjustmentCard from "./approval/PriceAdjustmentCard";
import JobDetailsCard from "./approval/JobDetailsCard";
import ApprovalActions from "./approval/ApprovalActions";
import { logger } from "../utils/logger";


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CustomerApproval = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [approvalData, setApprovalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchApprovalDetails = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/customer-approval/${token}`);
      setApprovalData(response.data);
    } catch (err) {
      logger.error("Error fetching approval details:", err);
      setError(err.response?.data?.detail || "Failed to load approval details");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchApprovalDetails();
  }, [fetchApprovalDetails]);

  const submitApproval = async (approved) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/customer-approval/${token}`, {
        booking_id: approvalData.booking_id,
        approved,
        customer_notes: customerNotes,
      });
      setSubmitted(true);
      setTimeout(() => navigate("/"), 5000);
    } catch (err) {
      logger.error("Error submitting approval:", err);
      setError(err.response?.data?.detail || "Failed to submit approval");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onReturnHome={() => navigate("/")} />;
  if (submitted) return <SubmittedState />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Brand header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">T2T</span>
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">TEXT2TOSS</h1>
              <p className="text-emerald-300 text-sm font-medium">Professional Junk Removal</p>
            </div>
          </div>
        </div>

        <PriceAdjustmentCard approvalData={approvalData} />
        <JobDetailsCard approvalData={approvalData} />

        {/* Customer notes */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Additional Comments (Optional)</CardTitle>
            <CardDescription>
              Let us know if you have any questions or concerns about the price adjustment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Your comments or questions..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="min-h-[100px]"
              data-testid="approval-customer-notes"
            />
          </CardContent>
        </Card>

        <ApprovalActions submitting={submitting} onSubmit={submitApproval} />
      </div>
    </div>
  );
};

export default CustomerApproval;
