import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import IdentifyPage from './pages/IdentifyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<IdentifyPage />} />
        <Route path="/login" element={<AuthPage />} />
      </Routes>
    </>
  );
}
