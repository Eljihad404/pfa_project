// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import AuthPage from './AuthPage';
import MyLayout from './MyLayout';
import AdminDashboard from './AdminDashboard';
function ProtectedRoute({ children }) {
  const { token } = useAuth();
  // If there’s no token, send them back to the login page
  if (!token) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 1) Unprotected login page */}
          <Route path="/" element={<AuthPage />} />

          {/* 2) Protected chatbot layout */}
          <Route 
            path="/chat" 
            element={
              <ProtectedRoute>
                <MyLayout />
              </ProtectedRoute>
            } 
          />
          <Route path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }/>

          {/* 3) Catch-all: redirect to login if they hit an unknown URL */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}