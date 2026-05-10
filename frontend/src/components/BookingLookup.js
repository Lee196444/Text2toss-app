import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Link } from 'react-router-dom';
import axios from 'axios';
import BookingJourneyProgress from './customer/BookingJourneyProgress';
import SiteFooter from './SiteFooter';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const statusConfig = {
  pending_payment: { label: 'Awaiting Payment', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  pending_customer_approval: { label: 'Under Review', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  scheduled: { label: 'Scheduled', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-300' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 border-purple-300' },
};

export default function BookingLookup() {
  const [email, setEmail] = useState('');
  const [bookings, setBookings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookupBookings = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/bookings/lookup`, { params: { email: email.trim() } });
      setBookings(res.data);
    } catch (err) {
      setError('Unable to look up bookings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="booking-lookup-page">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex justify-between items-center h-14">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T2T</span>
              </div>
              <span className="text-lg font-extrabold tracking-tight text-gray-900">Text2toss</span>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="rounded-full border-gray-200 text-sm">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Track Your Booking</h1>
          <p className="text-gray-500">Enter your email to check your booking status</p>
        </div>

        {/* Search */}
        <form onSubmit={lookupBookings} className="flex gap-2 mb-8">
          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base rounded-xl border-gray-200"
            required
            data-testid="lookup-email-input"
          />
          <Button
            type="submit"
            disabled={loading}
            className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-semibold whitespace-nowrap"
            data-testid="lookup-submit-btn"
          >
            {loading ? 'Searching...' : 'Look Up'}
          </Button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center mb-6">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {bookings !== null && (
          <div className="space-y-4">
            {bookings.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-gray-500 font-medium">No bookings found for this email</p>
                <p className="text-gray-400 text-sm mt-1">Make sure you entered the same email used when booking</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-2">{bookings.length} booking{bookings.length > 1 ? 's' : ''} found</p>
                {bookings.map((booking) => {
                  const status = statusConfig[booking.status] || { label: booking.status, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <Card key={booking.id} className="border border-gray-100 hover:border-emerald-200 transition-colors" data-testid="booking-result-card">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg text-gray-900">
                              {booking.pickup_date ? new Date(booking.pickup_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'}
                            </CardTitle>
                            <CardDescription>{booking.pickup_time || 'Time TBD'}</CardDescription>
                          </div>
                          <Badge className={`${status.color} border text-xs font-semibold`}>{status.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
                        <BookingJourneyProgress
                          status={booking.status}
                          paymentStatus={booking.payment_status}
                          approvalStatus={booking.quote_details?.approval_status}
                          compact
                        />
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-400">Address</span>
                            <p className="text-gray-700 font-medium">{booking.address || '—'}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Quote</span>
                            <p className="text-gray-700 font-medium">
                              ${booking.quote_details?.approved_price || booking.quote_details?.total_price || '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-400">Booking ID</span>
                            <p className="text-gray-700 font-mono text-xs">{booking.id?.substring(0, 12)}...</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Quote Status</span>
                            <p className="text-gray-700 font-medium capitalize">{booking.quote_details?.approval_status?.replace('_', ' ') || '—'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
