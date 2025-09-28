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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLogging, setIsLogging] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error("Please enter both username and password");
      return;
    }

    setIsLogging(true);
    try {
      const response = await axios.post(`${API}/admin/login`, {
        username: username,
        password: password
      });

      if (response.data.success) {
        // Store admin token and user info
        localStorage.setItem('admin_token', response.data.token);
        localStorage.setItem('admin_user', JSON.stringify({
          username: username,
          display_name: response.data.display_name
        }));
        toast.success(`Welcome back, ${response.data.display_name}!`);
        onLoginSuccess();
      }
    } catch (error) {
      toast.error("Invalid username or password");
      setUsername("");
      setPassword("");
    }
    setIsLogging(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center px-4 sm:px-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl sm:text-2xl font-bold">🔐</span>
          </div>
          <CardTitle className="text-xl sm:text-2xl">Admin Access</CardTitle>
          <CardDescription className="text-sm sm:text-base">Enter the admin password to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-sm sm:text-base">Admin Password</Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="admin-password-input"
                autoComplete="current-password"
                className="h-11 sm:h-12 text-base"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 sm:h-12 text-sm sm:text-base"
              disabled={isLogging}
              data-testid="admin-login-btn"
            >
              {isLogging ? "Logging in..." : "Access Dashboard"}
            </Button>
            
            <div className="text-center">
              <p className="text-xs sm:text-sm text-gray-600">
                Default password: <span className="font-mono bg-gray-100 px-1 sm:px-2 py-1 rounded text-xs sm:text-sm">admin123</span>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;