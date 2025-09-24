import React, { useState, useEffect } from "react";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import { Button } from "./ui/button";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ProtectedAdmin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('admin_token');
    
    if (!token) {
      setIsAuthenticated(false);
      setIsChecking(false);
      return;
    }

    try {
      await axios.get(`${API}/admin/verify?token=${token}`);
      setIsAuthenticated(true);
    } catch (error) {
      // Token is invalid, remove it
      localStorage.removeItem('admin_token');
      setIsAuthenticated(false);
    }
    setIsChecking(false);
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
    toast.success("Logged out successfully");
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center">
        <div className="text-white text-xl">Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="relative">
      {/* Logout Button */}
      <div className="fixed top-4 right-4 z-50">
        <Button 
          onClick={handleLogout}
          variant="outline"
          className="bg-white/90 border-red-200 text-red-700 hover:bg-red-50"
          data-testid="admin-logout-btn"
        >
          🚪 Logout
        </Button>
      </div>
      
      <AdminDashboard />
    </div>
  );
};

export default ProtectedAdmin;