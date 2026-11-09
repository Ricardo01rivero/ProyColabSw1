import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BoardPage from '../pages/BoardPage';
import Debug from '../pages/Debug';
import LoginPage from '../pages/LoginPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />
      <Route path='/board/host' element={<BoardPage mode="host" />} />
      <Route path='/board/guest' element={<BoardPage mode="guest" />} />
      <Route path='/debug' element={<Debug />} />
      <Route path='/' element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRoutes;
