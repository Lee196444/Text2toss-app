import React, { useState, useEffect, useCallback } from "react";
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
  const [adminDisplayName, setAdminDisplayName] = useState("Admin");

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/verify`, { withCredentials: true });
      setIsAuthenticated(true);
      setAdminDisplayName(res.data.display_name || "Admin");
    } catch (err) {
      console.error("Auth check failed:", err.message);
      setIsAuthenticated(false);
    }
    setIsChecking(false);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleLoginSuccess = (displayName) => {
    setAdminDisplayName(displayName || "Admin");
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/admin/logout`, {}, { withCredentials: true });
    } catch (err) {
      console.error("Logout request failed:", err.message);
    }
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
      <div className="fixed top-4 right-4 z-50">
        <Button 
          onClick={handleLogout}
          variant="outline"
          className="bg-white/90 border-red-200 text-red-700 hover:bg-red-50"
          data-testid="admin-logout-btn"
        >
          Logout
        </Button>
      </div>
      
      <AdminDashboard adminDisplayName={adminDisplayName} onLogout={handleLogout} />
    </div>
  );
};

export default ProtectedAdmin;
