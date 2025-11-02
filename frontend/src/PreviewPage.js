import React, { useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import ImprovedQuoteFlow from "./components/ImprovedQuoteFlow";

const PreviewPage = () => {
  const [showNewFlow, setShowNewFlow] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-white mb-4">
            🎨 Quote Flow Preview
          </h1>
          <p className="text-xl text-gray-300">
            Compare the NEW simplified flow with your current version
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Current Version */}
          <Card className="border-2 border-gray-500">
            <CardHeader className="bg-gray-100">
              <CardTitle className="text-2xl text-gray-800">
                Current Version
              </CardTitle>
              <CardDescription>Your existing quote modal</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="aspect-video bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
                <img 
                  src="/api/placeholder/600/400" 
                  alt="Current quote modal"
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
              <div className="space-y-3 text-sm text-gray-700">
                <p>✓ Image upload + Manual item entry combined</p>
                <p>✓ All options visible at once</p>
                <p>⚠️ Can be overwhelming with many choices</p>
                <p>⚠️ Quote/booking in same modal</p>
              </div>
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => window.open('/', '_blank')}
              >
                View Current Live Version
              </Button>
            </CardContent>
          </Card>

          {/* New Version */}
          <Card className="border-2 border-emerald-500 shadow-lg shadow-emerald-500/20">
            <CardHeader className="bg-emerald-50">
              <CardTitle className="text-2xl text-emerald-800 flex items-center gap-2">
                ✨ NEW Improved Version
                <span className="px-2 py-1 bg-emerald-200 text-emerald-800 text-xs rounded-full font-bold">
                  RECOMMENDED
                </span>
              </CardTitle>
              <CardDescription className="text-emerald-700">
                Clean, simple, step-by-step flow
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="aspect-video bg-emerald-100 rounded-lg mb-4 flex items-center justify-center">
                <div className="text-center p-8">
                  <span className="text-6xl mb-4 block">📸</span>
                  <p className="text-emerald-800 font-semibold">Step-by-Step Wizard</p>
                  <p className="text-emerald-600 text-sm">Upload → Quote → Book</p>
                </div>
              </div>
              <div className="space-y-3 text-sm text-emerald-700">
                <p>✅ Photo-first approach (simplest path)</p>
                <p>✅ Clear progress indicators</p>
                <p>✅ One task at a time (less overwhelming)</p>
                <p>✅ Better error handling & validation</p>
                <p>✅ Mobile-optimized UI</p>
              </div>
              <Button
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                onClick={() => setShowNewFlow(true)}
              >
                🚀 Preview NEW Flow
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Key Improvements Section */}
        <Card className="border-2 border-blue-500 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-2xl text-blue-800">
              🎯 Key Improvements in NEW Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-blue-900 mb-3 text-lg">🎨 UX Improvements</h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li>✓ <strong>Step-by-step wizard</strong> - One task at a time</li>
                  <li>✓ <strong>Progress indicators</strong> - Always know where you are</li>
                  <li>✓ <strong>Photo-first</strong> - Simplest path for customers</li>
                  <li>✓ <strong>Clear CTAs</strong> - Obvious next steps</li>
                  <li>✓ <strong>Better validation</strong> - Prevent errors before they happen</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-blue-900 mb-3 text-lg">🛡️ Error Prevention</h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li>✓ <strong>File size validation</strong> - Max 10MB check</li>
                  <li>✓ <strong>Clear error messages</strong> - User-friendly feedback</li>
                  <li>✓ <strong>Required field indicators</strong> - No confusion</li>
                  <li>✓ <strong>Character limits</strong> - Prevent oversized inputs</li>
                  <li>✓ <strong>Visual confirmation</strong> - See upload success immediately</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Decision Helper */}
        <div className="mt-8 text-center">
          <Card className="border-2 border-yellow-500 bg-yellow-50">
            <CardContent className="pt-6">
              <p className="text-yellow-900 font-semibold mb-4">
                💡 <strong>Recommendation:</strong> The NEW flow is cleaner, simpler, and more error-proof. 
                It guides customers through one step at a time, reducing confusion and abandonment.
              </p>
              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => setShowNewFlow(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 px-8"
                >
                  Preview NEW Flow
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  Compare Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* NEW Flow Modal */}
      {showNewFlow && (
        <ImprovedQuoteFlow onClose={() => setShowNewFlow(false)} />
      )}
    </div>
  );
};

export default PreviewPage;
