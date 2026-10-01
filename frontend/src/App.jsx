import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from 'react-hot-toast';
import AuthProvider from './auth/AuthProvider.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AppLayout from './components/AppLayout.jsx';

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path='/login' element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path='/' element={<Navigate to='/dashboard' replace />} />
              <Route path='/dashboard' element={<DashboardPage />} />
            </Route>
          </Route>
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
        <Toaster position='top-right' toastOptions={{
          duration: 4500,
          className: 'app-toast',
          style: { borderRadius: '4px', boxShadow: 'none', border: '1px solid #d2d2d0', color: '#000000', fontSize: '0.875rem' },
          success: { iconTheme: { primary: '#000000', secondary: '#e9cad2' } },
          error: { iconTheme: { primary: '#e46f80', secondary: '#000000' } },
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
