import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import IdentifyPage from './pages/IdentifyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PlantsPage from './pages/PlantsPage.jsx';

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<IdentifyPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/plants" element={<RequireAuth><PlantsPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      </Routes>
    </>
  );
}
