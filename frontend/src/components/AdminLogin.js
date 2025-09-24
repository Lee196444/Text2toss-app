import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminLogin = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!password) {
      toast.error("Please enter the admin password");
      return;
    }

    setIsLogging(true);
    try {
      const response = await axios.post(`${API}/admin/login`, {
        password: password
      });

      if (response.data.success) {
        // Store admin token
        localStorage.setItem('admin_token', response.data.token);
        toast.success("Login successful!");
        onLoginSuccess();
      }
    } catch (error) {
      toast.error("Invalid admin password");
      setPassword("");
    }
    setIsLogging(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">🔐</span>
          </div>
          <CardTitle className="text-2xl">Admin Access</CardTitle>
          <CardDescription>Enter the admin password to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Admin Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="admin-password-input"
                autoComplete="current-password"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={isLogging}
              data-testid="admin-login-btn"
            >
              {isLogging ? "Logging in..." : "Access Dashboard"}
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Default password: <span className="font-mono bg-gray-100 px-2 py-1 rounded">admin123</span>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;