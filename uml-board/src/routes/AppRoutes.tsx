import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getCurrentUserName } from '../lib/currentUser';
import BoardPage from '../pages/BoardPage';
import Debug from '../pages/Debug';
import LoginPage from '../pages/LoginPage';

// Exige un nombre de usuario (la IA del chat necesita saber quién pregunta)
const RequireUser: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const location = useLocation();
  if (!getCurrentUserName()) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return children;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />
      <Route path='/board/host' element={<RequireUser><BoardPage mode="host" /></RequireUser>} />
      <Route path='/board/guest' element={<RequireUser><BoardPage mode="guest" /></RequireUser>} />
      <Route path='/debug' element={<Debug />} />
      <Route path='/' element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRoutes;
