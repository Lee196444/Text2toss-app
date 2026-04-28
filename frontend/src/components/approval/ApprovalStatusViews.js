import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
    <Card className="w-full max-w-md">{children}</Card>
  </div>
);

export function LoadingState() {
  return (
    <Shell>
      <CardContent className="pt-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading approval details...</p>
        </div>
      </CardContent>
    </Shell>
  );
}

export function ErrorState({ error, onReturnHome }) {
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
            onClick={onReturnHome}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
            data-testid="approval-error-home-btn"
          >
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function SubmittedState() {
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
          <div className="text-sm text-green-600">Redirecting to homepage in 5 seconds...</div>
        </CardContent>
      </Card>
    </div>
  );
}
