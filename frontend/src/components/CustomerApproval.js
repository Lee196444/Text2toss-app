import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CustomerApproval = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [approvalData, setApprovalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchApprovalDetails();
  }, [token]);

  const fetchApprovalDetails = async () => {
    try {
      const response = await axios.get(`${API}/customer-approval/${token}`);
      setApprovalData(response.data);
    } catch (error) {
      console.error('Error fetching approval details:', error);
      setError(error.response?.data?.detail || 'Failed to load approval details');
    } finally {
      setLoading(false);
    }
  };

  const submitApproval = async (approved) => {
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/customer-approval/${token}`, {
        booking_id: approvalData.booking_id,
        approved: approved,
        customer_notes: customerNotes
      });
      
      setSubmitted(true);
      
      // Redirect after 5 seconds
      setTimeout(() => {
        navigate('/');
      }, 5000);
      
    } catch (error) {
      console.error('Error submitting approval:', error);
      setError(error.response?.data?.detail || 'Failed to submit approval');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading approval details...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardHeader className="text-center">
            <CardTitle className="text-red-700 flex items-center justify-center gap-2">
              <span className="text-2xl">⚠️</span>
              Approval Request Error
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button 
              onClick={() => navigate('/')}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-green-200 bg-green-50">
          <CardHeader className="text-center">
            <CardTitle className="text-green-800 flex items-center justify-center gap-2">
              <span className="text-2xl">✅</span>
              Response Submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-green-700 mb-4">
              Thank you for your response! You will receive an SMS confirmation shortly.
            </p>
            <div className="text-sm text-green-600">
              Redirecting to homepage in 5 seconds...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
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

        {/* Price Adjustment Notice */}
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
                <p className="text-2xl font-bold text-gray-800">${approvalData?.original_price?.toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-600">Updated Price:</p>
                <p className="text-2xl font-bold text-orange-600">${approvalData?.adjusted_price?.toFixed(2)}</p>
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

        {/* Job Details */}
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
                <span className="font-medium">
                  {new Date(approvalData?.pickup_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
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

        {/* Customer Notes */}
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
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Button
            onClick={() => submitApproval(true)}
            disabled={submitting}
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
            onClick={() => submitApproval(false)}
            disabled={submitting}
            variant="outline"
            className="border-2 border-red-400 text-red-600 hover:bg-red-50 hover:text-red-700 py-4 text-lg font-semibold rounded-xl transition-all duration-300"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">❌</span>
              Decline & Cancel Job
            </div>
          </Button>
        </div>

        {/* Important Notice */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CustomerApproval;